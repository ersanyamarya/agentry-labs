// The agentry-labs catalog: a shallow git clone of the repo, cached under <cacheDir>/catalog. It lists five kinds of item:
//   skill      skills/<name>/               -> the shelf, off (group = its bundle in bundles.tsv; none = "extras")
//   agent      agents/<name>.agent.md       -> ~/.claude/agents/, or <project>/.claude/agents/ with project
//   rule       rules/<name>.md              -> ~/.claude/rules/
//   claude-md  claude-md-files/<name>.md    -> <project>/CLAUDE.md, only when the project has none
//   mcp        a server of global/mcp.json  -> lib/mcp-edit.mjs `add` (masked preview, backup, undo), user or project scope
// Items are named kind/name; a bare name works when it is unique. `add` never overwrites. `update` replaces an installed
// skill, agent, rule or CLAUDE.md file with the catalog's copy: previewed per file, the current copy saved under
// <backups>/updated/ first, and only after a y (or --yes). An item is `outdated` when any file differs from the cached clone
// or is missing locally. A CLAUDE.md counts as installed when the project's one is identical to the catalog file or starts
// with the same `# heading`. An MCP server is outdated when its user-scope command entry has other args than the catalog's or
// lacks one of its env keys; `update` applies that through mcp-edit `set` (masked preview, backup, undo) and never touches an
// env value you already have, a url server or another scope. `remove` takes an installed agent away, keeping a copy under
// <backups>/removed/. Removing a skill is `shelf remove`, a rule `rules remove`. Only `refresh` touches the network.

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import {
  defaultConfirm,
  noteUpdatedCopy,
  removedCopyPath,
  saveRemovedCopy,
} from "./backups.js";
import { isObject, readJson } from "./inventory/common.js";
import { createMcpReader } from "./inventory/mcp.js";
import type { BuildArgs, McpEditOptions } from "./mcp-edit.js";
import { createMcpEdit } from "./mcp-edit.js";
import { summarize } from "./mcp-toggle.js";
import type { Paths } from "./paths.js";
import { createShelf } from "./shelf.js";
import {
  descriptionTokens,
  estimateTokens,
  readDescription,
} from "./tokens.js";
import type { ClaudeJson, McpJson, McpServerRaw } from "./types.js";

export const CATALOG_REPO = "https://github.com/ersanyamarya/agentry-labs.git";

export type CatalogKind = "skill" | "agent" | "rule" | "claude-md" | "mcp";

export const KINDS: CatalogKind[] = [
  "skill",
  "agent",
  "rule",
  "claude-md",
  "mcp",
];
const isKind = (value: string): value is CatalogKind =>
  (KINDS as string[]).includes(value);
const UPDATABLE = new Set<CatalogKind>(KINDS);
const IGNORED = new Set([".DS_Store", "node_modules"]);
const BUNDLE_DIRS: Record<string, CatalogKind> = {
  skills: "skill",
  agents: "agent",
  rules: "rule",
  "claude-md-files": "claude-md",
};

/** One place an item is installed. File kinds have a path; an MCP server does not. */
export interface CatalogInstall {
  label: string;
  outdated: boolean;
  path?: string;
  scope: string;
}

type FileInstall = CatalogInstall & { path: string };

/** What `catalog list --json` shows for an item. */
export interface CatalogEntry {
  bundle: string;
  description: string;
  global?: boolean;
  id: string;
  installed?: string;
  installs: CatalogInstall[];
  kind: CatalogKind;
  name: string;
  outdated: boolean;
  shelf?: string | null;
  tokens: number | null;
}

/** An entry plus what installing needs. `source` and `file` are set for the kinds that copy files (not mcp), `raw` for mcp. */
export interface CatalogItem extends CatalogEntry {
  file: string;
  raw: McpServerRaw;
  source: string;
}

interface InstallInput {
  label: string;
  outdated?: boolean;
  path?: string;
  scope: string;
}

interface ItemFields {
  description: string;
  file?: string;
  global?: boolean;
  installs?: (InstallInput | null | false | undefined)[];
  raw?: McpServerRaw;
  shelf?: string | null;
  source?: string;
  tokens: number | null;
}

interface McpChange {
  args?: string[];
  env: string[];
}
interface McpServerJob {
  entry: CatalogItem;
  change: McpChange;
}
type Picked =
  | { entry: CatalogItem; error?: undefined }
  | { error: string; entry?: undefined };

