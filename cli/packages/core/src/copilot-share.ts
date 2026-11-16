// Share Claude user items with GitHub Copilot, and take them back. Sharing is global (Copilot's user folder <ch>), so it
// applies to all projects. Decisions: docs/decisions.md. Copilot facts: cli/docs/copilot-config-sources.md.
//
// A share is one of:
//   link   <ch>/skills/<name> or <ch>/agents/<file>.md, a symlink to the Claude item (a skill: its realpath, Decision 3)
//   write  a generated file, e.g. <ch>/instructions/<name>.instructions.md for a rule
// and is taken back with `unlink` or `delete`. An MCP server is one more:
//   mcpAdd  the entry mcpServers[<name>] in <ch>/mcp-config.json, translated by copilot-mcp.ts (only ${VAR} values)
// taken back with `mcpRemove`. It is a strict JSON text fix on that regular file (json-edit.ts: every other byte stays;
// a link or non-strict file is refused), and the store records sha256 of the parsed entry, not the entry.
//
// Every change goes through the fix engine (fix.ts) with an injected DoctorLike, as mcp-edit.ts does: masked preview,
// confirm or --yes, a backup set, verify, and `agentry fix --undo`. A link is created and removed with path fixes (lstat
// only, never followed), so undo removes only <ch>/skills/<name> and never the Claude folder it points at.
//
// Ownership store <config dir>/agentry/copilot-shares.json:
//   { version: 1, items: { "<kind>:<name>": { path, target? (link), sha256? (generated file), sharedAt } } }
// It holds no secrets. It is written by the same fix run as the change (atomic, backed up), so `agentry fix --undo`
// puts the record back together with the link. A missing or unreadable store reads as empty. agentry removes only what
// the store records and what still matches it (same link target, same sha256).
//
// Exit codes (as mcp-toggle.ts): 0 done, previewed, declined or already so; 1 refused or failed; 2 usage.

import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import {
  addEntryText,
  type CopilotMcpEntry,
  claudeUserServers,
  entryHash,
  mcpConfigPath,
  mcpNotes,
  readMcpServers,
  removeEntryText,
  translateMcp,
} from "./copilot-mcp.js";
import { toInstructions } from "./copilot-rules.js";
import { createFix, pathSnapshot } from "./fix.js";
import { isObject, list } from "./inventory/common.js";
import { createCopilotReader } from "./inventory/copilot.js";
import {
  createSkillsReader,
  inspectSkillFolder,
  subdirs,
} from "./inventory/skills.js";
import { messages } from "./messages.js";
import type { Paths } from "./paths.js";
import type {
  DoctorLike,
  Finding,
  Fix,
  FixOptions,
  FixRegistry,
} from "./types.js";

export const RULE = "copilot-share";
const { copilot: words, core } = messages();
const mcpWords = words.mcp;

export type ShareKind = "skill" | "agent" | "rule" | "mcp";
export type ShareState =
  | "shared"
  | "notShared"
  | "other"
  | "setup"
  | "repoWins";

/** What agentry recorded for one share: a link's target or a generated file's sha256. */
export interface ShareRecord {
  path: string;
  sha256?: string;
  sharedAt: string;
  target?: string;
}

export interface ShareStore {
  items: Record<string, ShareRecord>;
  version: 1;
}

/** One Claude user item and where its share lives under <ch>. */
export interface ShareItem {
  kind: ShareKind;
  name: string;
  /** Where Copilot gets it: the link or generated file under <ch>. */
  path: string;
  /** The Claude original (~/.claude/skills/<name>, agents/<file>.md, rules/<name>.md). */
  source: string;
}

export interface ShareItemState extends ShareItem {
  /** A repo item of the same name wins in this folder. Also set on a shared item (it stays "shared"). */
  repoWins: boolean;
  state: ShareState;
}

/** One change under <ch>. unlink and delete act only on what the store records for kind:name. */
export type ShareChange = { kind: ShareKind; name: string; path: string } & (
  | { op: "link"; target: string }
  | { op: "write"; text: string }
  | { op: "unlink" }
  | { op: "delete" }
  | { op: "mcpAdd"; entry: CopilotMcpEntry }
  | { op: "mcpRemove" }
);

