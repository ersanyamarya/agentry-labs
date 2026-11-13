// `agentry mcp disable|enable <name>` and `mcp list-parked`: switch a USER-scope MCP server off and back on.
// Claude Code has no global off switch for them (see the Phase 8 Decisions log), so "disable" parks the server: its full
// config is saved, then `claude mcp remove <name> --scope user` removes it; "enable" runs `claude mcp add-json`
// with the saved config and, once the server reads back, drops the saved copy. Only user scope (top-level `mcpServers` in
// ~/.claude.json) is handled; plugin, project `.mcp.json`, local and desktop servers are refused with who manages them.
//
// Parked store: `paths.parkedMcp` (<config dir>/agentry/parked-mcp.json), { version: 1, servers: { <name>: { config, parkedAt } } },
// written atomically with mode 0600 in a 0700 folder. It holds the raw env and header values, so it is exactly as sensitive as
// ~/.claude.json itself (secrets at rest, unencrypted). It is never printed, logged, diffed or put in a backup manifest:
// previews and the UI show only masked summaries (src/lib/mask.ts). Do not commit or sync it.
//
// The commands run through the fix engine (src/lib/fix.ts): masked preview, confirm (or --yes), a backup of ~/.claude.json first
// (so `agentry fix --undo` restores the entry), then verify. The engine's runCommand is wrapped so that
//   disable: saves the parked copy and reads it back BEFORE the remove; if that fails nothing is removed. If the remove then
//            fails, the parked copy stays (a re-run with the same config is accepted).
//   enable:  the preview shows a placeholder; the real JSON is substituted only when the command runs. `claude mcp add-json`
//            takes the JSON as an argument (no stdin or file option), so for the moment it runs the secrets are visible in the
//            process list of this machine.
// Undo restores the whole ~/.claude.json from the backup, so anything Claude Code wrote there since is lost with it.
// Exit codes: 0 done, previewed, declined or already so; 1 refused or failed; 2 usage.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { atomicWrite, createFix } from "./fix.js";
import { isObject, readJson } from "./inventory/common.js";
import { createMcpReader } from "./inventory/mcp.js";
import { createJsonEdit } from "./json-edit.js";
import { maskArgs, maskCommand, maskHeader, maskMap, maskUrl } from "./mask.js";
import type { Paths } from "./paths.js";
import type {
  ClaudeJson,
  ClaudeProject,
  DoctorLike,
  Finding,
  FixOptions,
  FixRegistry,
  McpServerRaw,
  RunCommand,
} from "./types.js";

const RULE = "mcp-toggle";
const PLACEHOLDER = "<parked config>";
export const APPLIES_NOTE = "Applies to sessions started after this.";

// Plugin, project (.mcp.json) and local servers cannot be removed from here, but Claude Code skips the names listed in
// ~/.claude.json projects.<project>.disabledMcpServers (the same switch /mcp writes), so those are turned off per project.
const PER_PROJECT = new Set(["plugin", "project", "local"]);

const MANAGED_BY: Record<string, string> = {
  "desktop-config": "managed by Claude desktop",
  "desktop-extension": "managed by Claude desktop",
};

// A masked one-line description of a raw config (never the secret values).
export const summarize = (raw: McpServerRaw): string => {
  const bits = [raw.type ?? (raw.url ? "http" : "stdio")];
  if (typeof raw.url === "string") {
    bits.push(maskUrl(raw.url));
  }
  if (raw.command !== undefined) {
    bits.push(
      maskCommand(raw.command),
      ...maskArgs(Array.isArray(raw.args) ? raw.args : [])
    );
  }
  const env = Object.entries(maskMap(raw.env)).map(
    ([key, value]) => `${key}=${value}`
  );
  const headers = Object.entries(maskMap(raw.headers, maskHeader)).map(
    ([key, value]) => `${key}: ${value}`
  );
  return [
    bits.join(" "),
    ...(env.length ? [`env ${env.join(" ")}`] : []),
    ...(headers.length ? [`headers ${headers.join(", ")}`] : []),
  ].join("; ");
};

export interface McpToggleOptions extends FixOptions {
  platform?: NodeJS.Platform;
}

