// Lists what GitHub Copilot loads for a folder: skills, instructions, hooks, MCP servers and agents, plus folder trust
// and the co-author setting. Sources and precedence: cli/docs/copilot-config-sources.md. Read-only; secrets are masked.

import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { frontmatter } from "../agents.js";
import {
  maskArgs,
  maskCommand,
  maskHeader,
  maskMap,
  maskShell,
  maskUrl,
} from "../mask.js";
import type { Paths } from "../paths.js";
import type {
  CopilotAgent,
  CopilotHook,
  CopilotInstruction,
  CopilotInventory,
  CopilotMcpServer,
  CopilotSkill,
  ReadError,
} from "../types.js";
import { isObject, list, readJson, readJsonc, uniqueErrors } from "./common.js";
import { hookId } from "./hooks.js";
import { inspectSkillFolder, subdirs } from "./skills.js";

type Scope = "user" | "repo";

// Files under `dir` (recursively) whose name ends in `suffix`, sorted.
const filesWith = (dir: string, suffix: string): string[] => {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesWith(join(dir, entry.name), suffix)
        : entry.name.endsWith(suffix)
          ? [join(dir, entry.name)]
          : []
    )
    .sort();
};

const text = (file: string): string => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

const object = (value: unknown): Record<string, unknown> =>
  isObject(value) ? value : {};

/** The files Copilot reads hooks from, in order: [file, scope, nested] (nested: the events sit under a `hooks` key). */
export const copilotHookFiles = (
  ch: string,
  root: string,
  claudeDir?: string
): [string, Scope, boolean][] => [
  ...filesWith(join(ch, "hooks"), ".json").map(
    (f): [string, Scope, boolean] => [f, "user", false]
  ),
  [join(ch, "settings.json"), "user", true],
  ...filesWith(join(root, ".github", "hooks"), ".json").map(
    (f): [string, Scope, boolean] => [f, "repo", false]
  ),
  [join(root, ".github", "copilot", "settings.json"), "repo", true],
  // The home folder's .claude is the user's own config, not a repo's.
  ...(join(root, ".claude") === claudeDir
    ? []
    : [
        [join(root, ".claude", "settings.json"), "repo", true] as [
          string,
          Scope,
          boolean,
        ],
      ]),
];

/**
 * Every hook entry of one parsed Copilot hook file, with its raw (unmasked) command and its JSON path in the file. A hook
 * file holds its events at the top or under `hooks`; an event's items are Claude-style groups (`{ matcher, hooks: [...] }`)
 * or flat hook entries. Shared by the reader, copilot-dup-hook and its fix, so ids and paths cannot drift.
 */
export const copilotHookEntries = (
  json: unknown,
  nested: boolean
): {
  event: string;
  id: string;
  raw?: string;
  path: (string | number)[];
}[] => {
  const base: (string | number)[] = nested ? ["hooks"] : [];
  const body = object(nested ? object(json).hooks : json);
  const at =
    body.hooks === undefined || body.hooks === null ? base : [...base, "hooks"];
  const found: ReturnType<typeof copilotHookEntries> = [];
  for (const [event, groups] of Object.entries(object(body.hooks ?? body))) {
    list(groups).forEach((group, gi) => {
      const g = object(group);
      const entries = Array.isArray(g.hooks) ? g.hooks : [group];
      entries.forEach((hook, hi) => {
        const h = object(hook);
        const raw = [h.command, h.bash, h.powershell].find(
          (value): value is string => typeof value === "string"
        );
        found.push({
          event,
          id: hookId(event, g.matcher, hook),
          ...(raw === undefined ? {} : { raw }),
          path: Array.isArray(g.hooks)
            ? [...at, event, gi, "hooks", hi]
            : [...at, event, gi],
        });
      });
    });
  }
  return found;
};

