// `agentry scan [roots...]`: runs the status and doctor collectors over every git repo and worktree under the roots and
// prints one row per repo. Findings in user-level files are reported once in a "global" block, not per repo. Read-only;
// per-repo results are cached (lib/scan-cache.mjs) until a file they read changes.
// With `--fix` (`runFix`) the fix engine (lib/fix.mjs) runs over the same plan: user-level findings first, once, then
// each repo with findings on its own, previewed and confirmed per repo.

import { execFileSync } from "node:child_process";
import type { Stats } from "node:fs";
import { lstatSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { removedCopyPath, saveRemovedCopy } from "./backups.js";
import type { FoundRepo } from "./discover.js";
import { createDiscover } from "./discover.js";
import type { DoctorReport } from "./doctor.js";
import { createDoctor, defaultLaunchctlGetenv } from "./doctor.js";
import { createFix } from "./fix.js";
import type { Paths } from "./paths.js";
import { createScanCache } from "./scan-cache.js";
import type { StatusData } from "./status.js";
import { createStatus } from "./status.js";
import type { Finding, FixOptions, ReadError, Severity } from "./types.js";
import { packageVersion } from "./version.js";

type Summary = Record<Severity, number>;
interface Counts {
  skills: number;
  mcp: number;
  hooks: number;
  plugins: number;
}
interface Loadable {
  state: string;
  scope?: string;
}

/** One repo as scanned (and cached): user-level counts are kept so the global block can use them. */
interface RepoResult {
  counts: Counts;
  errors: ReadError[];
  findings: Finding[];
  kind: FoundRepo["kind"];
  path: string;
  root: string;
  tokens: number;
  userCounts: Counts;
  userTokens: number;
}

/** One repo row of the scan: its own findings only (user-level ones are in `global`). */
export interface RepoRow {
  counts: Counts;
  errors: ReadError[];
  findings: Finding[];
  kind: FoundRepo["kind"];
  path: string;
  root: string;
  summary: Summary;
  tokens: number;
}

/** The `agentry scan --json` document. */
export interface ScanData {
  cache: { enabled: boolean; hits: number; misses: number };
  depth: number;
  global: {
    counts: Counts;
    tokens: number;
    findings: Finding[];
    summary: Summary;
    errors: ReadError[];
  };
  repos: RepoRow[];
  roots: string[];
  totals: { repos: number } & Summary;
  version: 1;
}

export interface ScanOptions {
  discover?: Pick<ReturnType<typeof createDiscover>, "find">;
  doctor?: { collect: (cwd?: string) => DoctorReport };
  env?: NodeJS.ProcessEnv;
  err?: (text: string) => void;
  fixOptions?: FixOptions;
  now?: () => Date;
  out?: (text: string) => void;
  platform?: NodeJS.Platform;
  status?: { collect: (cwd?: string) => StatusData };
}

export interface ScanArgs {
  cache?: boolean;
  depth?: number;
  json?: boolean;
  onlyProblems?: boolean;
  roots?: string[];
}

/** A `.claude/skills/<name>` found under the roots (or in the user config with global). */
export interface SkillHit {
  global?: boolean;
  kind: string;
  link: boolean;
  path: string;
  repo: string;
  tracked: boolean;
}

const defaultConfirm = async (question: string): Promise<boolean> => {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return /^y(es)?$/i.test((await prompt.question(question)).trim());
  } finally {
    prompt.close();
  }
};

const SEVERITIES: Severity[] = ["error", "warning", "info"];

const here = new URL(".", import.meta.url).pathname;

// Cache version: package version plus the newest mtime of the CLI's own code, so a changed rule never serves old results.
const codeVersion = () => {
  let newest = 0;
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else {
        newest = Math.max(newest, statSync(file).mtimeMs);
      }
    }
  };
  try {
    visit(here);
    return `${packageVersion()}:${newest}`;
  } catch {
    return "";
  }
};

const summarize = (findings: Finding[]): Summary =>
  Object.fromEntries(
    SEVERITIES.map((severity) => [
      severity,
      findings.filter((item) => item.severity === severity).length,
    ])
  ) as Summary;