/** The parked store: raw configs (secrets included) of user-scope servers taken out of ~/.claude.json. */
export interface ParkedStore {
  servers: Record<string, { config?: unknown; parkedAt?: string } | undefined>;
  version: number;
}

/** What `inspect` found: a refusal (with exit code), a per-project switch (`projectOff`), or a user-scope server to park/restore. */
export type Inspected =
  | {
      refusal: string;
      code: number;
      projectOff?: undefined;
      raw?: undefined;
      cwd?: undefined;
    }
  | {
      name: string;
      enable: boolean;
      cwd: string;
      projectOff: true;
      raw?: undefined;
    }
  | {
      name: string;
      enable: boolean;
      cwd: string;
      raw: McpServerRaw;
      projectOff?: undefined;
    };

export const createMcpToggle = (
  paths: Paths,
  {
    out = console.log,
    err = console.error,
    platform = process.platform,
    ...fixOptions
  }: McpToggleOptions = {}
) => {
  const reader = createMcpReader(paths, { platform });
  const tilde = (text: unknown): string =>
    paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text);

  const userRaw = (name: string): McpServerRaw | undefined => {
    const raw = readJson<ClaudeJson>(paths.claudeJson, [])?.mcpServers?.[name];
    return isObject(raw) ? raw : undefined;
  };

  const readParked = (): ParkedStore => {
    try {
      const store = JSON.parse(
        readFileSync(paths.parkedMcp, "utf8")
      ) as ParkedStore | null;
      return isObject(store?.servers)
        ? (store as ParkedStore)
        : { version: 1, servers: {} };
    } catch {
      return { version: 1, servers: {} };
    }
  };
  const writeParked = (store: ParkedStore): void => {
    mkdirSync(dirname(paths.parkedMcp), { recursive: true, mode: 0o700 });
    atomicWrite(
      paths.parkedMcp,
      `${JSON.stringify(store, null, "\t")}\n`,
      0o600
    );
  };

  // Parked servers for display: names and masked summaries only.
  const listParked = () =>
    Object.entries(readParked().servers).map(([name, entry]) => ({
      name,
      parkedAt: entry?.parkedAt,
      summary: summarize(isObject(entry?.config) ? entry.config : {}),
    }));

  const projectOffList = (cwd: string): unknown[] => {
    const project = readJson<ClaudeJson>(paths.claudeJson, [])?.projects?.[
      paths.repoKey(cwd)
    ] as ClaudeProject | undefined;
    const list = project?.disabledMcpServers;
    return Array.isArray(list) ? list : [];
  };

  // → { name, enable, raw, refusal?, code?, already? }; projectOff: true when the switch is the per-project disabled list
  const inspect = ({
    name,
    enable,
    path,
  }: {
    name: string;
    enable: boolean;
    path?: string;
  }): Inspected => {
    const cwd = resolve(path ?? process.cwd());
    const refuse = (refusal: string, code = 1): Inspected => ({
      refusal,
      code,
    });
    const parked = readParked().servers[name];
    const current = userRaw(name);
    if (!enable) {
      if (!current) {
        const other = reader
          .read({ cwd })
          .servers.find((server) => server.name === name);
        if (other && PER_PROJECT.has(other.scope)) {
          return projectOffList(cwd).includes(name)
            ? refuse(`${name} is already turned off in this project.`, 0)
            : { name, enable, cwd, projectOff: true };
        }
        return refuse(
          other
            ? `${name} is ${MANAGED_BY[other.scope] ?? `a ${other.scope} server this tool does not manage`}.`
            : `No user-scope MCP server "${name}".`
        );
      }
      if (parked && JSON.stringify(parked.config) !== JSON.stringify(current)) {
        return refuse(
          `${name} is already parked with a different config; enable it first or remove the parked entry by hand (${tilde(paths.parkedMcp)}).`
        );
      }
      return { name, enable, raw: current, cwd };
    }
    if (!(parked || current) && projectOffList(cwd).includes(name)) {
      return { name, enable, cwd, projectOff: true };
    }
    if (!(parked && isObject(parked.config))) {
      return refuse(
        `${name} is not parked. Parked: ${Object.keys(readParked().servers).join(", ") || "none"}`
      );
    }
    if (current) {
      return refuse(
        `A user-scope server named ${name} already exists; not overwriting it.`
      );
    }
    return { name, enable, raw: parked.config, cwd };
  };

  // Turn a plugin, project or local server off (or back on) for one project: edits only the disabledMcpServers list.
  const runProjectOff = async ({
    name,
    enable,
    cwd,
    yes,
    dryRun,
  }: {
    name: string;
    enable: boolean;
    cwd: string;
    yes: boolean;
    dryRun: boolean;
  }): Promise<number> => {
    const key = paths.repoKey(cwd);
    const finding: Finding = {
      id: RULE,
      severity: "info",
      message: `${name} should be ${enable ? "on" : "off"} in this project`,
      file: paths.claudeJson,
    };
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: paths.projectRoot(cwd) },
        findings:
          projectOffList(cwd).includes(name) === enable ? [finding] : [],
        errors: [],
      }),
    });
    const fixes: FixRegistry = {
      [RULE]: () => ({
        ruleId: RULE,
        file: paths.claudeJson,
        describe: () =>
          `${enable ? "Turn on" : "Turn off"} MCP server ${name} for ${tilde(key)} (disabledMcpServers in ~/.claude.json)`,
        apply: (text: string | undefined) => {
          const doc = createJsonEdit(text as string);
          const list = (doc.get(["projects", key, "disabledMcpServers"]) ??
            []) as unknown[];
          const next = enable
            ? list.filter((item) => item !== name)
            : [...new Set([...list, name])];
          if (next.length === list.length) {
            return text;
          }
          if (doc.get(["projects", key]) !== undefined) {
            doc.set(["projects", key, "disabledMcpServers"], next);
          } else if (doc.get(["projects"]) === undefined) {
            doc.set(["projects"], { [key]: { disabledMcpServers: next } });
          } else {
            doc.set(["projects", key], { disabledMcpServers: next });
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
      out(
        `${name} is ${enable ? "on" : "off"} for ${tilde(key)}. ${APPLIES_NOTE}`
      );
    }
    return code;
  };

  const run = async ({
    name,
    enable,
    path,
    yes = false,
    dryRun = false,
  }: {
    name: string;
    enable: boolean;
    path?: string;
    yes?: boolean;
    dryRun?: boolean;
  }): Promise<number> => {
    const found = inspect({ name, enable, path });
    if ("refusal" in found) {
      err(`refused: ${found.refusal}`);
      return found.code;
    }
    const { cwd } = found;
    if (found.projectOff) {
      return runProjectOff({ name, enable, cwd, yes, dryRun });
    }
    const { raw } = found;
    const finding: Finding = {
      id: RULE,
      severity: "info",
      message: `${name} should be ${enable ? "back in user scope" : "parked"}`,
      file: paths.claudeJson,
    };
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: paths.projectRoot(cwd) },
        findings: Boolean(userRaw(name)) === enable ? [] : [finding],
        errors: [],
      }),
    });
    const argv = enable
      ? ["claude", "mcp", "add-json", name, PLACEHOLDER, "--scope", "user"]
      : ["claude", "mcp", "remove", name, "--scope", "user"];
    const fixes: FixRegistry = {
      [RULE]: () => ({
        ruleId: RULE,
        file: paths.claudeJson,
        describe: () =>
          `${enable ? "Add back" : "Park"} user MCP server ${name} (${summarize(raw)})`,
        apply: () => ({ command: argv, cwd: paths.home ?? cwd }),
      }),
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
    // Runs at apply time only (after the preview and the confirm).
    const runCommand: RunCommand = (command, options) => {
      if (enable) {
        return spawn(
          command.map((part) =>
            part === PLACEHOLDER ? JSON.stringify(raw) : part
          ),
          options
        );
      }
      try {
        const store = readParked();
        store.servers[name] = {
          config: raw,
          parkedAt: (fixOptions.now?.() ?? new Date()).toISOString(),
        };
        writeParked(store);
        if (
          JSON.stringify(readParked().servers[name]?.config) !==
          JSON.stringify(raw)
        ) {
          throw new Error("round trip");
        }
      } catch {
        return {
          status: 1,
          stdout: "",
          stderr: "could not save the parked copy, so nothing was removed",
          error: undefined,
        };
      }
      return spawn(command, options);
    };
    const code = await createFix(paths, {
      out,
      err,
      doctor,
      fixes,
      ...fixOptions,
      runCommand,
    }).run({ path: cwd, yes, dryRun });
    if (code === 0 && !dryRun) {
      if (enable && userRaw(name)) {
        const store = readParked();
        delete store.servers[name];
        writeParked(store);
        out(
          `${name} is back in user scope; its parked copy is deleted. ${APPLIES_NOTE}`
        );
      } else if (!(enable || userRaw(name)) && readParked().servers[name]) {
        out(
          `${name} is parked (saved in ${tilde(paths.parkedMcp)}, mode 0600, secrets included). Switch it back with agentry mcp enable ${name}. ${APPLIES_NOTE}`
        );
      }
    }
    return code;
  };

  // `agentry mcp remove <name>`: delete the server for good. user/local scope run claude mcp remove (no parked copy is kept),
  // a project .mcp.json entry is deleted from that file, a parked copy alone is deleted from the parked store. Plugin and
  // desktop servers are refused with who manages them.
  const remove = async ({
    name,
    path,
    yes = false,
    dryRun = false,
  }: {
    name: string;
    path?: string;
    yes?: boolean;
    dryRun?: boolean;
  }): Promise<number> => {
    const cwd = resolve(path ?? process.cwd());
    const parked = readParked().servers[name];
    const found = reader
      .read({ cwd })
      .servers.find((server) => server.name === name);
    const dropParked = () => {
      const store = readParked();
      delete store.servers[name];
      writeParked(store);
    };
    if (!found && parked) {
      out(
        `would delete the parked copy of ${name} (${summarize(isObject(parked.config) ? parked.config : {})}) from ${tilde(paths.parkedMcp)}`
      );
      if (dryRun) {
        return 0;
      }
      if (!yes) {
        err("Add --yes to delete the parked copy.");
        return 1;
      }
      dropParked();
      out(`${name}: parked copy deleted.`);
      return 0;
    }
    if (!found) {
      err(`refused: No MCP server "${name}".`);
      return 1;
    }
    if (!["user", "local", "project"].includes(found.scope)) {
      err(
        `refused: ${name} is ${MANAGED_BY[found.scope] ?? `a ${found.scope} server this tool does not manage`}${found.scope === "plugin" ? " (remove the plugin, or turn the server off with agentry mcp disable)" : ""}.`
      );
      return 1;
    }
    const target = found.scope === "project" ? found.source : paths.claudeJson;
    const present = () =>
      reader
        .read({ cwd })
        .servers.some(
          (server) => server.name === name && server.scope === found.scope
        );
    const what = `${found.scope} MCP server ${name} (${[found.transport, found.url ? maskUrl(found.url) : [maskCommand(found.command ?? ""), ...maskArgs(found.args ?? [])].join(" ")].join(" ")})`;
    const finding: Finding = {
      id: RULE,
      severity: "info",
      message: `${name} should be removed from ${found.scope} scope`,
      file: target,
    };
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: paths.projectRoot(cwd) },
        findings: present() ? [finding] : [],
        errors: [],
      }),
    });
    const fixes: FixRegistry = {
      [RULE]: () => ({
        ruleId: RULE,
        file: target,
        describe: () => `Remove ${what}`,
        apply:
          found.scope === "project"
            ? (text: string | undefined) => {
                const doc = createJsonEdit(text ?? "");
                if (doc.get(["mcpServers", name]) === undefined) {
                  return text;
                }
                doc.deleteKey(["mcpServers", name]);
                return doc.text;
              }
            : () => ({
                command: [
                  "claude",
                  "mcp",
                  "remove",
                  name,
                  "--scope",
                  found.scope,
                ],
                cwd: found.scope === "user" ? (paths.home ?? cwd) : cwd,
              }),
      }),
    };
    const code = await createFix(paths, {
      out,
      err,
      doctor,
      fixes,
      ...fixOptions,
    }).run({ path: cwd, yes, dryRun });
    if (code === 0 && !dryRun && !present()) {
      if (parked) {
        dropParked();
      }
      out(`${name} is removed from ${found.scope} scope. ${APPLIES_NOTE}`);
    }
    return code;
  };

  return { inspect, run, remove, listParked, readParked };
};

export const parkedFileExists = (paths: Pick<Paths, "parkedMcp">): boolean =>
  existsSync(paths.parkedMcp);