export interface ShareRunArgs {
  dryRun?: boolean;
  /** The folder the run is for (the fix engine's cwd); default process.cwd(). */
  path?: string;
  yes?: boolean;
}

export interface ShareArgs extends ShareRunArgs {
  kind: ShareKind;
  name: string;
}

export interface ShareStateOptions {
  /** More items with their state (the MCP module adds its servers here). */
  extra?: (paths: Paths, cwd: string) => ShareItemState[];
}

/** A change to make, with lines the preview prints first (MCP: the variables to export), or why not. */
type Made =
  | { change: ShareChange; error?: undefined; notes?: string[] }
  | { error: string };

export const shareKey = (kind: ShareKind, name: string): string =>
  `${kind}:${name}`;

const sha256 = (text: string | Buffer): string =>
  createHash("sha256").update(text).digest("hex");

// A store from its text; anything that is not a version 1 store reads as empty (the backup set keeps the old bytes).
export const parseShareStore = (text: string | undefined): ShareStore => {
  const empty: ShareStore = { version: 1, items: {} };
  if (!text?.trim()) {
    return empty;
  }
  try {
    const json: unknown = JSON.parse(text);
    if (!(isObject(json) && json.version === 1 && isObject(json.items))) {
      return empty;
    }
    const items: Record<string, ShareRecord> = {};
    for (const [key, value] of Object.entries(json.items)) {
      if (
        isObject(value) &&
        typeof value.path === "string" &&
        typeof value.sharedAt === "string"
      ) {
        items[key] = {
          path: value.path,
          sharedAt: value.sharedAt,
          ...(typeof value.target === "string" && { target: value.target }),
          ...(typeof value.sha256 === "string" && { sha256: value.sha256 }),
        };
      }
    }
    return { version: 1, items };
  } catch {
    return empty;
  }
};

export const readShareStore = (
  paths: Pick<Paths, "copilotShares">
): ShareStore => {
  try {
    return parseShareStore(readFileSync(paths.copilotShares, "utf8"));
  } catch {
    return parseShareStore(undefined);
  }
};

// What setup.sh recorded in its install manifest (read only): file paths (resolved) and MCP server names it added.
export const readSetupOwned = (
  paths: Pick<Paths, "installManifest">
): { files: Set<string>; mcp: Set<string>; copilotMcp: Set<string> } => {
  const files = new Set<string>();
  const mcp = new Set<string>();
  // Only setup's copilot part writes <ch>/mcp-config.json; its other parts' names are Claude servers.
  const copilotMcp = new Set<string>();
  try {
    const json: unknown = JSON.parse(
      readFileSync(paths.installManifest, "utf8")
    );
    const parts = isObject(json) && isObject(json.parts) ? json.parts : {};
    for (const [partName, part] of Object.entries(parts)) {
      if (!isObject(part)) {
        continue;
      }
      for (const file of list(part.files)) {
        if (isObject(file) && typeof file.path === "string") {
          files.add(resolve(file.path));
        }
      }
      for (const name of list(part.mcp)) {
        if (typeof name === "string") {
          mcp.add(name);
          if (partName === "copilot") {
            copilotMcp.add(name);
          }
        }
      }
    }
  } catch {
    // no manifest (setup never ran) or not JSON: nothing is setup's
  }
  return { files, mcp, copilotMcp };
};

// <ch>/... for a kind and name; the share's location whether or not it exists. MCP has no file of its own.
export const sharePath = (
  paths: Pick<Paths, "copilotDir">,
  kind: Exclude<ShareKind, "mcp">,
  name: string
): string =>
  kind === "skill"
    ? join(paths.copilotDir, "skills", name)
    : kind === "agent"
      ? join(paths.copilotDir, "agents", `${name}.md`)
      : join(paths.copilotDir, "instructions", `${name}.instructions.md`);

const markdownFiles = (dir: string): string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          !entry.name.startsWith(".") &&
          entry.name.endsWith(".md") &&
          (entry.isFile() || entry.isSymbolicLink())
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

