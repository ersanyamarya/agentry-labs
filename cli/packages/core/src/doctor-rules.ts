// Doctor rules. A rule is `{ id, run(ctx) }`; `run` returns findings `{ id, severity, message, file, line?, fix? }`.
// `ctx` is built by src/lib/doctor.ts from the inventory readers (`skills`, `mcp`, `hooks`, `plugins`, all masked already)
// plus `layers` (settings files), `which(command)`, `launchctlGetenv(name)`, `line(file, needle)` and `renames`.
// Rules only describe fixes (text or a suggested command); nothing here writes. Values are never printed: only names.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { isObject, list, readJson } from "./inventory/common.js";
import { copilotHookEntries, copilotHookFiles } from "./inventory/copilot.js";
import { hookId } from "./inventory/hooks.js";
import {
  looksSecret,
  MASK,
  maskArgs,
  maskHeader,
  maskShell,
  maskUrl,
  maskValue,
} from "./mask.js";
import type { Paths } from "./paths.js";
import type {
  CopilotInventory,
  Finding,
  HookGroup,
  HookItem,
  McpServerItem,
  PluginInstall,
  PluginItem,
  SettingsLayer,
  Severity,
  SkillItem,
} from "./types.js";

/** What every rule gets: the masked inventory, the settings files and a few helpers. Built by lib/doctor.ts. */
export interface DoctorContext {
  /** What GitHub Copilot loads here; every Copilot rule returns nothing when `copilot.present` is false. */
  copilot: CopilotInventory;
  cwd: string;
  hooks: { items: HookItem[] };
  launchctlGetenv: (name: string) => string;
  layers: SettingsLayer[];
  /** The (skip+1)th line (1-based) of `file` that contains `needle`, or undefined. */
  line: (file: string, needle: string, skip?: number) => number | undefined;
  mcp: { servers: McpServerItem[] };
  paths: Paths;
  platform: NodeJS.Platform;
  plugins: { items: PluginItem[] };
  project: { cwd: string; root: string };
  /** Old name -> new name. */
  renames: Record<string, string>;
  skills: { items: SkillItem[] };
  which: (command: string) => boolean;
}

export interface Rule {
  id: string;
  run: (ctx: DoctorContext) => Finding[];
}

const finding = (
  id: string,
  severity: Severity,
  message: string,
  file: string,
  extra: { line?: number | undefined; fix?: string } = {}
): Finding => ({ id, severity, message, file, ...extra });

// Servers that actually start: shadowed, disabled and unapproved entries are not run.
const running = (server: McpServerItem): boolean => server.state === "active";

// ---- duplicates ----

// The installs of one plugin that apply here and should go: all but one, keeping the user-scope install when there is one.
export const extraPluginInstalls = (plugin: PluginItem): PluginInstall[] => {
  const here = plugin.installs.filter((install) => install.appliesHere);
  if (here.length < 2) {
    return [];
  }
  const extra = here.filter((install) => install.scope !== "user");
  return extra.length > 0 ? extra : here.slice(1);
};

const dupPluginScope: Rule = {
  id: "dup-plugin-scope",
  run: ({ plugins, paths }) =>
    plugins.items.flatMap((plugin) => {
      const here = plugin.installs.filter((install) => install.appliesHere);
      if (here.length < 2) {
        return [];
      }
      const scopes = here.map((install) => install.scope);
      const fix = extraPluginInstalls(plugin)
        .map(
          (install) =>
            `${install.projectPath ? `cd ${install.projectPath} && ` : ""}claude plugin uninstall ${plugin.id} --scope ${install.scope}`
        )
        .join("\n");
      return [
        finding(
          "dup-plugin-scope",
          "warning",
          `${plugin.id} is installed at ${scopes.length} scopes that apply here (${scopes.join(", ")}); one install is enough`,
          join(paths.pluginsDir, "installed_plugins.json"),
          { fix: `Keep one install and remove the other:\n${fix}` }
        ),
      ];
    }),
};

const dupSkillName: Rule = {
  id: "dup-skill-name",
  run: ({ skills }) => {
    const byName = new Map<string, SkillItem[]>();
    for (const skill of skills.items.filter(
      (item) => item.state === "active" && item.scope !== "plugin"
    )) {
      byName.set(skill.name, [...(byName.get(skill.name) ?? []), skill]);
    }
    return [...byName].flatMap(([name, copies]) => {
      if (copies.length < 2) {
        return [];
      }
      // Personal beats project, so the project copy is the dead one.
      const ordered = [...copies].sort(
        (a, b) => (a.scope === "user" ? 0 : 1) - (b.scope === "user" ? 0 : 1)
      );
      const loser = ordered.at(-1) as SkillItem;
      return [
        finding(
          "dup-skill-name",
          "warning",
          `Skill "${name}" exists ${copies.length} times in places a session loads: ${copies.map((copy) => `${copy.scope} ${copy.source}`).join("; ")}`,
          loser.source,
          {
            fix: `Delete or unlink the copy you don't want: rm -r "${loser.source}" (a symlink: rm "${loser.source}")`,
          }
        ),
      ];
    });
  },
};

