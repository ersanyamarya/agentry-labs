// `agentry mcp add` and `agentry mcp set`: create an MCP server, or change the env and args of an existing user-scope one.
//
// add:  user scope (default) runs `claude mcp add-json <name> <json> --scope user`, project scope adds the entry to the
//       project's .mcp.json (created when missing) as a text edit. A server named <name> in that scope is refused (never
//       overwritten). Project servers still need Claude Code's own approval on first use.
// set:  user scope only; edits the `env` and `args` of the entry in ~/.claude.json as a text edit (src/lib/json-edit.ts), so the
//       rest of the file stays byte for byte. --env K=V sets or replaces, --unset-env K removes, --arg replaces the whole args list.
//       Plugin, project, local and desktop servers are refused with who manages them.
//
// Both go through the fix engine (src/lib/fix.ts): masked preview (env and header values, tokens in URLs and arguments never
// show), confirm or --yes, a backup of the file first, `agentry fix --undo`. `claude mcp add-json` takes the JSON as an
// argument, so for the moment it runs the secrets are visible in this machine's process list (same as src/lib/mcp-toggle.ts).
// Exit codes: 0 done, previewed, declined or already so; 1 refused or failed; 2 usage.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createFix } from "./fix.js";
import { isObject, readJson } from "./inventory/common.js";
import { createMcpReader } from "./inventory/mcp.js";
import { createJsonEdit } from "./json-edit.js";
import { summarize } from "./mcp-toggle.js";
import { messages } from "./messages.js";
import type { Paths } from "./paths.js";
import type {
  DoctorLike,
  Finding,
  FixOptions,
  FixRegistry,
  McpJson,
  McpServerRaw,
  RunCommand,
} from "./types.js";

const RULE = "mcp-edit";
const PLACEHOLDER = "<new config>";
const words = messages().core.mcpEdit;
export const APPLIES_NOTE = messages().core.appliesNote;
const NAME = /^[A-Za-z0-9_.:-]+$/;

// "K=V" (env) or "K:V" (header) items → { map } or { error }. The first separator splits; the value may contain more.
export const parsePairs = (
  items: unknown[] | undefined,
  separator: string,
  what: string
):
  | { map: Record<string, string>; error?: undefined }
  | { error: string; map?: undefined } => {
  const map: Record<string, string> = {};
  for (const item of items ?? []) {
    const at = String(item).indexOf(separator);
    const key = at > 0 ? String(item).slice(0, at).trim() : "";
    if (!key) {
      return {
        error: words.pairNeeds(
          what,
          separator === "=" ? "KEY=VALUE" : "KEY:VALUE",
          String(item).split(separator)[0]
        ),
      };
    }
    map[key] = String(item)
      .slice(at + 1)
      .trim();
  }
  return { map };
};

const MANAGED_BY: Record<string, string> = words.managedBy;

export interface McpEditOptions extends FixOptions {
  platform?: NodeJS.Platform;
}

/** The server config as flags give it: command servers take args and env, url servers headers. */
export interface BuildArgs {
  args?: string[];
  command?: string;
  env?: string[];
  headers?: string[];
  url?: string;
}

export interface AddArgs extends BuildArgs {
  dryRun?: boolean;
  name?: string;
  path?: string;
  scope?: string;
  yes?: boolean;
}

export interface SetArgs {
  args?: string[];
  dryRun?: boolean;
  env?: string[];
  name?: string;
  path?: string;
  unsetEnv?: string[];
  yes?: boolean;
}