// The Claude user items that can be shared: skills (not broken), agents and rules (top-level .md files).
export const claudeShareItems = (paths: Paths): ShareItem[] => {
  const skillsDir = join(paths.configDir, "skills");
  const skills = subdirs(skillsDir)
    .filter((name) => {
      const info = inspectSkillFolder(join(skillsDir, name), paths.shelfDir);
      return info !== undefined && info.kind !== "broken";
    })
    .map(
      (name): ShareItem => ({
        kind: "skill",
        name,
        source: join(skillsDir, name),
        path: sharePath(paths, "skill", name),
      })
    );
  const fromMarkdown = (kind: "agent" | "rule", dir: string): ShareItem[] =>
    markdownFiles(dir).map((file): ShareItem => {
      const name = file.slice(0, -".md".length);
      return {
        kind,
        name,
        source: join(dir, file),
        path: sharePath(paths, kind, name),
      };
    });
  return [
    ...skills,
    ...fromMarkdown("agent", join(paths.configDir, "agents")),
    ...fromMarkdown("rule", join(paths.configDir, "rules")),
  ];
};

// The state of the share at item.path from disk and the store; repoWins is decided by the caller.
export const diskState = (
  item: Pick<ShareItem, "kind" | "name" | "path">,
  store: ShareStore,
  setupFiles: Set<string>
): Exclude<ShareState, "repoWins"> => {
  const snap = pathSnapshot(item.path);
  if (snap.kind === "missing") {
    return "notShared";
  }
  if (setupFiles.has(resolve(item.path))) {
    return "setup";
  }
  const record = store.items[shareKey(item.kind, item.name)];
  if (record?.path === item.path) {
    if (
      record.target !== undefined &&
      snap.kind === "symlink" &&
      snap.linkTarget === record.target
    ) {
      return "shared";
    }
    if (
      record.sha256 !== undefined &&
      snap.kind === "file" &&
      snap.sha256 === record.sha256
    ) {
      return "shared";
    }
  }
  return "other";
};

/**
 * Per Claude user MCP server (top-level mcpServers of ~/.claude.json): its entry in <ch>/mcp-config.json is shared
 * (agentry's, same sha256 as recorded), setup (setup's copilot part added that name), other (anything else there, or a
 * file agentry cannot read safely) or notShared. `repoMcp`: workspace servers Copilot loads in this folder (they win).
 */
export const mcpShareState = (
  paths: Paths,
  {
    store = readShareStore(paths),
    setupMcp = readSetupOwned(paths).copilotMcp,
    repoMcp,
  }: { store?: ShareStore; setupMcp?: Set<string>; repoMcp: Set<string> }
): ShareItemState[] => {
  const file = mcpConfigPath(paths);
  const copilot = readMcpServers(file);
  return Object.keys(claudeUserServers(paths))
    .sort()
    .map((name): ShareItemState => {
      const repoWins = repoMcp.has(name);
      const entry =
        copilot.error === undefined ? copilot.servers[name] : undefined;
      const record = store.items[shareKey("mcp", name)];
      let state: ShareState;
      if (copilot.error !== undefined) {
        state = "other";
      } else if (entry === undefined) {
        state = repoWins ? "repoWins" : "notShared";
      } else if (setupMcp.has(name)) {
        state = "setup";
      } else if (
        record?.path === file &&
        record.sha256 !== undefined &&
        entryHash(entry) === record.sha256
      ) {
        state = "shared";
      } else {
        state = "other";
      }
      return {
        kind: "mcp",
        name,
        path: file,
        source: paths.claudeJson,
        state,
        repoWins,
      };
    });
};

/**
 * Per Claude user item (skills, agents, rules, MCP servers, plus `extra`): shared, notShared, other (something agentry did not
 * write is there), setup (setup's install manifest owns it) or repoWins (not shared, and a repo item of the same name
 * would hide it anyway). A shared item keeps "shared" and says repoWins: true when the repo's own wins.
 */