// The winner is always the same or a narrower scope than the shadowed copy (local > project > user), and it is the
// repo's own entry, so the fix targets the winner: the broader copy is shared with other repos and stays.
const dupMcpName: Rule = {
  id: "dup-mcp-scope",
  run: ({ mcp, line }) =>
    mcp.servers
      .filter(
        (server) =>
          server.state === "shadowed" &&
          server.scope !== "plugin" &&
          server.shadowedBy?.name === server.name
      )
      .map((server) => {
        const winner = server.shadowedBy as NonNullable<
          McpServerItem["shadowedBy"]
        >;
        const flag = ["project", "local"].includes(winner.scope)
          ? ` (claude mcp remove ${server.name} -s ${winner.scope})`
          : "";
        return finding(
          "dup-mcp-scope",
          "warning",
          `MCP server "${server.name}" is defined in ${winner.scope} scope (${winner.source}) and also in ${server.scope} scope (${server.source}); the ${winner.scope} entry is the one that loads`,
          winner.source,
          {
            line: line(winner.source, `"${server.name}"`),
            fix: `If both entries do the same thing, remove the "${server.name}" entry from ${winner.source}${flag} and keep the ${server.scope} one that other repos share; otherwise keep the ${winner.scope} entry on purpose and ignore this.`,
          }
        );
      }),
};