export const createScan = (
  paths: Paths,
  {
    out = console.log,
    err = console.error,
    platform = process.platform,
    env = process.env,
    now = () => new Date(),
    status,
    doctor,
    discover = createDiscover(),
    fixOptions = {},
  }: ScanOptions = {}
) => {
  const statusCollector = status ?? createStatus(paths, { platform });
  const launchctlAnswers = new Map<string, string>();
  const launchctlGetenv = (name: string): string => {
    if (!launchctlAnswers.has(name)) {
      launchctlAnswers.set(name, defaultLaunchctlGetenv(name));
    }
    return launchctlAnswers.get(name) as string;
  };
  const doctorCollector =
    doctor ?? createDoctor(paths, { platform, env, launchctlGetenv });
  const under = (file: string, dir: string): boolean =>
    file === dir || file.startsWith(dir + sep);

  // A finding is global when it lives in a user-level file. A local-scope server entry also lives in ~/.claude.json
  // but belongs to one repo, so `dup-mcp-scope` (which points at the winning, narrower entry) stays with the repo.
  const isGlobal = (item: Finding): boolean => {
    const userDirs = [paths.configDir, paths.desktopDir, paths.pluginsDir];
    return (
      userDirs.some((dir) => under(item.file, dir)) ||
      (item.file === paths.claudeJson && item.id !== "dup-mcp-scope")
    );
  };

  // Every file a repo's result depends on: the places the readers look (so a new file is noticed) plus every source
  // the result names. Folders are included so an added or removed entry changes the stamp.
  const touchedFiles = (
    repo: string,
    data: StatusData,
    findings: Finding[]
  ): string[] => {
    const files: (string | undefined)[] = [
      join(paths.configDir, "settings.json"),
      join(paths.configDir, "skills"),
      join(paths.configDir, "skill-shelf"),
      join(paths.pluginsDir, "installed_plugins.json"),
      join(paths.pluginsDir, "known_marketplaces.json"),
      paths.claudeJson,
      join(paths.desktopDir, "claude_desktop_config.json"),
      join(paths.desktopDir, "Claude Extensions"),
      join(paths.desktopDir, "Claude Extensions Settings"),
      join(repo, ".git"),
    ];
    for (const dir of new Set([repo, data.project.root])) {
      files.push(
        join(dir, ".claude", "settings.json"),
        join(dir, ".claude", "settings.local.json"),
        join(dir, ".claude", "skills"),
        join(dir, "bundles.tsv")
      );
    }
    for (let dir = repo; ; dir = dirname(dir)) {
      files.push(join(dir, ".mcp.json"));
      if (dirname(dir) === dir) {
        break;
      }
    }
    for (const skill of data.skills.items) {
      files.push(skill.source, join(skill.source, "SKILL.md"));
    }
    for (const server of data.mcp.servers) {
      files.push(server.source);
    }
    for (const hook of data.hooks.items) {
      files.push(hook.source);
    }
    for (const plugin of data.plugins.items) {
      files.push(plugin.installPath, plugin.enabledBy?.source);
    }
    files.push(
      ...data.errors.map((error) => error.source),
      ...findings.map((item) => item.file)
    );
    return files.filter(
      (file): file is string => typeof file === "string" && file.startsWith("/")
    );
  };

  const loading = (item: Loadable): boolean => item.state === "active";

  const scanRepo = (
    repo: FoundRepo
  ): { result: RepoResult; files: string[] } => {
    const data = statusCollector.collect(repo.path);
    const diagnosis = doctorCollector.collect(repo.path);
    const userScope = (item: Loadable): boolean =>
      item.scope === "user" ||
      item.scope === "desktop-config" ||
      item.scope === "desktop-extension";
    const countOf = (filter: (item: Loadable) => boolean): Counts => ({
      skills: data.skills.items.filter((item) => loading(item) && filter(item))
        .length,
      mcp: data.mcp.servers.filter((item) => loading(item) && filter(item))
        .length,
      hooks: data.hooks.items.filter((item) => loading(item) && filter(item))
        .length,
      plugins: data.plugins.items.filter(
        (item) => loading(item) && filter(item)
      ).length,
    });
    const result: RepoResult = {
      path: repo.path,
      kind: repo.kind,
      root: data.project.root,
      counts: countOf(() => true),
      userCounts: countOf(userScope),
      tokens: data.tokens.measured,
      userTokens: data.skills.items
        .filter((item) => loading(item) && item.scope === "user")
        .reduce((total, item) => total + (item.tokens ?? 0), 0),
      findings: diagnosis.findings,
      errors: [...data.errors, ...diagnosis.errors].filter(
        (error, at, all) =>
          all.findIndex(
            (other) =>
              other.source === error.source && other.message === error.message
          ) === at
      ),
    };
    return { result, files: touchedFiles(repo.path, data, diagnosis.findings) };
  };

  const gather = (
    roots: string[],
    { depth = 4, cache = true }: { depth?: number; cache?: boolean } = {}
  ): { data: ScanData; origins: string[] } => {
    const store = createScanCache<RepoResult>(paths, {
      enabled: cache,
      version: codeVersion(),
    });
    const repos = discover.find(roots, { depth });
    let hits = 0;
    const results = repos.map((repo) => {
      const cached = store.get(repo.path);
      if (cached) {
        hits += 1;
        return cached;
      }
      const { result, files } = scanRepo(repo);
      store.set(repo.path, files, result);
      return result;
    });

    const globalFindings = new Map<string, Finding>();
    const origins = new Map<string, string>();
    const rows = results.map((result): RepoRow => {
      const mine: Finding[] = [];
      for (const item of result.findings) {
        if (isGlobal(item)) {
          const key = JSON.stringify([
            item.id,
            item.file,
            item.line,
            item.message,
          ]);
          globalFindings.set(key, item);
          origins.set(key, origins.get(key) ?? result.path);
        } else {
          mine.push(item);
        }
      }
      const {
        findings: _all,
        userCounts: _u,
        userTokens: _t,
        errors,
        ...rest
      } = result;
      return {
        ...rest,
        findings: mine,
        summary: summarize(mine),
        errors: errors.filter(
          (error) =>
            !under(error.source, paths.configDir) &&
            error.source !== paths.claudeJson
        ),
      };
    });
    rows.sort(
      (a, b) =>
        b.summary.error - a.summary.error ||
        b.summary.warning - a.summary.warning ||
        b.summary.info - a.summary.info ||
        a.path.localeCompare(b.path)
    );

    const first = results[0];
    const globalList = [...globalFindings.values()].sort(
      (a, b) =>
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
        a.id.localeCompare(b.id) ||
        a.file.localeCompare(b.file)
    );
    const globalErrors = results
      .flatMap((result) => result.errors)
      .filter(
        (error, at, all) =>
          (under(error.source, paths.configDir) ||
            error.source === paths.claudeJson) &&
          all.findIndex(
            (other) =>
              other.source === error.source && other.message === error.message
          ) === at
      );
    const total = summarize([
      ...globalList,
      ...rows.flatMap((row) => row.findings),
    ]);
    const data: ScanData = {
      version: 1,
      roots: roots.map((root) => resolve(root)),
      depth,
      global: {
        counts: first?.userCounts ?? {
          skills: 0,
          mcp: 0,
          hooks: 0,
          plugins: 0,
        },
        tokens: first?.userTokens ?? 0,
        findings: globalList,
        summary: summarize(globalList),
        errors: globalErrors,
      },
      repos: rows,
      totals: { repos: rows.length, ...total },
      cache: { enabled: cache, hits, misses: rows.length - hits },
    };
    return { data, origins: [...new Set(origins.values())] };
  };

  const collect = (
    roots: string[],
    options?: { depth?: number; cache?: boolean }
  ): ScanData => gather(roots, options).data;

  const printHuman = (
    data: ScanData,
    { onlyProblems }: { onlyProblems: boolean }
  ): void => {
    const tilde = (text: string): string =>
      paths.home ? text.replaceAll(`${paths.home}/`, "~/") : text;
    const shown = onlyProblems
      ? data.repos.filter((row) => row.findings.length > 0)
      : data.repos;
    const label = (row: RepoRow): string =>
      `${tilde(row.path)}${row.kind === "worktree" ? " (worktree)" : ""}`;
    const problems = (summary: Summary): string =>
      summary.error + summary.warning + summary.info === 0
        ? "-"
        : `${summary.error}E ${summary.warning}W${summary.info ? ` ${summary.info}I` : ""}`;

    const g = data.global;
    out(
      `Global (user-level): ${g.counts.skills} skills (~${g.tokens} tokens), ${g.counts.mcp} MCP, ${g.counts.hooks} hooks, ${g.counts.plugins} plugins; ${problems(g.summary) === "-" ? "no findings" : problems(g.summary)}`
    );
    for (const item of g.findings) {
      out(`  ${item.severity}  [${item.id}]  ${tilde(item.message)}`);
      out(`    ${tilde(item.file)}${item.line ? `:${item.line}` : ""}`);
    }
    for (const error of g.errors) {
      out(`  warning: ${tilde(error.source)}: ${error.message}`);
    }

    out("");
    const header = [
      "repo",
      "skills",
      "mcp",
      "hooks",
      "plugins",
      "~tokens",
      "findings",
    ];
    const body = shown.map((row) =>
      [
        label(row),
        row.counts.skills,
        row.counts.mcp,
        row.counts.hooks,
        row.counts.plugins,
        row.tokens,
        problems(row.summary),
      ].map(String)
    );
    const widths = header.map((title, at) =>
      Math.max(title.length, ...body.map((cells) => cells[at].length))
    );
    const line = (cells: string[]): string =>
      cells
        .map((cell, at) =>
          at === 0 || at === 6
            ? cell.padEnd(widths[at])
            : cell.padStart(widths[at])
        )
        .join("  ")
        .trimEnd();
    if (shown.length === 0) {
      out(onlyProblems ? "No repos with findings." : "No git repos found.");
    } else {
      out(line(header));
      for (const cells of body) {
        out(line(cells));
      }
    }
    for (const row of shown.filter((entry) => entry.findings.length > 0)) {
      out(`\n${label(row)}`);
      for (const item of row.findings) {
        out(
          `  ${item.severity}  [${item.id}]  ${tilde(item.message)}\n    ${tilde(item.file)}${item.line ? `:${item.line}` : ""}`
        );
      }
    }
    const { totals } = data;
    out(
      `\n${totals.repos} repo${totals.repos === 1 ? "" : "s"} scanned: ${totals.error} error${totals.error === 1 ? "" : "s"}, ${totals.warning} warning${totals.warning === 1 ? "" : "s"}${totals.info ? `, ${totals.info} info` : ""}. Counts include user-level items every session loads.`
    );
  };

  // Returns the exit code: 1 when any error-severity finding exists, 2 for a missing root.
  const run = ({
    roots = [],
    depth = 4,
    json = false,
    onlyProblems = false,
    cache = true,
  }: ScanArgs = {}): number => {
    const list = roots.length > 0 ? roots : [process.cwd()];
    if (missingRoot(list)) {
      return 2;
    }
    const data = collect(list, { depth, cache });
    if (json) {
      out(
        JSON.stringify(
          onlyProblems
            ? {
                ...data,
                repos: data.repos.filter((row) => row.findings.length > 0),
              }
            : data,
          null,
          2
        )
      );
    } else {
      printHuman(data, { onlyProblems });
    }
    return data.totals.error > 0 ? 1 : 0;
  };

  const missingRoot = (list: string[]): boolean => {
    for (const root of list) {
      try {
        if (!statSync(root).isDirectory()) {
          throw new Error("not a folder");
        }
      } catch {
        err(`Not a folder: ${resolve(root)}`);
        return true;
      }
    }
    return false;
  };

  // Fixes through the engine: user-level findings once (from the first repo that shows them), then each repo with
  // findings on its own. The engine previews and asks per call; without a terminal it previews only unless `yes`.
  // Returns the worst exit code of the runs (see lib/fix.mjs), 2 for a missing root.
  const runFix = async ({
    roots = [],
    depth = 4,
    yes = false,
    dryRun = false,
    cache = true,
  }: ScanArgs & { yes?: boolean; dryRun?: boolean } = {}): Promise<number> => {
    const list = roots.length > 0 ? roots : [process.cwd()];
    if (missingRoot(list)) {
      return 2;
    }
    const { data, origins } = gather(list, { depth, cache });
    const fixer = createFix(paths, { out, err, ...fixOptions });
    const tilde = (text: string): string =>
      paths.home ? text.replaceAll(`${paths.home}/`, "~/") : text;
    const userLevel = isGlobal;
    const repoLevel = (item: Finding): boolean => !isGlobal(item);
    const targets = [
      ...origins.map((path) => ({
        path,
        include: userLevel,
        label: "user-level (applied once)",
      })),
      ...data.repos
        .filter((row) => row.findings.length > 0)
        .map((row) => ({
          path: row.path,
          include: repoLevel,
          label: row.path,
        })),
    ];
    let code = 0;
    let touched = 0;
    for (const { path, include, label } of targets) {
      const planned = fixer.plan(path, { include });
      if (
        planned.edits.length +
          planned.commands.length +
          planned.failures.length ===
        0
      ) {
        continue;
      }
      touched += 1;
      code = Math.max(
        code,
        await fixer.run({ path, yes, dryRun, include, label })
      );
    }
    out(
      touched === 0
        ? `\nNothing to fix under ${list.map((root) => tilde(resolve(root))).join(", ")}.`
        : `\n${touched} scope${touched === 1 ? "" : "s"} with fixes.`
    );
    return code;
  };

  // Every repo or worktree under the roots with .claude/skills/<name>: { repo, kind, path, link, tracked }.
  // A link there belongs to the shelf (agentry shelf off), so it is listed but never removed. tracked: git has files in it.
  const findSkill = (
    roots: string[],
    name: string,
    { depth = 4, global = false }: { depth?: number; global?: boolean } = {}
  ): SkillHit[] => {
    const tracked = (repo: string, rel: string): boolean => {
      try {
        return (
          execFileSync("git", ["ls-files", "--", rel], {
            cwd: repo,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }).trim() !== ""
        );
      } catch {
        return false;
      }
    };
    const user: SkillHit[] = [];
    if (global) {
      const path = join(paths.configDir, "skills", name);
      const info = lstatSync(path, { throwIfNoEntry: false });
      info &&
        user.push({
          repo: paths.configDir,
          kind: "global",
          path,
          link: info.isSymbolicLink(),
          tracked: false,
          global: true,
        });
    }
    return user.concat(
      discover.find(roots, { depth }).flatMap((repo): SkillHit[] => {
        const rel = join(".claude", "skills", name);
        const path = join(repo.path, rel);
        let info: Stats;
        try {
          info = lstatSync(path);
        } catch {
          return [];
        }
        return [
          {
            repo: repo.path,
            kind: repo.kind,
            path,
            link: info.isSymbolicLink(),
            tracked: tracked(repo.path, rel),
          },
        ];
      })
    );
  };

  const skillNameError = (name: string | undefined): string | undefined =>
    !name || name.includes("/") || name.startsWith(".")
      ? `"${name ?? ""}" is not a skill folder name.`
      : undefined;

  const describeHit = (hit: SkillHit): string =>
    `${paths.home ? hit.path.replaceAll(`${paths.home}/`, "~/") : hit.path}${hit.link ? "  (link into the shelf: use agentry shelf off)" : hit.global ? "  (global)" : hit.tracked ? "  (git-tracked)" : "  (not tracked by git)"}`;

  // Lists the hits. Returns the exit code (2 for a bad name or root).
  const runFindSkill = ({
    roots = [],
    depth = 4,
    name,
    json = false,
    global = false,
  }: ScanArgs & { name?: string; global?: boolean } = {}): number => {
    const list = roots.length > 0 ? roots : [process.cwd()];
    if (skillNameError(name) || missingRoot(list)) {
      skillNameError(name) && err(skillNameError(name) as string);
      return 2;
    }
    const hits = findSkill(list, name as string, { depth, global });
    if (json) {
      out(
        JSON.stringify(
          { skill: name, roots: list.map((root) => resolve(root)), hits },
          null,
          2
        )
      );
    } else {
      hits.forEach((hit) => out(describeHit(hit)));
      out(
        hits.length === 0
          ? `No project under ${list.map((root) => resolve(root)).join(", ")} has .claude/skills/${name}.`
          : `${hits.length} project${hits.length === 1 ? "" : "s"} with .claude/skills/${name}.`
      );
    }
    return 0;
  };

  // Deletes .claude/skills/<name> from every hit that is a real folder, previewed first. No copy is kept (git restores
  // tracked ones); the preview says which are not tracked. Without a terminal it only previews unless `yes`.
  const runRemoveSkill = async ({
    roots = [],
    depth = 4,
    name,
    yes = false,
    dryRun = false,
    global = false,
    backup = true,
  }: ScanArgs & {
    name?: string;
    yes?: boolean;
    dryRun?: boolean;
    global?: boolean;
    backup?: boolean;
  } = {}): Promise<number> => {
    const list = roots.length > 0 ? roots : [process.cwd()];
    if (skillNameError(name) || missingRoot(list)) {
      skillNameError(name) && err(skillNameError(name) as string);
      return 2;
    }
    const hits = findSkill(list, name as string, { depth, global });
    const doomed = hits.filter((hit) => !hit.link);
    hits
      .filter((hit) => hit.link)
      .forEach((hit) => out(`skip ${describeHit(hit)}`));
    if (doomed.length === 0) {
      out(
        `Nothing to remove: no project folder .claude/skills/${name} under ${list.map((root) => resolve(root)).join(", ")}.`
      );
      return 0;
    }
    const userHit = doomed.find((hit) => hit.global);
    const projects = doomed.length - (userHit ? 1 : 0);
    out(
      `Would delete .claude/skills/${name} from ${projects} project${projects === 1 ? "" : "s"}${userHit ? " and ~/.claude/skills" : ""} (${userHit && backup ? "project folders keep no copy; the global one is copied to the backups first" : "no copy kept"}):`
    );
    doomed.forEach((hit) => out(`  ${describeHit(hit)}`));
    const lost = doomed.filter(
      (hit) => !(hit.tracked || (hit.global && backup))
    );
    if (lost.length > 0) {
      out(
        `${lost.length} of them ${lost.length === 1 ? "is" : "are"} not tracked by git and cannot be recovered.`
      );
    }
    const tty =
      fixOptions.isTTY ??
      (() => Boolean(process.stdin.isTTY && process.stdout.isTTY));
    if (dryRun || !(yes || tty())) {
      out(
        dryRun
          ? "Dry run: nothing deleted."
          : "Nothing deleted; run again with --yes to apply."
      );
      return 0;
    }
    if (
      !(
        yes ||
        (await (fixOptions.confirm ?? defaultConfirm)(
          "\nDelete these folders? [y/N] "
        ))
      )
    ) {
      out("Cancelled; nothing deleted.");
      return 0;
    }
    for (const hit of doomed) {
      if (hit.global && backup) {
        const label = `${name} (global)`;
        const to = removedCopyPath(paths, now, label);
        saveRemovedCopy({ from: hit.path, to, label, now });
        out(
          `copy kept in ${paths.home ? to.replaceAll(`${paths.home}/`, "~/") : to}`
        );
      }
      rmSync(hit.path, { recursive: true });
    }
    out(`deleted ${doomed.length} folder${doomed.length === 1 ? "" : "s"}`);
    return 0;
  };

  return { collect, run, runFix, findSkill, runFindSkill, runRemoveSkill };
};