export const shareState = (
  paths: Paths,
  cwd: string,
  { extra }: ShareStateOptions = {}
): ShareItemState[] => {
  const store = readShareStore(paths);
  const { files, copilotMcp } = readSetupOwned(paths);
  const copilot = createCopilotReader(paths).read({ cwd });
  const repoNames = {
    skill: new Set(
      copilot.skills
        .filter((skill) => skill.scope === "repo")
        .map((skill) => skill.name)
    ),
    agent: new Set(
      copilot.agents
        .filter((agent) => agent.scope === "repo")
        .map((agent) => agent.name)
    ),
    mcp: new Set(
      copilot.mcp
        .filter((server) => server.scope === "workspace")
        .map((server) => server.name)
    ),
  };
  const states = claudeShareItems(paths).map((item): ShareItemState => {
    const repoWins =
      (item.kind === "skill" || item.kind === "agent") &&
      repoNames[item.kind].has(item.name);
    const state = diskState(item, store, files);
    return {
      ...item,
      state: state === "notShared" && repoWins ? "repoWins" : state,
      repoWins,
    };
  });
  const servers = mcpShareState(paths, {
    store,
    setupMcp: copilotMcp,
    repoMcp: repoNames.mcp,
  });
  return [...states, ...servers, ...(extra?.(paths, cwd) ?? [])];
};

// Where `path` really is, resolving the folders that exist (the last part may be missing).
const resolveExisting = (path: string): string => {
  const rest: string[] = [];
  let dir = resolve(path);
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) {
      break;
    }
    rest.unshift(basename(dir));
    dir = up;
  }
  try {
    return join(realpathSync(dir), ...rest);
  } catch {
    return join(dir, ...rest);
  }
};

const inside = (child: string, parent: string): boolean =>
  child === parent || child.startsWith(parent + sep);

const NAME = /^[^/\\\0]+$/;
const validName = (name: string): boolean =>
  NAME.test(name) && !name.startsWith(".");