const dupMcpPlugin: Rule = {
  id: "dup-mcp-plugin",
  run: ({ mcp, plugins, line }) => {
    const out: Finding[] = [];
    const seen = new Set<string>();
    const standalone = mcp.servers.filter(
      (server) =>
        server.scope !== "plugin" &&
        !["disabled", "rejected"].includes(server.state)
    );
    for (const pluginServer of mcp.servers.filter(
      (server) => server.scope === "plugin"
    )) {
      const plugin = plugins.items.find(
        (item) => item.id === pluginServer.plugin
      );
      if (plugin?.state !== "active") {
        continue;
      }
      const [, pluginName, ...rest] = pluginServer.name.split(":");
      const inner = rest.join(":");
      // A standalone entry named like the plugin or its server, or one the reader found at the plugin server's endpoint.
      const matches = standalone.filter(
        (server) =>
          server.name === inner ||
          server.name === pluginName ||
          (pluginServer.state === "shadowed" &&
            pluginServer.shadowedBy?.name === server.name)
      );
      for (const server of matches) {
        const key = `${server.source}\0${server.name}\0${plugin.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        out.push(
          finding(
            "dup-mcp-plugin",
            "warning",
            `MCP server "${server.name}" (${server.scope}) duplicates the server of enabled plugin ${plugin.id}`,
            server.source,
            {
              line: line(server.source, `"${server.name}"`),
              fix: `Remove the "${server.name}" entry from ${server.source}; the plugin already provides it`,
            }
          )
        );
      }
    }
    return out;
  },
};

// ---- broken references ----

const missingMcpCommand: Rule = {
  id: "missing-mcp-command",
  run: ({ mcp, which, line }) =>
    mcp.servers
      .filter(
        (server) =>
          running(server) &&
          server.command !== undefined &&
          !server.command.includes("${") &&
          !which(server.command)
      )
      .map((server) =>
        finding(
          "missing-mcp-command",
          "error",
          `MCP server "${server.name}" runs "${server.command}", which is not on PATH or does not exist`,
          server.source,
          {
            line: line(server.source, `"${server.name}"`),
            fix: `Install "${server.command}" or remove the server: ${server.scope === "project" || server.scope === "user" || server.scope === "local" ? `claude mcp remove ${server.name} -s ${server.scope}` : `delete the "${server.name}" entry in ${server.source}`}`,
          }
        )
      ),
};

const INTERPRETERS = new Set([
  "node",
  "bash",
  "sh",
  "zsh",
  "python",
  "python3",
  "bun",
  "deno",
  "tsx",
  "ruby",
  "perl",
]);

// The file a hook command runs: its first word, or the first non-flag argument after an interpreter. Undefined when not path-like.
const hookFile = (
  command: string,
  { home, projectRoot }: { home: string; projectRoot: string }
): { written: string; path: string } | undefined => {
  const words = command.split(/\s+/).filter(Boolean);
  while (words.length > 0 && /^[A-Za-z_]\w*=/.test(words[0])) {
    words.shift();
  }
  let word: string | undefined = words[0];
  if (word && INTERPRETERS.has(word.replace(/^.*\//, ""))) {
    word = words.slice(1).find((item) => !item.startsWith("-"));
  }
  word = word?.replace(/^["'`]+|["'`]+$/g, "");
  if (
    !word ||
    word.includes("<masked>") ||
    !/^(~|\.{1,2}\/|\/|\$)/.test(word)
  ) {
    return undefined;
  }
  const expanded = word
    .replace(/^~(?=\/|$)/, home)
    .replace(/^\$\{?HOME\}?/, home)
    .replace(/^\$\{?CLAUDE_PROJECT_DIR\}?/, projectRoot);
  return expanded.includes("$")
    ? undefined
    : { written: word, path: resolve(projectRoot, expanded) };
};

const missingHookFile: Rule = {
  id: "missing-hook-file",
  run: ({ hooks, paths, project, line }) =>
    hooks.items.flatMap((hook) => {
      if (hook.state === "disabled" || !hook.command) {
        return [];
      }
      const file = hookFile(hook.command, {
        home: paths.home,
        projectRoot: project.root,
      });
      if (!file || existsSync(file.path)) {
        return [];
      }
      return [
        finding(
          "missing-hook-file",
          "error",
          `${hook.event} hook runs ${file.path}, which does not exist`,
          hook.source,
          {
            line: line(hook.source, file.written),
            fix: hook.plugin
              ? `Reinstall or update plugin ${hook.plugin}, or disable it`
              : `Restore ${file.path} or remove the hook from ${hook.source}`,
          }
        ),
      ];
    }),
};

const SHELL_OPERATOR = /^(\|\||&&|;|\|)/;

/**
 * What a hook runs, for dup-hook-scope: the file name of the script hookFile() finds plus the words after it up to the first
 * shell operator (`||`, `&&`, `;`, `|`), quotes stripped. `node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs"
 * post-edit` and `node "/home/me/.claude/helpers/graft-hooks.cjs" post-edit || exit 0` both give
 * { script: "graft-hooks.cjs", args: ["post-edit"] }. Undefined when hookFile() finds no script (a bare `trail hook ...`).
 */
export const hookRunKey = (
  command: string,
  where: { home: string; projectRoot: string }
): { script: string; args: string[] } | undefined => {
  const file = hookFile(command, where);
  if (!file) {
    return;
  }
  const unquote = (word: string): string => word.replace(/["'`]/g, "");
  const words = command.split(/\s+/).filter(Boolean);
  const at = words.findIndex(
    (word) => word.replace(/^["'`]+|["'`]+$/g, "") === file.written
  );
  const args: string[] = [];
  for (const word of words.slice(at + 1)) {
    if (SHELL_OPERATOR.test(word)) {
      break;
    }
    const [head, ...rest] = word.split(/\|\||&&|;|\|/);
    if (head) {
      args.push(unquote(head));
    }
    if (rest.length > 0) {
      break;
    }
  }
  return { script: basename(file.path), args };
};

// Two hooks run the same thing when this is equal (dup-hook-scope, copilot-dup-hook).
const keyOf = ({ run }: { run: { script: string; args: string[] } }): string =>
  JSON.stringify([run.script, ...run.args]);

/**
 * dup-hook-scope: a project or local settings hook that runs what a user-level hook of the same event runs, so both run.
 * Checks every non-plugin, non-disabled hook with a command in project or local scope against the user-scope hooks of the
 * same event; they match when hookRunKey() is equal. The matcher is ignored on purpose: the user tool-savings matcher also
 * lists Skill and the project one does not, yet they overlap. A match whose hookId() equals the user hook's gives no
 * finding: Claude Code deduplicates identical handlers across settings files and runs them once. One warning per project or
 * local handler, on its file; the fix (fix-rules.ts) finds it again by `(<id>)` and `<scope>` in the message.
 *
 * The key is built from the raw command in the settings layers (plugin hooks are not in them), because the inventory's
 * masked command turns `${CLAUDE_PROJECT_DIR:-.}` into `${CLAUDE_PROJECT_DIR:-<masked>}`, which hookFile() rejects. The
 * printed script and args go through maskArgs. A hook counts as disabled when its inventory row (same id and file) says so.
 */
const dupHookScope: Rule = {
  id: "dup-hook-scope",
  run: ({ hooks, layers, paths, project, line }) => {
    const where = { home: paths.home, projectRoot: project.root };
    const disabled = new Set(
      hooks.items
        .filter((hook) => hook.state === "disabled")
        .map((hook) => `${hook.source}\0${hook.id}`)
    );
    const handlers = layers.flatMap(({ scope, source, json }) =>
      Object.entries(isObject(json.hooks) ? json.hooks : {}).flatMap(
        ([event, groups]) =>
          list(groups).flatMap((group) =>
            list(isObject(group) ? group.hooks : undefined).flatMap((hook) => {
              if (!isObject(hook) || typeof hook.command !== "string") {
                return [];
              }
              const id = hookId(event, (group as HookGroup).matcher, hook);
              const run = hookRunKey(hook.command, where);
              return run && !disabled.has(`${source}\0${id}`)
                ? [{ scope, source, event, id, run, command: hook.command }]
                : [];
            })
          )
      )
    );
    const user = handlers.filter((handler) => handler.scope === "user");
    return handlers
      .filter(
        (handler) => handler.scope === "project" || handler.scope === "local"
      )
      .flatMap((handler) => {
        const same = user.filter(
          (other) =>
            other.event === handler.event && keyOf(other) === keyOf(handler)
        );
        if (
          same.length === 0 ||
          same.some((other) => other.id === handler.id)
        ) {
          return [];
        }
        const shown = maskArgs([handler.run.script, ...handler.run.args]).join(
          " "
        );
        // The whole command as written in the JSON first: statusLine often runs the same script on an earlier line.
        const written = hookFile(handler.command, where)?.written ?? "";
        const at =
          line(handler.source, JSON.stringify(handler.command).slice(1, -1)) ??
          line(handler.source, written);
        return [
          finding(
            "dup-hook-scope",
            "warning",
            `${handler.event} hook (${handler.id}) in ${handler.scope} settings runs ${shown}, which a user-level hook also runs; both run`,
            handler.source,
            {
              line: at,
              fix: `agentry fix removes it from ${handler.source} (or: agentry hook remove ${handler.id} --scope ${handler.scope})`,
            }
          ),
        ];
      });
  },
};

// The message and fix are shared by broken-skill-link and copilot-broken-skill-link: the fix parses the message.
const brokenLinkFinding = (
  id: string,
  skill: { name: string; source: string; target: string }
): Finding =>
  finding(
    id,
    "warning",
    existsSync(skill.target)
      ? `Skill link "${skill.name}" points at ${skill.target}, which has no SKILL.md`
      : `Skill link "${skill.name}" points at ${skill.target}, which does not exist`,
    skill.source,
    { fix: `Remove the link: rm "${skill.source}"` }
  );

const brokenSkillLink: Rule = {
  id: "broken-skill-link",
  run: ({ skills }) =>
    skills.items
      .filter((skill) => skill.kind === "broken" && skill.target !== undefined)
      .map((skill) =>
        brokenLinkFinding("broken-skill-link", {
          name: skill.name,
          source: skill.source,
          target: skill.target as string,
        })
      ),
};

const pluginNotInstalled: Rule = {
  id: "plugin-not-installed",
  run: ({ plugins, line }) =>
    plugins.items
      .filter(
        (plugin) => plugin.state === "not-installed" && plugin.enabledBy.value
      )
      .map((plugin) =>
        finding(
          "plugin-not-installed",
          "warning",
          `enabledPlugins turns on ${plugin.id}, but it is not installed`,
          plugin.enabledBy.source,
          {
            line: line(plugin.enabledBy.source, `"${plugin.id}"`),
            fix: `claude plugin install ${plugin.id}, or remove the entry from ${plugin.enabledBy.source}`,
          }
        )
      ),
};

// ---- placeholders ----

const REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*)?\}/g;
const PROVIDED = new Set(["HOME", "CLAUDE_PLUGIN_ROOT", "CLAUDE_PROJECT_DIR"]);

const unsetPlaceholder: Rule = {
  id: "unset-placeholder",
  run: ({ mcp, platform, launchctlGetenv, line }) => {
    // Apps launched from the Dock or Spotlight get launchd's environment, not the shell profile's.
    if (platform !== "darwin") {
      return [];
    }
    return mcp.servers
      .filter(
        (server) =>
          server.state !== "shadowed" &&
          server.state !== "disabled" &&
          server.state !== "rejected"
      )
      .flatMap((server) => {
        const texts = [
          ...Object.values(server.env ?? {}),
          ...Object.values(server.headers ?? {}),
        ];
        const names = new Set<string>();
        for (const text of texts) {
          for (const [, name, fallback] of String(text).matchAll(REF)) {
            if (!(fallback || PROVIDED.has(name) || launchctlGetenv(name))) {
              names.add(name);
            }
          }
        }
        if (names.size === 0) {
          return [];
        }
        const vars = [...names];
        return [
          finding(
            "unset-placeholder",
            "warning",
            `MCP server "${server.name}" uses ${vars.map((name) => `\${${name}}`).join(", ")} in env or headers; GUI-launched apps on macOS don't inherit your shell profile, so it expands to nothing there`,
            server.source,
            {
              line: line(server.source, `"${server.name}"`),
              fix: `Either set it for GUI apps, then quit and reopen the app: launchctl setenv ${vars[0]} "<value>" (lost at reboot unless a LaunchAgent sets it);\nor write the literal value into the entry in ${server.source} (plaintext on disk: keep the file out of git).`,
            }
          ),
        ];
      });
  },
};

// ---- stale names ----

// biome-ignore lint/suspicious/noShadowRestrictedNames: local helper; never uses the global escape()
const escape = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Where an old name counts as used: not inside a longer word, a scoped package or a file name stem like "x.graft".
export const renamePattern = (from: string): RegExp =>
  new RegExp(`(?<![A-Za-z0-9.@-])${escape(from)}(?![A-Za-z0-9/@])`);

const staleName: Rule = {
  id: "stale-name",
  run: ({ layers, mcp, hooks, renames, line }) => {
    const rules = Object.entries(renames).map(([from, to]) => ({
      from,
      to,
      pattern: renamePattern(from),
    }));
    const out: Finding[] = [];
    const reported = new Map<string, number>();
    const check = (what: string, text: string, file: string): void => {
      for (const { from, to, pattern } of rules) {
        if (pattern.test(text)) {
          // Needle: the word that holds the old name, so repeated hits land on their own lines.
          const needle =
            text.match(new RegExp(`[\\w./~-]*${escape(from)}[\\w./-]*`))?.[0] ??
            from;
          const key = `${file}\0${needle}`;
          const seen = reported.get(key) ?? 0;
          reported.set(key, seen + 1);
          out.push(
            finding(
              "stale-name",
              "warning",
              `${what} still uses the old name "${from}" (now "${to}")`,
              file,
              {
                line: line(file, needle, seen) ?? line(file, from),
                fix: `Replace "${from}" with "${to}" in ${file}`,
              }
            )
          );
        }
      }
    };
    for (const { source, json } of layers) {
      for (const kind of ["allow", "deny", "ask"]) {
        for (const entry of list(json.permissions?.[kind]).filter(
          (item): item is string => typeof item === "string"
        )) {
          check(
            `Permission ${kind} entry "${maskShell(entry)}"`,
            entry,
            source
          );
        }
      }
    }
    for (const { source, json } of layers) {
      for (const [key, value] of Object.entries(json).filter(([name]) =>
        /statusLine$/i.test(name)
      )) {
        const command = (value as { command?: unknown } | null | undefined)
          ?.command;
        if (typeof command === "string") {
          check(`${key} command`, maskShell(command), source);
        }
      }
    }
    for (const server of mcp.servers.filter(
      (item) => item.scope !== "plugin"
    )) {
      check(
        `MCP server "${server.name}"`,
        [server.name, server.command, ...(server.args ?? [])]
          .filter((item) => typeof item === "string")
          .join(" "),
        server.source
      );
    }
    for (const hook of hooks.items.filter(
      (item): item is HookItem & { command: string } =>
        item.scope !== "plugin" && Boolean(item.command)
    )) {
      check(`${hook.event} hook`, hook.command, hook.source);
      check(`${hook.event} hook matcher`, hook.matcher, hook.source);
    }
    return out;
  },
};

// ---- shelf ----

const subdirs = (dir: string): string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};

// Every file under `dir` as a sorted relative path.
const readTree = (dir: string, base: string = dir): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? readTree(join(dir, entry.name), base)
        : [relative(base, join(dir, entry.name))]
    )
    .sort();

// Same file list and same bytes in every file.
const sameFolder = (a: string, b: string): boolean => {
  const files = readTree(a);
  const other = readTree(b);
  return (
    files.length === other.length &&
    files.every(
      (file, at) =>
        file === other[at] &&
        readFileSync(join(a, file)).equals(readFileSync(join(b, file)))
    )
  );
};

// Shelf groups that hold a skill folder named `name`.
const shelfGroups = (shelfDir: string, name: string): string[] =>
  subdirs(shelfDir).filter((group) =>
    existsSync(join(shelfDir, group, name, "SKILL.md"))
  );

// A real folder in ~/.claude/skills that matches a shelved copy loads twice once the shelf is on. A symlink is a shelved skill that is linked in, so it is not reported.
const shelfDuplicate: Rule = {
  id: "shelf-duplicate",
  run: ({ skills, paths }) =>
    skills.items
      .filter(
        (skill) =>
          skill.scope === "user" &&
          skill.kind === "file" &&
          skill.state === "active"
      )
      .flatMap((skill) => {
        const copies = shelfGroups(paths.shelfDir, skill.name).filter((group) =>
          sameFolder(skill.source, join(paths.shelfDir, group, skill.name))
        );
        if (copies.length === 0) {
          return [];
        }
        return [
          finding(
            "shelf-duplicate",
            "warning",
            `Global skill "${skill.name}" is identical to the shelved copy ${copies.map((group) => `${group}/${skill.name}`).join(", ")}; the global copy is always loaded`,
            skill.source,
            {
              fix: `Remove the global copy, since the shelf keeps the same skill: rm -r "${skill.source}"; then turn the shelf copy on when you want it: agentry shelf on ${copies[0]}/${skill.name}`,
            }
          ),
        ];
      }),
};

// Order here is the registry order; a new rule is one more entry.
// ---- retired MCP servers ----

// The trail MCP server was removed (it was called graft before): agents now call the `trail` CLI. Project and local
// permissions that still allow its tools are dead. User-layer permissions and hook matchers are never read: trail's own
// user hook matcher contains `mcp__graft__`.
const RETIRED_MCP_SERVERS = ["graft", "trail"];

const staleMcpPermission: Rule = {
  id: "stale-mcp-permission",
  run: ({ layers, mcp, line }) => {
    const configured = new Set(mcp.servers.map((server) => server.name));
    return layers
      .filter(({ scope }) => scope === "project" || scope === "local")
      .flatMap(({ json, source }) =>
        ["allow", "deny", "ask"].flatMap((kind) =>
          list(json.permissions?.[kind])
            .filter((entry): entry is string => typeof entry === "string")
            .flatMap((entry) => {
              const name = RETIRED_MCP_SERVERS.find(
                (retired) =>
                  entry === `mcp__${retired}` ||
                  entry.startsWith(`mcp__${retired}__`)
              );
              return name === undefined || configured.has(name)
                ? []
                : [
                    finding(
                      "stale-mcp-permission",
                      "warning",
                      `Permission ${kind} entry "${entry}" is for MCP server "${name}", which is not configured`,
                      source,
                      {
                        line: line(source, `"${entry}"`),
                        fix: `Remove "${entry}" from permissions.${kind} in ${source}`,
                      }
                    ),
                  ];
            })
        )
      );
  },
};

// ---- trail wiring ----

// The helper scripts `trail init` points the user-level hooks at (graft-hooks.cjs is the name current trail still ships).
const TRAIL_HOOK_SCRIPTS = new Set(["graft-hooks.cjs", "trail-hooks.cjs"]);

// Advice only: `trail init` is the tool that writes the wiring, so there is no fix here.
const trailHooksMissing: Rule = {
  id: "trail-hooks-missing",
  run: ({ layers, paths, project, which }) => {
    if (!which("trail")) {
      return [];
    }
    const where = { home: paths.home, projectRoot: project.root };
    const wired = layers
      .filter(({ scope }) => scope === "user")
      .some(({ json }) =>
        Object.values(isObject(json.hooks) ? json.hooks : {}).some((groups) =>
          list(groups).some((group) =>
            list(isObject(group) ? group.hooks : undefined).some(
              (hook) =>
                isObject(hook) &&
                typeof hook.command === "string" &&
                TRAIL_HOOK_SCRIPTS.has(
                  hookRunKey(hook.command, where)?.script ?? ""
                )
            )
          )
        )
      );
    return wired
      ? []
      : [
          finding(
            "trail-hooks-missing",
            "info",
            "trail is on PATH, but your user settings have none of its hooks",
            join(paths.configDir, "settings.json"),
            {
              fix: "Run trail init --agents claude, which writes the hooks and the trail skill into ~/.claude",
            }
          ),
        ];
  },
};

// ---- GitHub Copilot ----

// Every rule here returns [] when `copilot.present` is false (no Copilot home). Facts: cli/docs/copilot-config-sources.md.
// The reader's MCP and hook rows are masked, so rules that need a raw value read the file themselves and print only masks.

const jsonObject = (file: string): Record<string, unknown> => {
  const value = readJson(file, []);
  return isObject(value) ? value : {};
};

const copilotBrokenSkillLink: Rule = {
  id: "copilot-broken-skill-link",
  run: ({ copilot, paths, project }) => {
    if (!copilot.present) {
      return [];
    }
    // .claude/skills is the Claude reader's: broken-skill-link already reports it.
    const dirs = new Set([
      join(paths.copilotDir, "skills"),
      paths.agentsSkillsDir,
      join(project.root, ".github", "skills"),
    ]);
    return copilot.skills
      .filter(
        (skill) =>
          skill.state === "broken" &&
          skill.target !== undefined &&
          dirs.has(dirname(skill.source))
      )
      .map((skill) =>
        brokenLinkFinding("copilot-broken-skill-link", {
          name: skill.name,
          source: skill.source,
          target: skill.target as string,
        })
      );
  },
};

// A literal secret in any MCP server Copilot loads. Values are never printed: only the masks, and only when the mask hides
// everything the detector flagged.
const SECRET_SPLIT = /[\s=]+/;
const URL_SPLIT = /[\s=/?&:@#]+/;
const secretIn = (text: string, split: RegExp = SECRET_SPLIT): boolean =>
  text
    .replace(REF, " ")
    .split(split)
    .some((piece) => piece !== "" && looksSecret(piece));
const shown = (masked: string): string =>
  secretIn(masked, URL_SPLIT) ? MASK : masked;

const secretSpots = (
  entry: Record<string, unknown>
): { where: string; masked: string }[] => {
  const spots: { where: string; masked: string }[] = [];
  if (typeof entry.url === "string" && secretIn(entry.url, URL_SPLIT)) {
    spots.push({ where: "url", masked: maskUrl(entry.url) });
  }
  for (const [key, value] of Object.entries(
    isObject(entry.headers) ? entry.headers : {}
  )) {
    if (typeof value === "string" && secretIn(value)) {
      spots.push({ where: `headers.${key}`, masked: maskHeader(value) });
    }
  }
  for (const [key, value] of Object.entries(
    isObject(entry.env) ? entry.env : {}
  )) {
    if (typeof value === "string" && secretIn(value)) {
      spots.push({ where: `env.${key}`, masked: maskValue(value) });
    }
  }
  const args = list(entry.args);
  const maskedArgs = maskArgs(args);
  args.forEach((arg, index) => {
    if (typeof arg === "string" && secretIn(arg)) {
      spots.push({
        where: `args[${index}]`,
        masked: maskedArgs[index] ?? MASK,
      });
    }
  });
  return spots;
};

const copilotMcpSecret: Rule = {
  id: "copilot-mcp-secret",
  run: ({ copilot, paths, project, line }) => {
    if (!copilot.present) {
      return [];
    }
    const disabled = new Set(
      copilot.mcp.filter((server) => server.disabled).map((s) => s.name)
    );
    const workspace = [
      join(project.root, ".mcp.json"),
      join(project.root, ".github", "mcp.json"),
    ].find(existsSync);
    return [join(paths.copilotDir, "mcp-config.json"), workspace].flatMap(
      (file) =>
        file === undefined
          ? []
          : Object.entries(jsonObject(file).mcpServers ?? {}).flatMap(
              ([name, entry]) =>
                disabled.has(name) || !isObject(entry)
                  ? []
                  : secretSpots(entry).map(({ where, masked }) =>
                      finding(
                        "copilot-mcp-secret",
                        "error",
                        `MCP server "${name}" has a literal secret in ${where} (${shown(masked)})`,
                        file,
                        {
                          line: line(file, `"${name}"`),
                          fix:
                            where === "url"
                              ? 'Move the secret out of the url into headers, args or env as a "${VAR}" reference: Copilot expands ${VAR} in headers, args and env'
                              : `Move the value into an environment variable and write "\${VAR}" in ${where}: Copilot expands \${VAR} in headers, args and env`,
                        }
                      )
                    )
            )
    );
  },
};

// The effective value is the reader's; this finds which file decides it, so the fix edits the right one (the user file
// when nothing sets it). A repo file only counts when the repo is trusted, as in the reader.
const copilotCoauthor: Rule = {
  id: "copilot-coauthor",
  run: ({ copilot, paths, project, line }) => {
    if (!(copilot.present && copilot.includeCoAuthoredBy)) {
      return [];
    }
    let file = join(paths.copilotDir, "settings.json");
    let explicit = false;
    for (const layer of [
      file,
      ...(copilot.trusted
        ? [
            join(project.root, ".github", "copilot", "settings.json"),
            join(project.root, ".github", "copilot", "settings.local.json"),
          ]
        : []),
    ]) {
      if (typeof jsonObject(layer).includeCoAuthoredBy === "boolean") {
        file = layer;
        explicit = true;
      }
    }
    return [
      finding(
        "copilot-coauthor",
        "warning",
        `Copilot adds a Co-authored-by trailer to commits: includeCoAuthoredBy is ${explicit ? "true" : "not set (default true)"}`,
        file,
        {
          line: explicit ? line(file, '"includeCoAuthoredBy"') : undefined,
          fix: `Set "includeCoAuthoredBy": false in ${file}`,
        }
      ),
    ];
  },
};

const CONTEXT7_PACKAGE = "@upstash/context7-mcp";

// The context7 entry agentry used to install: `bunx`/`npx` running the package, nothing else set.
export const isOldContext7Entry = (entry: unknown): boolean => {
  if (!isObject(entry)) {
    return false;
  }
  const args = list(entry.args);
  const extra = args.filter((arg) => !String(arg).startsWith(CONTEXT7_PACKAGE));
  return (
    Object.keys(entry).every((key) =>
      ["type", "command", "args", "tools"].includes(key)
    ) &&
    entry.type === "local" &&
    (entry.command === "bunx" || entry.command === "npx") &&
    args.length - extra.length === 1 &&
    extra.every((arg) => ["-y", "--yes", "--bun"].includes(String(arg))) &&
    (entry.tools === undefined ||
      (Array.isArray(entry.tools) &&
        entry.tools.length === 1 &&
        entry.tools[0] === "*"))
  );
};

const copilotContext7Local: Rule = {
  id: "copilot-context7-local",
  run: ({ copilot, paths, line }) => {
    if (!copilot.present) {
      return [];
    }
    const file = join(paths.copilotDir, "mcp-config.json");
    const entry = jsonObject(file).mcpServers;
    const context7 = isObject(entry) ? entry.context7 : undefined;
    return isObject(context7) &&
      context7.url === undefined &&
      list(context7.args).some(
        (arg) => typeof arg === "string" && arg.startsWith(CONTEXT7_PACKAGE)
      )
      ? [
          finding(
            "copilot-context7-local",
            "warning",
            `Copilot MCP server "context7" runs the local ${CONTEXT7_PACKAGE} package; agentry installs it as the http server`,
            file,
            {
              line: line(file, '"context7"'),
              fix: `Replace the "context7" entry in ${file} with the http entry from global/copilot/mcp-config.json (the key stays a "\${CONTEXT7_API_KEY}" reference)`,
            }
          ),
        ]
      : [];
  },
};

// Advice only: trust is a user decision, and the setup script writes it (never COPILOT_ALLOW_ALL).
const copilotUntrustedHooks: Rule = {
  id: "copilot-untrusted-hooks",
  run: ({ copilot, project }) => {
    const hooks = copilot.hooks.filter((hook) => hook.scope === "repo");
    const [first] = hooks;
    if (!(copilot.present && first) || copilot.trusted) {
      return [];
    }
    const sources = [...new Set(hooks.map((hook) => hook.source))].map((file) =>
      relative(project.root, file)
    );
    return [
      finding(
        "copilot-untrusted-hooks",
        "warning",
        `Copilot skips ${hooks.length} hook${hooks.length === 1 ? "" : "s"} from this repo (${sources.join(", ")}) because ${project.root} is not in trustedFolders`,
        first.source,
        {
          fix: "agentry copilot trust",
        }
      ),
    ];
  },
};

/**
 * copilot-dup-hook: Copilot combines the hooks of every file it reads, so a repo hook that runs what a user-level hook of the
 * same event runs (keyOf(hookRunKey()), as dup-hook-scope) runs twice. Identical ids still count: Copilot does not dedupe.
 * The files are re-read raw (the reader's commands are masked, which hookFile() rejects); only maskShell output is printed.
 * One warning per repo hook, on its file. The fix (fix-rules.ts) parses `(<id>)` and the repo file from the message, and
 * edits only `.github/hooks/*.json`: Claude Code also runs the hooks in `.claude/settings*.json`, so those stay advice only.
 */
const copilotDupHook: Rule = {
  id: "copilot-dup-hook",
  run: ({ copilot, paths, project, line }) => {
    if (!copilot.present) {
      return [];
    }
    const where = { home: paths.home, projectRoot: project.root };
    const handlers = copilotHookFiles(paths.copilotDir, project.root).flatMap(
      ([source, scope, nested]) =>
        copilotHookEntries(readJson(source, []), nested).flatMap((entry) => {
          const run = entry.raw ? hookRunKey(entry.raw, where) : undefined;
          return run && entry.raw
            ? [{ ...entry, raw: entry.raw, run, scope, source }]
            : [];
        })
    );
    const user = handlers.filter((handler) => handler.scope === "user");
    const hooksDir = join(project.root, ".github", "hooks");
    return handlers
      .filter((handler) => handler.scope === "repo")
      .flatMap((handler) => {
        const userFiles = [
          ...new Set(
            user
              .filter(
                (other) =>
                  other.event === handler.event &&
                  keyOf(other) === keyOf(handler)
              )
              .map((other) => other.source)
          ),
        ];
        if (userFiles.length === 0) {
          return [];
        }
        const { event, id, raw, source } = handler;
        const userList = userFiles.join(", ");
        const fix = source.startsWith(`${hooksDir}/`)
          ? `agentry fix removes the repo copy from ${source} (Claude Code does not read it); the user-level hook keeps running`
          : dirname(source) === join(project.root, ".claude")
            ? `Claude Code also runs the hooks in ${source}, so leave it as is: keep the user-level Copilot hook in ${userList} (it runs twice in this repo), or remove it there and rely on the repo copy`
            : `Remove it from ${source}, or from ${userList} and rely on the repo copy`;
        return [
          finding(
            "copilot-dup-hook",
            "warning",
            `${event} hook (${id}) runs twice in Copilot: ${source} (repo) and ${userList} (user) both run ${maskShell(raw)}`,
            source,
            {
              line: line(source, JSON.stringify(raw).slice(1, -1)),
              fix,
            }
          ),
        ];
      });
  },
};

// trail <= 0.29 wrote graft/; the autobuild hook (global/helpers/trail-autobuild.sh) replaces an untracked one at the next
// session start, so there is nothing to run. Not Copilot-specific.
const trailOldIndex: Rule = {
  id: "trail-old-index",
  run: ({ project }) => {
    const index = join(project.root, "graft", "INDEX.md");
    if (
      !existsSync(index) ||
      existsSync(join(project.root, ".trail", "cache"))
    ) {
      return [];
    }
    try {
      const tracked = execFileSync(
        "git",
        ["-C", project.root, "ls-files", "--", "graft"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      );
      if (tracked.trim() !== "") {
        return [];
      }
    } catch {
      return [];
    }
    return [
      finding(
        "trail-old-index",
        "info",
        "trail's old index (graft/INDEX.md) is untracked here and there is no .trail/cache; the trail autobuild hook migrates it at the next session start",
        index,
        {
          fix: "Nothing to run: start a session in this repo (the hook deletes graft/ and builds .trail/cache)",
        }
      ),
    ];
  },
};

const MAX_NAMES = 8;
const names = (all: string[]): string =>
  all.length <= MAX_NAMES
    ? all.join(", ")
    : `${all.slice(0, MAX_NAMES).join(", ")} and ${all.length - MAX_NAMES} more`;

const entries = (dir: string): string[] => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};

// What a user installed for Claude that Copilot never reads (it ignores ~/.claude). One finding per kind, advice only.
const copilotCannotSee: Rule = {
  id: "copilot-cannot-see",
  run: ({ copilot, paths }) => {
    if (!copilot.present) {
      return [];
    }
    const ch = paths.copilotDir;
    const found: Finding[] = [];
    const rulesDir = join(paths.configDir, "rules");
    const rulesMissing = entries(rulesDir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.slice(0, -".md".length))
      .filter(
        (name) =>
          !existsSync(join(ch, "instructions", `${name}.instructions.md`))
      );
    if (rulesMissing.length > 0) {
      found.push(
        finding(
          "copilot-cannot-see",
          "info",
          `Copilot cannot see ${rulesMissing.length} Claude user rule${rulesMissing.length === 1 ? "" : "s"}: ${names(rulesMissing)}`,
          join(ch, "instructions"),
          {
            fix: "agentry copilot share <name> --kind rule (writes it as <name>.instructions.md for all projects)",
          }
        )
      );
    }
    const skillsDir = join(paths.configDir, "skills");
    const skillsMissing = subdirs(skillsDir).filter(
      (name) =>
        existsSync(join(skillsDir, name, "SKILL.md")) &&
        ![
          join(ch, "skills", name),
          ...(paths.copilotDefaultHome
            ? [join(paths.agentsSkillsDir, name)]
            : []),
        ].some((twin) => existsSync(twin))
    );
    if (skillsMissing.length > 0) {
      found.push(
        finding(
          "copilot-cannot-see",
          "info",
          `Copilot cannot see ${skillsMissing.length} Claude user skill${skillsMissing.length === 1 ? "" : "s"}: ${names(skillsMissing)}`,
          join(ch, "skills"),
          {
            fix: "Copilot ignores ~/.claude/skills; share the ones you want with agentry copilot share <name> (for all projects)",
          }
        )
      );
    }
    const claudeMd = join(paths.configDir, "CLAUDE.md");
    const instructions = join(ch, "copilot-instructions.md");
    if (existsSync(claudeMd) && !existsSync(instructions)) {
      found.push(
        finding(
          "copilot-cannot-see",
          "info",
          "Copilot cannot see your user CLAUDE.md: there is no copilot-instructions.md in its home",
          instructions,
          { fix: `Copy ${claudeMd} to ${instructions}` }
        )
      );
    }
    return found;
  },
};

export const rules: Rule[] = [
  dupPluginScope,
  dupSkillName,
  dupMcpName,
  dupMcpPlugin,
  missingMcpCommand,
  missingHookFile,
  dupHookScope,
  staleMcpPermission,
  trailHooksMissing,
  trailOldIndex,
  brokenSkillLink,
  pluginNotInstalled,
  unsetPlaceholder,
  staleName,
  shelfDuplicate,
  copilotBrokenSkillLink,
  copilotMcpSecret,
  copilotCoauthor,
  copilotContext7Local,
  copilotUntrustedHooks,
  copilotDupHook,
  copilotCannotSee,
];