export const createCopilotReader = (
  paths: Pick<
    Paths,
    | "agentsSkillsDir"
    | "configDir"
    | "copilotDefaultHome"
    | "copilotDir"
    | "projectRoot"
    | "shelfDir"
  >
) => {
  const read = ({
    cwd = process.cwd(),
  }: {
    cwd?: string;
  } = {}): CopilotInventory => {
    const errors: ReadError[] = [];
    const ch = paths.copilotDir;
    const root = paths.projectRoot(resolve(cwd));

    const configJson = object(readJsonc(join(ch, "config.json"), errors));
    const signedIn =
      list(configJson.loggedInUsers).length > 0 ||
      Boolean(configJson.lastLoggedInUser);
    const trustedFolders = list(configJson.trustedFolders).filter(
      (item): item is string => typeof item === "string"
    );
    const trustedSet = new Set(trustedFolders.map((folder) => resolve(folder)));
    let trusted = false;
    for (let dir = resolve(root); ; ) {
      if (trustedSet.has(dir)) {
        trusted = true;
        break;
      }
      const up = dirname(dir);
      if (up === dir) {
        break;
      }
      dir = up;
    }

    const userSettings = object(readJson(join(ch, "settings.json"), errors));
    const repoSettings = [
      join(root, ".github", "copilot", "settings.json"),
      join(root, ".github", "copilot", "settings.local.json"),
    ].map((file) => object(readJson(file, errors)));

    let includeCoAuthoredBy = true;
    for (const layer of [userSettings, ...(trusted ? repoSettings : [])]) {
      const { includeCoAuthoredBy: value } = layer;
      if (typeof value === "boolean") {
        includeCoAuthoredBy = value;
      }
    }

    // Skills, highest precedence first; the first folder to name a skill wins.
    const skills: CopilotSkill[] = [];
    const taken = new Set<string>();
    const addSkills = (dir: string, scope: Scope): void => {
      for (const name of subdirs(dir)) {
        const info = inspectSkillFolder(join(dir, name), paths.shelfDir);
        if (!info) {
          continue;
        }
        skills.push({
          name,
          scope,
          source: join(dir, name),
          state: info.kind === "broken" ? "broken" : "ok",
          shadowed: taken.has(name),
          ...(info.target ? { target: info.target } : {}),
        });
        taken.add(name);
      }
    };
    addSkills(join(root, ".github", "skills"), "repo");
    const repoClaude = join(root, ".claude") !== paths.configDir;
    if (repoClaude) {
      addSkills(join(root, ".claude", "skills"), "repo");
    }
    addSkills(join(ch, "skills"), "user");
    if (paths.copilotDefaultHome) {
      addSkills(paths.agentsSkillsDir, "user");
    }

    const instructions: CopilotInstruction[] = [];
    const addInstructions = (
      dir: string,
      suffix: string,
      key: "applyTo" | "paths",
      scope: Scope
    ): void => {
      for (const file of filesWith(dir, suffix)) {
        instructions.push({
          file,
          scope,
          applyTo: frontmatter(text(file))[key]?.trim() || null,
        });
      }
    };
    addInstructions(
      join(ch, "instructions"),
      ".instructions.md",
      "applyTo",
      "user"
    );
    addInstructions(
      join(root, ".github", "instructions"),
      ".instructions.md",
      "applyTo",
      "repo"
    );
    if (repoClaude) {
      addInstructions(join(root, ".claude", "rules"), ".md", "paths", "repo");
    }

    const hooks: CopilotHook[] = [];
    for (const [source, scope, nested] of copilotHookFiles(
      ch,
      root,
      paths.configDir
    )) {
      const json = readJson(source, errors);
      if (json === undefined) {
        continue;
      }
      for (const { event, id, raw } of copilotHookEntries(json, nested)) {
        hooks.push({
          id,
          event,
          scope,
          source,
          ...(raw === undefined ? {} : { command: maskShell(raw) }),
        });
      }
    }

    // MCP: the workspace entry replaces a user entry of the same name.
    const disabled = new Set(
      [userSettings, ...repoSettings].flatMap((layer) =>
        list(layer.disabledMcpServers).filter(
          (item): item is string => typeof item === "string"
        )
      )
    );
    const servers = new Map<string, CopilotMcpServer>();
    const addServers = (
      file: string,
      scope: CopilotMcpServer["scope"]
    ): void => {
      const entries = object(object(readJson(file, errors)).mcpServers);
      for (const [name, value] of Object.entries(entries)) {
        const raw = object(value);
        const server: CopilotMcpServer = {
          name,
          scope,
          source: file,
          disabled: disabled.has(name),
          transport:
            typeof raw.type === "string"
              ? raw.type
              : typeof raw.url === "string"
                ? "http"
                : "stdio",
        };
        if (typeof raw.command === "string") {
          server.command = maskCommand(raw.command);
          server.args = maskArgs(list(raw.args));
        }
        if (raw.url !== undefined) {
          server.url = maskUrl(raw.url);
        }
        if (isObject(raw.env)) {
          server.env = maskMap(raw.env);
        }
        if (isObject(raw.headers)) {
          server.headers = maskMap(raw.headers, maskHeader);
        }
        const earlier = servers.get(name);
        if (earlier) {
          server.overrides = earlier.source;
        }
        servers.set(name, server);
      }
    };
    addServers(join(ch, "mcp-config.json"), "user");
    const workspaceFile = [
      join(root, ".mcp.json"),
      join(root, ".github", "mcp.json"),
    ].find(existsSync);
    if (workspaceFile) {
      addServers(workspaceFile, "workspace");
    }

    const agents: CopilotAgent[] = [];
    const addAgents = (dir: string, scope: Scope): void => {
      for (const file of filesWith(dir, ".md")) {
        const name =
          frontmatter(text(file)).name?.trim() ||
          basename(file).replace(/(\.agent)?\.md$/, "");
        agents.push({ name, scope, source: file });
      }
    };
    addAgents(join(ch, "agents"), "user");
    addAgents(join(root, ".github", "agents"), "repo");
    addAgents(join(root, ".claude", "agents"), "repo");

    return {
      present: existsSync(ch),
      signedIn,
      skills,
      instructions,
      hooks,
      mcp: [...servers.values()],
      agents,
      includeCoAuthoredBy,
      trusted,
      errors: uniqueErrors(errors),
    };
  };

  return { read };
};