export interface CatalogOptions {
  confirm?: (question: string) => Promise<boolean>;
  err?: (text: string) => void;
  isTTY?: () => boolean;
  mcp?: McpEditOptions;
  now?: () => Date;
  out?: (text: string) => void;
  repo?: string;
  run?: (args: string[]) => unknown;
}

const git = (args: string[]): Buffer =>
  execFileSync("git", args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });

const filesIn = (dir: string, base: string = dir): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !IGNORED.has(entry.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesIn(join(dir, entry.name), base)
        : [relative(base, join(dir, entry.name))]
    )
    .sort();

// Line endings are ignored, so a CRLF checkout does not make everything look edited.
const sameFile = (a: string, b: string): boolean =>
  readFileSync(a, "latin1").replace(/\r\n/g, "\n") ===
  readFileSync(b, "latin1").replace(/\r\n/g, "\n");

// How the installed copy `dest` differs from the catalog's `source` (a folder or a file): { changed, added, extra } as
// relative names ("" for a single file). Files only in the installed copy (extra) do not make it outdated and are never touched.
const diffOf = (
  source: string,
  dest: string
): { changed: string[]; added: string[]; extra: string[] } => {
  const folder = statSync(source).isDirectory();
  if (statSync(dest).isDirectory() !== folder) {
    return { changed: [""], added: [], extra: [] };
  }
  const [wanted, have] = folder
    ? [filesIn(source), filesIn(dest)]
    : [[""], [""]];
  const at = (root: string, name: string): string =>
    name ? join(root, name) : root;
  return {
    changed: wanted.filter(
      (name) =>
        have.includes(name) && !sameFile(at(source, name), at(dest, name))
    ),
    added: wanted.filter((name) => !have.includes(name)),
    extra: have.filter((name) => !wanted.includes(name)),
  };
};

// A real (not linked) installed skill, agent or rule that lacks or differs from a file of the catalog's copy.
const isOutdated = (
  kind: CatalogKind,
  source: string,
  path: string | undefined
): boolean => {
  if (!(path && UPDATABLE.has(kind)) || lstatSync(path).isSymbolicLink()) {
    return false;
  }
  const { changed, added } = diffOf(source, path);
  return changed.length + added.length > 0;
};

// What `update` changes on a user-scope command server: { args?, env: ["K=V"...] } (env keys the entry lacks), or null.
// Existing env values are yours (tokens) and stay; url servers and a different command are left alone.
const mcpChangeOf = (raw: McpServerRaw, current: unknown): McpChange | null => {
  if (
    !isObject(current) ||
    typeof raw.command !== "string" ||
    current.command !== raw.command
  ) {
    return null;
  }
  const env = Object.entries(isObject(raw.env) ? raw.env : {})
    .filter(([key]) => !(isObject(current.env) && key in current.env))
    .map(([key, value]) => `${key}=${value}`);
  const args =
    JSON.stringify(raw.args ?? []) === JSON.stringify(current.args ?? [])
      ? undefined
      : [...((raw.args ?? []) as string[])];
  return args === undefined && env.length === 0
    ? null
    : { ...(args !== undefined && { args }), env };
};

// Where an install of each kind lives, as `catalog list` words it.
const WHERE: Record<string, string> = {
  skill: "~/.claude/skills",
  agent: "~/.claude/agents",
  rule: "~/.claude/rules",
};