export const createCopilotShare = (
  paths: Paths,
  { out = console.log, err = console.error, ...fixOptions }: FixOptions = {}
) => {
  const now = fixOptions.now ?? (() => new Date());
  const tilde = (text: unknown): string =>
    paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text);
  const kindWord = (kind: ShareKind): string => words.kinds[kind];

  // What the store should hold for kind:name after the change (undefined: no record).
  const recordAfter = (change: ShareChange): ShareRecord | undefined => {
    if (change.op === "link") {
      return {
        path: change.path,
        target: change.target,
        sharedAt: now().toISOString(),
      };
    }
    if (change.op === "write") {
      return {
        path: change.path,
        sha256: sha256(change.text),
        sharedAt: now().toISOString(),
      };
    }
    if (change.op === "mcpAdd") {
      return {
        path: change.path,
        sha256: entryHash(change.entry),
        sharedAt: now().toISOString(),
      };
    }
    return undefined;
  };

  // The entry mcpServers[name] in the change's mcp-config.json (undefined: none), or { error } when unreadable.
  const mcpEntry = (
    change: ShareChange
  ): { entry?: unknown; error?: "notRegular" | "notJson" } => {
    const read = readMcpServers(change.path);
    return read.error === undefined
      ? { entry: read.servers[change.name] }
      : { error: read.error };
  };

  // True once the change is on disk and in the store (the doctor stand-in reports the finding until then).
  const reached = (change: ShareChange): boolean => {
    const record =
      readShareStore(paths).items[shareKey(change.kind, change.name)];
    if (change.op === "mcpAdd" || change.op === "mcpRemove") {
      const { entry, error } = mcpEntry(change);
      if (error !== undefined) {
        return false;
      }
      if (change.op === "mcpRemove") {
        return entry === undefined && record === undefined;
      }
      const want = entryHash(change.entry);
      return (
        entry !== undefined &&
        entryHash(entry) === want &&
        record?.path === change.path &&
        record.sha256 === want
      );
    }
    const snap = pathSnapshot(change.path);
    if (change.op === "link") {
      return (
        snap.kind === "symlink" &&
        snap.linkTarget === change.target &&
        record?.path === change.path &&
        record.target === change.target
      );
    }
    if (change.op === "write") {
      const want = sha256(change.text);
      return (
        snap.kind === "file" &&
        snap.sha256 === want &&
        record?.path === change.path &&
        record.sha256 === want
      );
    }
    return snap.kind === "missing" && record === undefined;
  };

  // check() for an MCP entry: the file must be a regular strict JSON file (or missing, for an add); an add needs the name
  // free (or already ours and the same), a remove needs agentry's record and the entry unchanged since.
  const checkMcp = (
    change: ShareChange & { op: "mcpAdd" | "mcpRemove" },
    record: ShareRecord | undefined
  ): { refused?: string; already?: string; record?: ShareRecord } => {
    const shown = tilde(change.path);
    const kind = kindWord(change.kind);
    const { entry, error } = mcpEntry(change);
    if (error !== undefined) {
      return { refused: mcpWords[error](shown) };
    }
    const ours =
      entry !== undefined &&
      record?.path === change.path &&
      record.sha256 !== undefined &&
      entryHash(entry) === record.sha256;
    const setup = readSetupOwned(paths).copilotMcp.has(change.name);
    if (change.op === "mcpAdd") {
      if (reached(change)) {
        return { already: words.alreadyShared(kind, change.name) };
      }
      if (entry === undefined) {
        return {};
      }
      if (setup) {
        return { refused: mcpWords.setupOwned(change.name) };
      }
      return {
        refused: ours
          ? mcpWords.sharedDiffers(change.name)
          : mcpWords.taken(change.name, shown),
      };
    }
    if (entry === undefined) {
      return { already: words.alreadyNotShared(kind, change.name) };
    }
    if (setup) {
      return { refused: mcpWords.setupOwned(change.name) };
    }
    if (record?.path !== change.path || record.sha256 === undefined) {
      return { refused: mcpWords.taken(change.name, shown) };
    }
    return ours
      ? { record }
      : { refused: mcpWords.changed(change.name, shown) };
  };

  /**
   * Why the change may not run, `{ already }` when it is already so, or `{}` to go ahead. Shared by every kind: <ch>
   * must exist, the path must be under <ch> and must not resolve into Claude's folder, setup's files are refused, and
   * unlink/delete need the store's record and the same link target or sha256 on disk.
   */
  const check = (
    change: ShareChange
  ): { refused?: string; already?: string; record?: ShareRecord } => {
    const shown = tilde(change.path);
    if (!existsSync(paths.copilotDir)) {
      return { refused: words.noCopilot(tilde(paths.copilotDir)) };
    }
    if (!inside(resolve(change.path), resolve(paths.copilotDir))) {
      return { refused: words.outsideCopilot(shown) };
    }
    const real = resolveExisting(dirname(change.path));
    if (inside(real, resolveExisting(paths.configDir))) {
      return { refused: words.insideClaude(shown) };
    }
    if (readSetupOwned(paths).files.has(resolve(change.path))) {
      return { refused: words.setupOwned(shown) };
    }
    const record =
      readShareStore(paths).items[shareKey(change.kind, change.name)];
    if (change.op === "mcpAdd" || change.op === "mcpRemove") {
      return checkMcp(change, record);
    }
    const snap = pathSnapshot(change.path);
    const kind = kindWord(change.kind);
    if (change.op === "link" || change.op === "write") {
      if (reached(change)) {
        return { already: words.alreadyShared(kind, change.name) };
      }
      if (snap.kind === "missing") {
        return {};
      }
      const ours =
        record?.path === change.path &&
        ((record.target !== undefined &&
          snap.kind === "symlink" &&
          snap.linkTarget === record.target) ||
          (record.sha256 !== undefined &&
            snap.kind === "file" &&
            snap.sha256 === record.sha256));
      return {
        refused: ours
          ? words.sharedElsewhere(shown, tilde(record.target ?? change.path))
          : words.taken(shown),
      };
    }
    if (snap.kind === "missing") {
      return { already: words.alreadyNotShared(kind, change.name) };
    }
    if (record?.path !== change.path) {
      return { refused: words.taken(shown) };
    }
    const same =
      change.op === "unlink"
        ? record.target !== undefined &&
          snap.kind === "symlink" &&
          snap.linkTarget === record.target
        : record.sha256 !== undefined &&
          snap.kind === "file" &&
          snap.sha256 === record.sha256;
    return same ? { record } : { refused: words.changed(shown) };
  };

  /** Previews (dryRun, or no terminal without yes) or applies one change through the fix engine. */
  const run = async (
    change: ShareChange,
    { path, yes = false, dryRun = false }: ShareRunArgs = {}
  ): Promise<number> => {
    const cwd = resolve(path ?? process.cwd());
    const kind = kindWord(change.kind);
    const checked = check(change);
    if (checked.refused !== undefined) {
      err(core.refused(checked.refused));
      return 1;
    }
    if (checked.already !== undefined) {
      out(checked.already);
      return 0;
    }
    const adding =
      change.op === "link" || change.op === "write" || change.op === "mcpAdd";
    const shown = tilde(change.path);
    const finding: Finding = {
      id: RULE,
      severity: "info",
      message: `${shareKey(change.kind, change.name)} should be ${adding ? "shared" : "not shared"} at ${change.path}`,
      file: change.path,
    };
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: paths.projectRoot(cwd) },
        findings: reached(change) ? [] : [finding],
        errors: [],
      }),
    });
    const describe = () =>
      adding
        ? words.describeShare(kind, change.name, shown)
        : words.describeUnshare(kind, change.name, shown);
    const { record } = checked;
    const pathFix = (): Fix => {
      switch (change.op) {
        case "link":
          return {
            ruleId: RULE,
            file: change.path,
            describe,
            change: { link: change.target },
          };
        case "write":
          return {
            ruleId: RULE,
            file: change.path,
            createParents: true,
            describe,
            apply: (text) => (text === "" ? change.text : text),
          };
        case "unlink":
          return {
            ruleId: RULE,
            file: change.path,
            describe,
            change: { unlink: record?.target as string },
          };
        case "delete":
          return {
            ruleId: RULE,
            file: change.path,
            describe,
            change: { remove: record?.sha256 as string },
          };
        // A strict JSON text fix on the regular file <ch>/mcp-config.json (check() refused a link or bad JSON).
        case "mcpAdd":
          return {
            ruleId: RULE,
            file: change.path,
            createParents: true,
            describe,
            apply: (text) => addEntryText(text, change.name, change.entry),
          };
        case "mcpRemove":
          return {
            ruleId: RULE,
            file: change.path,
            describe,
            apply: (text) =>
              removeEntryText(text, change.name, record?.sha256 as string),
          };
        default: {
          const never: never = change;
          throw new Error(`unknown share change ${String(never)}`);
        }
      }
    };
    const storeFix: Fix = {
      ruleId: RULE,
      file: paths.copilotShares,
      createParents: true,
      describe: () => words.describeRecord(tilde(paths.copilotShares)),
      apply: (text) => {
        const store = parseShareStore(text);
        const key = shareKey(change.kind, change.name);
        const next = recordAfter(change);
        if (next) {
          store.items[key] = next;
        } else {
          delete store.items[key];
        }
        return `${JSON.stringify(store, null, 2)}\n`;
      },
    };
    const fixes: FixRegistry = { [RULE]: () => [pathFix(), storeFix] };
    const code = await createFix(paths, {
      out,
      err,
      ...fixOptions,
      doctor,
      fixes,
    }).run({ path: cwd, yes, dryRun });
    if (code === 0 && !dryRun && reached(change)) {
      out(
        adding
          ? words.sharedDone(kind, change.name)
          : words.unsharedDone(kind, change.name)
      );
    }
    return code;
  };

  // The user skill's share: a link to its realpath (Decision 3, so a library skill stays shared when Claude's link is off).
  const skillChange = (name: string, cwd: string): Made => {
    const dir = join(paths.configDir, "skills");
    const source = join(dir, name);
    const info = inspectSkillFolder(source, paths.shelfDir);
    if (!info || info.kind === "broken") {
      const other = createSkillsReader(paths)
        .read({ cwd })
        .skills.some((skill) => skill.name === name && skill.scope !== "user");
      return {
        error: other
          ? words.notUserSkill(name)
          : words.noUserSkill(name, tilde(dir)),
      };
    }
    const target = realpathSync(source);
    if (!isAbsolute(target)) {
      return { error: words.missingSource(tilde(source)) };
    }
    return {
      change: {
        kind: "skill",
        name,
        path: sharePath(paths, "skill", name),
        op: "link",
        target,
      },
    };
  };

  const isFile = (path: string): boolean => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  };

  // A user agent's share: a link to the file; refused when the repo has an agent of that name.
  const agentChange = (name: string, cwd: string): Made => {
    const dir = join(paths.configDir, "agents");
    const source = join(dir, `${name}.md`);
    if (!isFile(source)) {
      const root = paths.projectRoot(cwd);
      const other = [join(root, ".claude", "agents", `${name}.md`)].some(
        isFile
      );
      return {
        error: other
          ? words.notUserAgent(name)
          : words.noUserAgent(name, tilde(dir)),
      };
    }
    const repoAgent = createCopilotReader(paths)
      .read({ cwd })
      .agents.some((agent) => agent.scope === "repo" && agent.name === name);
    if (repoAgent) {
      return { error: words.repoAgent(name) };
    }
    return {
      change: {
        kind: "agent",
        name,
        path: sharePath(paths, "agent", name),
        op: "link",
        target: realpathSync(source),
      },
    };
  };

  // A user rule's share: <ch>/instructions/<name>.instructions.md written from the rule.
  const ruleChange = (name: string): Made => {
    const dir = join(paths.configDir, "rules");
    const source = join(dir, `${name}.md`);
    if (!isFile(source)) {
      return { error: words.noUserRule(name, tilde(dir)) };
    }
    return {
      change: {
        kind: "rule",
        name,
        path: sharePath(paths, "rule", name),
        op: "write",
        text: toInstructions(readFileSync(source, "utf8")),
      },
    };
  };

  // A Claude user MCP server's share: its Copilot entry with ${VAR} values only (copilot-mcp.ts), plus the variables to
  // export. A project or plugin server is refused (Copilot already loads the repo's .mcp.json).
  const mcpChange = (name: string, cwd: string): Made => {
    const servers = claudeUserServers(paths);
    if (!Object.hasOwn(servers, name)) {
      const repo = createCopilotReader(paths)
        .read({ cwd })
        .mcp.some(
          (server) => server.scope === "workspace" && server.name === name
        );
      return {
        error: repo
          ? mcpWords.notUserServer(name)
          : mcpWords.noUserServer(name, tilde(paths.claudeJson)),
      };
    }
    const made = translateMcp(name, servers[name]);
    if ("error" in made) {
      return { error: made.error };
    }
    return {
      change: {
        kind: "mcp",
        name,
        path: mcpConfigPath(paths),
        op: "mcpAdd",
        entry: made.entry,
      },
      notes: mcpNotes(made),
    };
  };

  // The change that shares kind:name, or { error } (MCP servers come with copilot-mcp.ts).
  const shareChange = (
    kind: ShareKind,
    name: string,
    cwd: string = process.cwd()
  ): Made => {
    switch (kind) {
      case "skill":
        return skillChange(name, cwd);
      case "agent":
        return agentChange(name, cwd);
      case "rule":
        return ruleChange(name);
      case "mcp":
        return mcpChange(name, cwd);
      default:
        return { error: words.kindNotYet(kindWord(kind)) };
    }
  };

  /** Share a Claude user item with Copilot for all projects. */
  const share = ({ kind, name, ...args }: ShareArgs): Promise<number> => {
    if (!validName(name)) {
      err(words.badName(name));
      return Promise.resolve(2);
    }
    const cwd = resolve(args.path ?? process.cwd());
    const made = shareChange(kind, name, cwd);
    if (made.error !== undefined) {
      err(core.refused(made.error));
      return Promise.resolve(1);
    }
    if (
      shareState(paths, cwd).some(
        (item) => item.kind === kind && item.name === name && item.repoWins
      )
    ) {
      out(words.repoWins(kindWord(kind), name));
    }
    // The notes (variables to export: names only) only when the change will be previewed or made.
    if (made.notes) {
      const checked = check(made.change);
      if (checked.refused === undefined && checked.already === undefined) {
        for (const line of made.notes) {
          out(line);
        }
      }
    }
    return run(made.change, args);
  };

  /** Take back what agentry shared: only what the store records and what still matches it. */
  const unshare = ({ kind, name, ...args }: ShareArgs): Promise<number> => {
    if (!validName(name)) {
      err(words.badName(name));
      return Promise.resolve(2);
    }
    const record = readShareStore(paths).items[shareKey(kind, name)];
    if (kind === "mcp") {
      return run(
        {
          kind,
          name,
          path: record?.path ?? mcpConfigPath(paths),
          op: "mcpRemove",
        },
        args
      );
    }
    const path = record?.path ?? sharePath(paths, kind, name);
    return run(
      {
        kind,
        name,
        path,
        op: record?.sha256 === undefined ? "unlink" : "delete",
      },
      args
    );
  };

  return { check, run, share, unshare, shareChange };
};