export const createMcpEdit = (
  paths: Paths,
  { out = console.log, err = console.error, ...fixOptions }: McpEditOptions = {}
) => {
  const reader = createMcpReader(paths, {
    platform: fixOptions.platform ?? process.platform,
  });
  const tilde = (text: unknown): string =>
    paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text);
  const userRaw = (name: string): McpServerRaw | undefined => {
    const raw = readJson<McpJson>(paths.claudeJson, [])?.mcpServers?.[name];
    return isObject(raw) ? raw : undefined;
  };
  const spawn: RunCommand =
    fixOptions.runCommand ??
    ((command, options) => {
      const result = spawnSync(command[0], command.slice(1), {
        cwd: options.cwd,
        encoding: "utf8",
      });
      return {
        status: result.error ? null : result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        error: (result.error as NodeJS.ErrnoException | undefined)?.code,
      };
    });

  // → { raw } for the server config, or { error }; command servers take args and env, url servers headers.
  const build = ({
    command,
    args = [],
    env = [],
    url,
    headers = [],
  }: BuildArgs):
    | { raw: McpServerRaw; error?: undefined }
    | { error: string; raw?: undefined } => {
    if ((command === undefined) === (url === undefined)) {
      return { error: words.exactlyOne };
    }
    const [envPairs, headerPairs] = [
      parsePairs(env, "=", "--env"),
      parsePairs(headers, ":", "--header"),
    ];
    if (envPairs.error !== undefined) {
      return { error: envPairs.error };
    }
    if (headerPairs.error !== undefined) {
      return { error: headerPairs.error };
    }
    if (command !== undefined) {
      if (!command.trim() || headers.length > 0) {
        return {
          error: headers.length > 0 ? words.headerWithUrl : words.commandEmpty,
        };
      }
      return {
        raw: {
          type: "stdio",
          command,
          args: [...args],
          ...(Object.keys(envPairs.map).length > 0 && { env: envPairs.map }),
        },
      };
    }
    if (
      !/^https?:\/\/\S+$/.test(url as string) ||
      args.length > 0 ||
      env.length > 0
    ) {
      return {
        error:
          args.length > 0 || env.length > 0
            ? words.argEnvWithCommand
            : words.urlInvalid,
      };
    }
    return {
      raw: {
        type: "http",
        url,
        ...(Object.keys(headerPairs.map).length > 0 && {
          headers: headerPairs.map,
        }),
      },
    };
  };

  const add = async ({
    name,
    scope = "user",
    path,
    yes = false,
    dryRun = false,
    ...config
  }: AddArgs): Promise<number> => {
    const cwd = resolve(path ?? process.cwd());
    if (!(name && NAME.test(name))) {
      err(words.addUsage);
      return 2;
    }
    if (scope !== "user" && scope !== "project") {
      err(words.scopeInvalid);
      return 2;
    }
    const built = build(config);
    if (built.error !== undefined) {
      err(built.error);
      return 2;
    }
    const { raw } = built;
    const file =
      scope === "user"
        ? paths.claudeJson
        : join(paths.projectRoot(cwd), ".mcp.json");
    const exists = () =>
      scope === "user"
        ? Boolean(userRaw(name))
        : isObject(readJson<McpJson>(file, [])?.mcpServers?.[name]);
    if (exists()) {
      err(words.refusedExists(scope, name));
      return 1;
    }
    if (scope === "project" && !existsSync(dirname(file))) {
      err(words.refusedNoDir(tilde(dirname(file))));
      return 1;
    }
    const finding: Finding = {
      id: RULE,
      severity: "info",
      message: `${name} should exist in ${scope} scope`,
      file,
    };
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: paths.projectRoot(cwd) },
        findings: exists() ? [] : [finding],
        errors: [],
      }),
    });
    const editText = (text: string | undefined): string => {
      if (text === undefined || text.trim() === "") {
        return `${JSON.stringify({ mcpServers: { [name]: raw } }, null, "\t")}\n`;
      }
      const doc = createJsonEdit(text);
      // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
      doc.get(["mcpServers"]) === undefined
        ? doc.set(["mcpServers"], { [name]: raw })
        : doc.set(["mcpServers", name], raw);
      return doc.text;
    };
    const fixes: FixRegistry = {
      [RULE]: () => ({
        ruleId: RULE,
        file,
        describe: () => words.describeAdd(scope, name, summarize(raw)),
        apply:
          scope === "user"
            ? () => ({
                command: [
                  "claude",
                  "mcp",
                  "add-json",
                  name,
                  PLACEHOLDER,
                  "--scope",
                  "user",
                ],
                cwd: paths.home ?? cwd,
              })
            : editText,
      }),
    };
    // Runs at apply time only (after the preview and the confirm).
    const runCommand: RunCommand = (command, options) =>
      spawn(
        command.map((part) =>
          part === PLACEHOLDER ? JSON.stringify(raw) : part
        ),
        options
      );
    const code = await createFix(paths, {
      out,
      err,
      doctor,
      fixes,
      ...fixOptions,
      runCommand,
    }).run({ path: cwd, yes, dryRun });
    if (code === 0 && !dryRun && exists()) {
      out(words.added(name, scope));
    }
    return code;
  };

  // env: ["K=V"...] to set, unsetEnv: ["K"...], args: ["a"...] replaces the list (undefined keeps it).
  const set = async ({
    name,
    env = [],
    unsetEnv = [],
    args,
    path,
    yes = false,
    dryRun = false,
  }: SetArgs): Promise<number> => {
    const cwd = resolve(path ?? process.cwd());
    const parsed = parsePairs(env, "=", "--env");
    const { error } = parsed;
    const setEnv = parsed.map ?? {};
    if (
      !name ||
      error ||
      (env.length === 0 && unsetEnv.length === 0 && args === undefined)
    ) {
      err(error ?? words.setUsage);
      return 2;
    }
    const current = userRaw(name);
    if (!current) {
      const other = reader
        .read({ cwd })
        .servers.find((server) => server.name === name);
      err(
        other
          ? words.notEditable(
              name,
              MANAGED_BY[other.scope] ?? words.aServer(other.scope)
            )
          : words.noUserServer(name)
      );
      return 1;
    }
    const stdio = typeof current.command === "string";
    if (
      !stdio &&
      (env.length > 0 || unsetEnv.length > 0 || args !== undefined)
    ) {
      err(words.urlServer(name));
      return 1;
    }
    const nextEnv = (from: unknown): Record<string, unknown> => {
      const merged = { ...(isObject(from) ? from : {}), ...setEnv };
      // biome-ignore lint/complexity/noForEach: forEach with a simple side-effect callback; same behaviour as for-of
      // biome-ignore lint/suspicious/useIterableCallbackReturn: the callback is a side effect and its return value is unused by forEach
      unsetEnv.forEach((key) => delete merged[key]);
      return merged;
    };
    const wanted = (raw: McpServerRaw): boolean =>
      JSON.stringify(nextEnv(raw.env)) ===
        JSON.stringify(isObject(raw.env) ? raw.env : {}) &&
      (args === undefined ||
        JSON.stringify(args) === JSON.stringify(raw.args ?? []));
    if (wanted(current)) {
      out(words.nothingToChange(name));
      return 0;
    }
    const file = paths.claudeJson;
    const finding: Finding = {
      id: RULE,
      severity: "info",
      message: `${name} env/args should be changed`,
      file,
    };
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: paths.projectRoot(cwd) },
        findings: wanted(userRaw(name) ?? current) ? [] : [finding],
        errors: [],
      }),
    });
    const parts = [
      ...(env.length > 0 ? [words.setEnv(Object.keys(setEnv).join(", "))] : []),
      ...(unsetEnv.length > 0 ? [words.unsetEnv(unsetEnv.join(", "))] : []),
      ...(args === undefined ? [] : [words.replaceArgs(args.length)]),
    ];
    const fixes: FixRegistry = {
      [RULE]: () => ({
        ruleId: RULE,
        file,
        describe: () => words.describeSet(name, parts.join("; ")),
        apply: (text: string | undefined) => {
          const doc = createJsonEdit(text as string);
          const now = doc.get(["mcpServers", name]);
          if (!isObject(now)) {
            return text;
          }
          const merged = nextEnv(now.env);
          if (
            JSON.stringify(merged) !==
            JSON.stringify(isObject(now.env) ? now.env : {})
          ) {
            if (Object.keys(merged).length === 0) {
              doc.deleteKey(["mcpServers", name, "env"]);
            } else {
              doc.set(["mcpServers", name, "env"], merged);
            }
          }
          if (args !== undefined) {
            doc.set(["mcpServers", name, "args"], args);
          }
          return doc.text;
        },
      }),
    };
    const code = await createFix(paths, {
      out,
      err,
      doctor,
      fixes,
      ...fixOptions,
    }).run({ path: cwd, yes, dryRun });
    if (code === 0 && !dryRun) {
      out(words.updated(name));
    }
    return code;
  };

  return { add, set, build };
};