const firstHeading = (file: string): string =>
  readFileSync(file, "utf8")
    .split("\n")
    .find((line) => /^#\s/.test(line))
    ?.replace(/^#\s+/, "") ?? "";

// MCP options for lib/mcp-edit.mjs `add` from a catalog server config ({ url, headers } or { command, args, env }).
const mcpOptionsOf = (raw: McpServerRaw): BuildArgs =>
  raw.url === undefined
    ? {
        command: raw.command as string,
        args: (raw.args ?? []) as string[],
        env: Object.entries((raw.env ?? {}) as Record<string, unknown>).map(
          ([key, value]) => `${key}=${value}`
        ),
      }
    : {
        url: raw.url as string,
        headers: Object.entries(
          (raw.headers ?? {}) as Record<string, unknown>
        ).map(([key, value]) => `${key}:${value}`),
      };

export const createCatalog = (
  paths: Paths,
  {
    out = console.log,
    err = console.error,
    repo = process.env.AGENTRY_CATALOG_REPO || CATALOG_REPO,
    run = git,
    now = () => new Date(),
    isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    confirm = defaultConfirm,
    mcp = {},
  }: CatalogOptions = {}
) => {
  const dir = join(paths.cacheDir, "catalog");
  const fetched = () => existsSync(join(dir, "skills"));
  const tilde = (text: unknown): string =>
    paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text);

  const refresh = (): number => {
    try {
      if (existsSync(join(dir, ".git"))) {
        // A depth-1 clone cannot fast-forward (its history is rewritten), so fetch the tip and move to it.
        run(["-C", dir, "fetch", "--depth", "1", "origin", "HEAD"]);
        run(["-C", dir, "reset", "--hard", "FETCH_HEAD"]);
      } else {
        mkdirSync(dirname(dir), { recursive: true });
        run(["clone", "--depth", "1", repo, dir]);
      }
    } catch (error) {
      err(
        `Could not fetch the catalog from ${repo}: ${String(
          (error as { stderr?: unknown; message: string }).stderr ??
            (error as Error).message
        )
          .trim()
          .split("\n")
          .at(-1)}`
      );
      return 1;
    }
    out(`catalog up to date (${entries().length} items)`);
    return 0;
  };

  // kind/name -> bundle, from the selectors of bundles.tsv (skills/x, agents/x.agent.md, rules/x.md, claude-md-files/x.md).
  const bundleOf = (): Map<string, string> => {
    const file = join(dir, "bundles.tsv");
    const map = new Map<string, string>();
    for (const line of existsSync(file)
      ? readFileSync(file, "utf8").split("\n")
      : []) {
      const [bundle, selector] = line.split("\t");
      const [folder, ...rest] = (selector ?? "").split("/");
      if (
        bundle &&
        !bundle.startsWith("#") &&
        BUNDLE_DIRS[folder] &&
        rest.length > 0
      ) {
        map.set(
          `${BUNDLE_DIRS[folder]}/${rest.join("/").replace(/(\.agent)?\.md$/, "")}`,
          bundle
        );
      }
    }
    return map;
  };

  const root = () => paths.projectRoot();
  const agentPath = (project: boolean, file: string): string =>
    project
      ? join(root(), ".claude", "agents", file)
      : join(paths.configDir, "agents", file);
  const claudeMdPaths = () => [
    join(root(), "CLAUDE.md"),
    join(root(), ".claude", "CLAUDE.md"),
  ];

  const mcpInstalled = (): Map<string, string[]> => {
    try {
      const found = new Map<string, string[]>();
      for (const server of createMcpReader(paths).read({ cwd: root() })
        .servers) {
        found.set(server.name, [
          ...(found.get(server.name) ?? []),
          server.scope,
        ]);
      }
      return found;
    } catch {
      return new Map();
    }
  };

  // Every item with its install state, [] until the catalog is fetched. Internal: carries `source` and `raw`.
  const items = (): CatalogItem[] => {
    if (!fetched()) {
      return [];
    }
    const bundles = bundleOf();
    const shelved = new Map(
      createShelf(paths, {
        out: () => undefined,
        err: () => undefined,
        warn: () => undefined,
      })
        .groups()
        .flatMap((group) =>
          group.items
            // biome-ignore lint/suspicious/noShadow: the inner name is local to this callback
            .filter((item) => item.kind === "skills")
            // biome-ignore lint/suspicious/noShadow: the inner name is local to this callback
            .map((item): [string, string] => [item.name, group.name])
        )
    );
    const found: CatalogItem[] = [];
    const item = (
      kind: CatalogKind,
      name: string,
      fields: ItemFields
    ): void => {
      const bundle =
        bundles.get(`${kind}/${name}`) ??
        (kind === "mcp" ? "global" : "extras");
      const installs = (fields.installs ?? [])
        .filter((one): one is InstallInput => Boolean(one))
        .map(
          (one): CatalogInstall => ({
            ...one,
            outdated:
              Boolean(one.outdated) ||
              isOutdated(kind, fields.source as string, one.path),
          })
        );
      const { installs: _unused, ...rest } = fields;
      found.push({
        kind,
        name,
        id: `${kind}/${name}`,
        bundle,
        ...rest,
        installs,
        installed:
          installs.length > 0
            ? installs.map((one) => one.label).join(", ")
            : undefined,
        outdated: installs.some((one) => one.outdated),
      } as CatalogItem);
    };

    const skillsDir = join(dir, "skills");
    for (const { name } of readdirSync(skillsDir, {
      withFileTypes: true,
    }).filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(skillsDir, entry.name, "SKILL.md"))
    )) {
      const file = join(skillsDir, name, "SKILL.md");
      const shelf = shelved.get(name) ?? null;
      const global = existsSync(join(paths.configDir, "skills", name));
      item("skill", name, {
        source: join(skillsDir, name),
        description: readDescription(file),
        tokens: descriptionTokens(file),
        shelf,
        global,
        installs: [
          shelf
            ? {
                scope: "shelf",
                label: `shelf/${shelf}`,
                path: join(paths.shelfDir, shelf, name),
              }
            : global
              ? {
                  scope: "user",
                  label: "global",
                  path: join(paths.configDir, "skills", name),
                }
              : null,
        ],
      });
    }
    const files = (folder: string, suffix: string): string[] =>
      existsSync(join(dir, folder))
        ? readdirSync(join(dir, folder), { withFileTypes: true })
            .filter(
              (entry) =>
                entry.isFile() &&
                entry.name.endsWith(suffix) &&
                entry.name !== "README.md"
            )
            .map((entry) => entry.name)
        : [];
    for (const file of files("agents", ".agent.md")) {
      const source = join(dir, "agents", file);
      const [user, project] = [agentPath(false, file), agentPath(true, file)];
      item("agent", file.replace(/\.agent\.md$/, ""), {
        file,
        source,
        description: readDescription(source),
        tokens: descriptionTokens(source),
        installs: [
          existsSync(user) && { scope: "user", label: "global", path: user },
          existsSync(project) && {
            scope: "project",
            label: "project",
            path: project,
          },
        ],
      });
    }
    for (const [kind, folder] of [
      ["rule", "rules"],
      ["claude-md", "claude-md-files"],
    ] as const) {
      for (const file of files(folder, ".md")) {
        const source = join(dir, folder, file);
        const to =
          kind === "rule"
            ? join(paths.configDir, "rules", file)
            : (claudeMdPaths().find((one) => existsSync(one)) ??
              claudeMdPaths()[0]);
        const same =
          existsSync(to) &&
          (kind === "rule" ||
            sameFile(source, to) ||
            (firstHeading(source) !== "" &&
              firstHeading(source) === firstHeading(to)));
        item(kind, file.replace(/\.md$/, ""), {
          file,
          source,
          description: readDescription(source) || firstHeading(source),
          tokens: estimateTokens(readFileSync(source, "utf8")),
          installs: [
            same && {
              scope: kind === "rule" ? "user" : "project",
              label: kind === "rule" ? "global" : "project",
              path: to,
            },
          ],
        });
      }
    }
    const servers = ((): Record<string, McpServerRaw> => {
      try {
        return ((
          JSON.parse(
            readFileSync(join(dir, "global", "mcp.json"), "utf8")
          ) as McpJson
        ).mcpServers ?? {}) as Record<string, McpServerRaw>;
      } catch {
        return {};
      }
    })();
    const present = mcpInstalled();
    for (const [name, raw] of Object.entries(servers)) {
      item("mcp", name, {
        raw,
        description: summarize(raw),
        tokens: null,
        installs: present.has(name)
          ? [
              {
                scope: "mcp",
                label: (present.get(name) as string[]).join(", "),
                outdated:
                  mcpChangeOf(
                    raw,
                    readJson<ClaudeJson>(paths.claudeJson, [])?.mcpServers?.[
                      name
                    ]
                  ) !== null,
              },
            ]
          : [],
      });
    }
    return found.sort(
      (a, b) =>
        KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
        a.bundle.localeCompare(b.bundle) ||
        a.name.localeCompare(b.name)
    );
  };

  // [{ kind, name, id, bundle, description, tokens, installed (text or undefined), outdated, installs[], shelf?, global? }]
  const entries = (): CatalogEntry[] =>
    items().map(({ source, raw, file, ...rest }) => rest);

  const needFetched = (): boolean => {
    if (!fetched()) {
      err("The catalog is not fetched yet: run agentry catalog refresh");
      return false;
    }
    return true;
  };

  const list = ({ json = false }: { json?: boolean } = {}): number => {
    if (!needFetched()) {
      return 1;
    }
    const all = entries();
    if (json) {
      out(JSON.stringify(all, null, 2));
      return 0;
    }
    for (const entry of all) {
      const where =
        entry.installs
          .map((one) =>
            one.scope === "user"
              ? WHERE[entry.kind]
              : one.scope === "project" && entry.kind === "agent"
                ? ".claude/agents"
                : one.label
          )
          .join(", ") || "not installed";
      out(
        `${entry.bundle.padEnd(8)} ${(entry.kind === "skill" ? entry.name : entry.id).padEnd(30)} ${entry.tokens === null ? "     -" : `~${String(entry.tokens).padStart(4)}`}  ${where}${entry.outdated ? "  outdated" : ""}`
      );
    }
    return 0;
  };

  // A bare name works when exactly one item has it; kind/name always does.
  const pick = (all: CatalogItem[], ref: string): Picked => {
    const slash = ref.indexOf("/");
    if (slash > 0 && isKind(ref.slice(0, slash))) {
      const entry = all.find((one) => one.id === ref);
      return entry
        ? { entry }
        : {
            error: `No ${ref.slice(0, slash)} "${ref.slice(slash + 1)}" in the catalog. See agentry catalog list`,
          };
    }
    const hits = all.filter((one) => one.name === ref);
    if (hits.length === 1) {
      return { entry: hits[0] };
    }
    return {
      error:
        hits.length === 0
          ? `No item "${ref}" in the catalog. See agentry catalog list`
          : `"${ref}" matches ${hits.map((one) => one.id).join(" and ")}; name one as kind/name`,
    };
  };

  // Copies source to `to` (never over something there) and says so. `where` words the destination.
  const place = (
    entry: CatalogItem,
    to: string,
    where: string,
    { dryRun }: { dryRun: boolean }
  ): number => {
    if (existsSync(to) || lstatSync(to, { throwIfNoEntry: false })) {
      err(
        `refused: ${tilde(to)} already exists; not overwriting it${UPDATABLE.has(entry.kind) ? ` (agentry catalog update ${entry.id} refreshes an installed copy)` : ""}.`
      );
      return 1;
    }
    if (dryRun) {
      out(`would add ${entry.id} to ${where}: ${entry.source} -> ${to}`);
      return 0;
    }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(entry.source, to, { recursive: true });
    out(`added ${entry.id} to ${where}: ${tilde(to)}`);
    return 0;
  };

  // Copies each item into place (skills onto the shelf, group default: their bundle). Stops at the first problem; nothing
  // is overwritten. project: agents and MCP servers go to this project instead of the user. dryRun previews.
  const add = async (
    refs: string[],
    {
      group,
      project = false,
      dryRun = false,
      yes = false,
    }: {
      group?: string;
      project?: boolean;
      dryRun?: boolean;
      yes?: boolean;
    } = {}
  ): Promise<number> => {
    if (!needFetched()) {
      return 1;
    }
    if (
      group !== undefined &&
      (group === "" ||
        group === "agents" ||
        group.includes("/") ||
        group.startsWith("."))
    ) {
      err(`Not a usable group name: "${group}"`);
      return 1;
    }
    const all = items();
    for (const ref of refs) {
      const { entry, error } = pick(all, ref);
      if (error !== undefined) {
        err(error);
        return 1;
      }
      let code = 0;
      if (entry.kind === "skill") {
        if (entry.installed) {
          err(
            `${entry.name} is already installed (${entry.shelf ? `shelf/${entry.shelf}` : "~/.claude/skills"}); not overwriting`
          );
          return 1;
        }
        const to = join(paths.shelfDir, group ?? entry.bundle, entry.name);
        if (dryRun) {
          out(
            `would add ${entry.name} to shelf group ${group ?? entry.bundle}: ${entry.source} -> ${to}`
          );
          continue;
        }
        mkdirSync(dirname(to), { recursive: true });
        cpSync(entry.source, to, { recursive: true });
        out(
          `added ${entry.name} to shelf group ${group ?? entry.bundle} (off); turn it on with agentry shelf on ${group ?? entry.bundle}/${entry.name}`
        );
      } else if (entry.kind === "agent") {
        code = place(
          entry,
          agentPath(project, entry.file),
          project ? "this project's .claude/agents" : "~/.claude/agents",
          { dryRun }
        );
      } else if (entry.kind === "rule") {
        code = place(
          entry,
          join(paths.configDir, "rules", entry.file),
          "~/.claude/rules",
          { dryRun }
        );
      } else if (entry.kind === "claude-md") {
        const existing = claudeMdPaths().find((file) => existsSync(file));
        if (existing) {
          err(
            `refused: this project already has ${tilde(existing)}; not overwriting it. Merge ${entry.source} into it by hand.`
          );
          return 1;
        }
        code = place(entry, claudeMdPaths()[0], "this project as CLAUDE.md", {
          dryRun,
        });
      } else {
        code = await createMcpEdit(paths, { out, err, ...mcp }).add({
          name: entry.name,
          scope: project ? "project" : "user",
          path: root(),
          yes,
          dryRun,
          ...mcpOptionsOf(entry.raw),
        });
      }
      if (code !== 0) {
        return code;
      }
    }
    return 0;
  };

  // Replaces each outdated installed skill, agent, rule or CLAUDE.md (all: every outdated one) with the catalog's copy.
  // Previews the files that change, saves the current copy under <backups>/updated/<time>/, then writes; asks y (or --yes)
  // first. An outdated MCP server goes through mcp-edit `set` (its own masked preview, backup and undo).
  const update = async (
    refs: string[],
    {
      all = false,
      dryRun = false,
      yes = false,
    }: { all?: boolean; dryRun?: boolean; yes?: boolean } = {}
  ): Promise<number> => {
    if (!needFetched()) {
      return 1;
    }
    const every = items();
    const chosen: CatalogItem[] = [];
    for (const ref of all ? [] : refs) {
      const { entry, error } = pick(every, ref);
      if (error !== undefined || !entry.installed) {
        err(
          error ??
            `${entry.id} is not installed; agentry catalog add ${entry.id}`
        );
        return 1;
      }
      chosen.push(entry);
    }
    const todo = all
      ? every.filter((entry) => entry.outdated)
      : chosen.filter((entry) => entry.outdated);
    // biome-ignore lint/complexity/noForEach: forEach with a simple side-effect callback; same behaviour as for-of
    chosen
      .filter((entry) => !entry.outdated)
      // biome-ignore lint/suspicious/useIterableCallbackReturn: the callback is a side effect and its return value is unused by forEach
      .forEach((entry) => out(`${entry.id} is up to date`));
    const jobs = todo
      .filter((entry) => entry.kind !== "mcp")
      .flatMap((entry) =>
        entry.installs
          .filter((one): one is FileInstall => one.outdated)
          .map((install) => ({
            entry,
            install,
            diff: diffOf(entry.source, install.path),
          }))
      );
    const servers = todo
      .filter((entry) => entry.kind === "mcp")
      .map((entry) => ({
        entry,
        change: mcpChangeOf(
          entry.raw,
          readJson<ClaudeJson>(paths.claudeJson, [])?.mcpServers?.[entry.name]
        ),
      }))
      .filter((one): one is McpServerJob => one.change !== null);
    if (jobs.length + servers.length === 0) {
      // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
      all && out("Everything installed is up to date.");
      return 0;
    }
    const stamp = now().toISOString().replace(/[:.]/g, "-");
    let n = 0;
    while (
      existsSync(join(paths.backupsDir, "updated", n ? `${stamp}-${n}` : stamp))
    ) {
      n += 1;
    }
    const saveIn = join(
      paths.backupsDir,
      "updated",
      n ? `${stamp}-${n}` : stamp
    );
    for (const { entry, install, diff } of jobs) {
      out(`update ${entry.id} at ${tilde(install.path)}:`);
      const name = (one: string): string => one || basename(install.path);
      // biome-ignore lint/complexity/noForEach: forEach with a simple side-effect callback; same behaviour as for-of
      // biome-ignore lint/suspicious/useIterableCallbackReturn: the callback is a side effect and its return value is unused by forEach
      diff.changed.forEach((one) =>
        out(
          `  overwrite ${name(one)}  (differs from the catalog copy: a local edit in it is replaced)`
        )
      );
      // biome-ignore lint/complexity/noForEach: forEach with a simple side-effect callback; same behaviour as for-of
      // biome-ignore lint/suspicious/useIterableCallbackReturn: the callback is a side effect and its return value is unused by forEach
      diff.added.forEach((one) => out(`  add ${name(one)}`));
      // biome-ignore lint/complexity/noForEach: forEach with a simple side-effect callback; same behaviour as for-of
      // biome-ignore lint/suspicious/useIterableCallbackReturn: the callback is a side effect and its return value is unused by forEach
      diff.extra.forEach((one) =>
        out(`  keep ${name(one)}  (only in your copy; not touched)`)
      );
    }
    // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
    jobs.length > 0 &&
      out(`The current copy of each is saved under ${tilde(saveIn)} first.`);
    const edit = createMcpEdit(paths, { out, err, ...mcp });
    const setServer = (
      { entry, change }: McpServerJob,
      options: { dryRun?: boolean; yes?: boolean }
    ): Promise<number> =>
      edit.set({
        name: entry.name,
        env: change.env,
        args: change.args,
        path: root(),
        ...options,
      });
    for (const one of servers) {
      out(
        `update ${one.entry.id} in your user config (args replaced, missing env keys added; existing env values stay):`
      );
      if ((await setServer(one, { dryRun: true })) !== 0) {
        return 1;
      }
    }
    if (dryRun || !(yes || isTTY())) {
      out(
        dryRun
          ? "Dry run: nothing changed."
          : "Nothing changed; run again with --yes to apply."
      );
      return 0;
    }
    if (!(yes || (await confirm("\nOverwrite these? [y/N] ")))) {
      out("Cancelled; nothing changed.");
      return 0;
    }
    for (const { entry, install, diff } of jobs) {
      const saved = join(
        saveIn,
        `${entry.kind}_${entry.name}_${install.scope}`
      );
      mkdirSync(dirname(saved), { recursive: true, mode: 0o700 });
      cpSync(install.path, saved, { recursive: true });
      noteUpdatedCopy({
        saveIn,
        label: basename(saved),
        from: install.path,
        what: entry.kind,
        now,
      });
      for (const one of [...diff.changed, ...diff.added]) {
        const [from, to] = one
          ? [join(entry.source, one), join(install.path, one)]
          : [entry.source, install.path];
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
      }
      out(`updated ${entry.id} (${install.label})`);
    }
    for (const one of servers) {
      const code = await setServer(one, { yes: true });
      if (code !== 0) {
        return code;
      }
    }
    return 0;
  };

  // Removes each installed agent (user ~/.claude/agents, or this project's with project): previews, keeps a copy under
  // <backups>/removed/ unless backup is false, asks y (or --yes) first. Rules are `rules remove`, skills `shelf remove`.
  const remove = async (
    refs: string[],
    {
      project = false,
      dryRun = false,
      yes = false,
      backup = true,
    }: {
      project?: boolean;
      dryRun?: boolean;
      yes?: boolean;
      backup?: boolean;
    } = {}
  ): Promise<number> => {
    if (!needFetched()) {
      return 1;
    }
    const every = items();
    const chosen: { entry: CatalogItem; to: string }[] = [];
    for (const ref of refs) {
      const { entry, error } = pick(every, ref);
      if (error !== undefined || entry.kind !== "agent") {
        err(
          error ??
            `refused: catalog remove takes agents; remove ${entry.id} with ${entry.kind === "skill" ? "agentry shelf remove" : entry.kind === "rule" ? "agentry rules remove" : entry.kind === "mcp" ? "agentry mcp remove" : "agentry rules remove"}.`
        );
        return 1;
      }
      const to = agentPath(project, entry.file);
      if (!lstatSync(to, { throwIfNoEntry: false })) {
        err(
          `${entry.id} is not installed ${project ? "in this project" : "in ~/.claude/agents"}${project ? "" : "; --project removes the project copy"}.`
        );
        return 1;
      }
      chosen.push({ entry, to });
    }
    for (const { entry, to } of chosen) {
      out(
        `remove ${entry.id}: ${tilde(to)} (${backup ? `a copy is kept under ${tilde(join(paths.backupsDir, "removed"))}` : "no copy kept"})`
      );
    }
    if (dryRun || !(yes || isTTY())) {
      out(
        dryRun
          ? "Dry run: nothing changed."
          : "Nothing changed; run again with --yes to apply."
      );
      return 0;
    }
    if (!(yes || (await confirm("\nRemove these? [y/N] ")))) {
      out("Cancelled; nothing changed.");
      return 0;
    }
    for (const { entry, to } of chosen) {
      // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
      backup &&
        saveRemovedCopy({
          from: to,
          to: removedCopyPath(
            paths,
            now,
            `${entry.id}${project ? "_(project)" : ""}`
          ),
          label: entry.id,
          now,
          what: "agent",
        });
      rmSync(to);
      out(`removed ${entry.id}`);
    }
    return 0;
  };

  return {
    refresh,
    entries,
    list,
    add,
    update,
    remove,
    fetched: () => fetched(),
    dir,
  };
};
