// `agentry fix`: plan → preview (a unified diff per file, secrets masked) → confirm → backup → write → verify.
// The engine knows no concrete fix; those live in src/lib/fix-rules.ts, keyed by doctor rule id.
//
// Registry: `fixes[ruleId] = (finding, ctx) => fix | fix[] | undefined`, called once per doctor finding with that id.
//   ctx = { paths, cwd, project: { cwd, root }, findings } (the whole doctor result for the folder).
// Fix: { ruleId, file, describe(), apply(currentText) }
//   file       absolute path the fix edits (text fix) or changes as a side effect (command fix; optional there).
//              A symlinked file is resolved: the real file is backed up and written, the link stays a link.
//   describe() one line for the preview. It is printed as is, so it must not contain secret values.
//   apply(text) gets the file's current text ("" when missing; undefined when `file` is not a regular file) and returns:
//     - a string: the new full text (the same text, or undefined/null, means nothing to do). Several fixes on one
//       file run in finding order, each on the previous one's output, and show as one diff.
//     - { command: [argv...], cwd }: a command to run (no shell). It is previewed (masked), confirmed and run by the
//       engine after all text writes; `file` (if given) is backed up first.
//   A fix may instead be `{ ruleId, unfixable: "reason" }` (no apply): the finding is listed as having no automatic
//   fix, with the reason (no file content in it). Rules use this when the only edit they could make is not safe.
//   apply must not write anything itself. If it throws, only the error's code or name is printed (messages can
//   quote file content), that fix is skipped and the run exits 1.
// A finding is matched across runs by `findingKey` (id + file + message, no line: edits shift lines). Verify re-runs
// doctor with a fresh instance and reports each fixed finding as gone or still reported.
//
// Backups: one set per applied run in `<paths.backupsDir>/<timestamp>/` (~/.claude/backups/agentry, honours
// CLAUDE_CONFIG_DIR / AGENTRY_HOME). `manifest.json` is written before the first change and again at the end:
// {
//   version: 1, tool: "agentry <version>", createdAt: ISO time, cwd,
//   status: "writing" | "done" | "partial",      // "writing" left behind means the run stopped half way
//   files: [{
//     path,          // absolute path as the fix named it
//     realPath,      // where the bytes live (symlinks resolved); undo restores here
//     kind,          // "file" | "directory" | "symlink" | "missing" (did not exist: undo deletes realPath)
//     backup,        // copy relative to the set folder ("files/<path without leading slash>"), null for symlink/missing
//     linkTarget,    // kind "symlink" only: readlink of `path`, so undo can recreate the link
//     mtimeMs, mode, sha256,   // of the original (sha256 null unless kind "file")
//     writtenSha256,           // result "written" only: sha256 of the text the fix wrote (undo's conflict check)
//     gitTracked,    // true when `git ls-files` tracks the file (undo may prefer git), false otherwise
//     ruleIds,       // fixes that touched it
//     result,        // "pending" | "written" | "skipped" (changed on disk before write) | "failed" | "command"
//   }],
//   commands: [{ ruleId, command: [masked argv], cwd, exitCode }],
// }
//
// Writes are atomic (temp file in the same folder, fsync, chmod to the old mode, rename). Every file is re-checked
// (mtime + sha256) after confirm and right before its rename; a change since the preview means plan and preview again.
// Exit codes: 0 applied, nothing to fix, preview only or declined; 1 a fix, write, command or verification failed;
// 2 usage (not a folder).

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { createDoctor } from "./doctor.js";
import { fixes as defaultFixes } from "./fix-rules.js";
import {
  maskArgs,
  maskHeader,
  maskShell,
  maskUrl,
  maskValue,
  SECRET_NAME,
} from "./mask.js";
import type { Paths } from "./paths.js";
import type {
  Finding,
  Fix,
  FixOptions,
  FixRunArgs,
  ReadError,
  RunCommand,
  TextFix,
  UnfixableFix,
} from "./types.js";
import { packageVersion } from "./version.js";

const MAX_ATTEMPTS = 3;
const CONTEXT = 3;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;
const STRING_TOKEN = /"(?:[^"\\\n]|\\.)*"/g;

export type SnapKind = "missing" | "file" | "directory" | "symlink" | "other";

/** What a file looked like when planned. `text` is set for kind "file". */
export interface Snapshot {
  kind: SnapKind;
  mode: number | null;
  mtimeMs: number | null;
  path: string;
  realPath: string;
  sha256: string | null;
  text?: string;
}

/** One file of a backup set (see the manifest layout above). */
export interface ManifestFile {
  backup: string | null;
  gitTracked: boolean;
  kind: SnapKind;
  linkTarget?: string;
  mode: number | null;
  mtimeMs: number | null;
  path: string;
  realPath: string;
  result: "pending" | "written" | "skipped" | "failed" | "command";
  ruleIds: string[];
  sha256: string | null;
  writtenSha256?: string;
}

export interface ManifestCommand {
  command: string[];
  cwd: string;
  exitCode: number | null;
  ruleId: string;
}

export interface Manifest {
  commands: ManifestCommand[];
  createdAt: string;
  cwd: string;
  files: ManifestFile[];
  status: "writing" | "done" | "partial";
  tool: string;
  version: 1;
}

type Op = [tag: " " | "-" | "+", line: string];
interface Row {
  line: string;
  newNo: number;
  oldNo: number;
  tag: Op[0];
}

interface PlanItem {
  finding: Finding;
  fix: TextFix;
}

interface PlanEdit {
  after: string;
  entry?: ManifestFile;
  items: PlanItem[];
  snap: Snapshot;
  written?: boolean;
}

interface PlanStep {
  command: string[];
  cwd: string;
  done?: boolean;
  entry?: ManifestFile;
  item: PlanItem;
  snap?: Snapshot;
}

/** What `plan` found for one folder. A finding with no automatic fix carries the fix's reason when it gave one. */
export interface Planned {
  commands: PlanStep[];
  edits: PlanEdit[];
  errors: ReadError[];
  failures: { finding: Finding; reason: string }[];
  findings: Finding[];
  unfixable: (Finding & { reason?: string })[];
}

const isUnfixable = (fix: Fix): fix is UnfixableFix =>
  typeof (fix as UnfixableFix).unfixable === "string";

export const findingKey = (
  finding: Pick<Finding, "id" | "file" | "message">
): string => [finding.id, finding.file, finding.message].join("\0");

const sha256 = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");

// What a file looks like now; compared after confirm to catch edits made since the preview.
export const snapshot = (file: string): Snapshot => {
  let realPath = file;
  try {
    realPath = realpathSync(file);
  } catch {
    // missing, or a broken symlink: lstat below tells which
  }
  let stat: Stats;
  try {
    stat = lstatSync(realPath);
  } catch {
    return {
      path: file,
      realPath,
      kind: "missing",
      mtimeMs: null,
      mode: null,
      sha256: null,
    };
  }
  const base = {
    path: file,
    realPath,
    mtimeMs: stat.mtimeMs,
    // biome-ignore lint/suspicious/noBitwiseOperators: masks the permission bits of a file mode
    mode: stat.mode & 0o7777,
    sha256: null,
  };
  if (stat.isFile()) {
    const data = readFileSync(realPath);
    return {
      ...base,
      kind: "file",
      text: data.toString("utf8"),
      sha256: sha256(data),
    };
  }
  return {
    ...base,
    kind: stat.isDirectory()
      ? "directory"
      : stat.isSymbolicLink()
        ? "symlink"
        : "other",
  };
};

const unchanged = (before: Snapshot): boolean => {
  const now = snapshot(before.path);
  return (
    now.kind === before.kind &&
    now.realPath === before.realPath &&
    now.mtimeMs === before.mtimeMs &&
    now.sha256 === before.sha256
  );
};

// ---- diff ----

const splitLines = (text: string): string[] =>
  text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

// Line ops [tag, line] with tag " ", "-" or "+". Common head and tail are trimmed first so a small edit in a
// large file (~/.claude.json) stays cheap; a huge middle falls back to "remove all, add all".
const diffOps = (a: string[], b: string[]): Op[] => {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const ops: Op[] = a.slice(0, start).map((line): Op => [" ", line]);
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m <= 4_000_000) {
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i * width + j] =
          midA[i] === midB[j]
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push([" ", midA[i]]);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        ops.push(["-", midA[i]]);
        i += 1;
      } else {
        ops.push(["+", midB[j]]);
        j += 1;
      }
    }
    ops.push(
      ...midA.slice(i).map((line): Op => ["-", line]),
      ...midB.slice(j).map((line): Op => ["+", line])
    );
  } else {
    ops.push(
      ...midA.map((line): Op => ["-", line]),
      ...midB.map((line): Op => ["+", line])
    );
  }
  ops.push(...a.slice(endA).map((line): Op => [" ", line]));
  return ops;
};

const renderHunks = (ops: Op[]): string[] => {
  let oldNo = 1;
  let newNo = 1;
  const rows = ops.map(([tag, line]) => {
    const row: Row = { tag, line, oldNo, newNo };
    oldNo += tag === "+" ? 0 : 1;
    newNo += tag === "-" ? 0 : 1;
    return row;
  });
  const ranges: { start: number; end: number }[] = [];
  rows.forEach((row, index) => {
    if (row.tag === " ") {
      return;
    }
    const start = Math.max(0, index - CONTEXT);
    const end = Math.min(rows.length, index + CONTEXT + 1);
    const last = ranges.at(-1);
    if (last && start <= last.end) {
      last.end = end;
    } else {
      ranges.push({ start, end });
    }
  });
  return ranges.map(({ start, end }) => {
    const hunk = rows.slice(start, end);
    const oldCount = hunk.filter((row) => row.tag !== "+").length;
    const newCount = hunk.filter((row) => row.tag !== "-").length;
    const header = `@@ -${hunk[0].oldNo - (oldCount ? 0 : 1)},${oldCount} +${hunk[0].newNo - (newCount ? 0 : 1)},${newCount} @@`;
    const body = hunk.map(
      ({ tag, line }) =>
        `${tag}${line.replace(/\n$/, "")}${line.endsWith("\n") ? "" : "\n\\ No newline at end of file"}`
    );
    return [header, ...body].join("\n");
  });
};

// ---- masking for previews ----

// Every string in a parsed JSON value that the readers would mask, mapped to its masked form.
const collectSensitive = (
  value: unknown,
  map: Map<string, string>,
  key = "",
  within = ""
): void => {
  if (typeof value === "string") {
    const masked =
      within === "headers"
        ? maskHeader(value)
        : within === "env" || SECRET_NAME.test(key)
          ? maskValue(value)
          : URL_LIKE.test(value)
            ? maskUrl(value)
            : maskShell(value);
    if (masked !== value) {
      map.set(value, masked);
    }
  } else if (Array.isArray(value)) {
    const masked = maskArgs(
      value.map((item) => (typeof item === "string" ? item : ""))
    );
    value.forEach((item, index) => {
      if (typeof item === "string" && masked[index] !== item) {
        map.set(item, masked[index]);
      } else {
        collectSensitive(item, map, key, within);
      }
    });
  } else if (value && typeof value === "object") {
    for (const [name, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      collectSensitive(
        item,
        map,
        name,
        name === "env" || name === "headers" ? name : within
      );
    }
  }
};

// The diff of `before` → `after` with secrets masked, or `{ hidden }` (a reason) when it cannot be shown safely.
export const previewDiff = (
  file: string,
  before: string,
  after: string
):
  | { text: string; hidden?: undefined }
  | { hidden: string; text?: undefined } => {
  if (before === after) {
    return { text: "" };
  }
  const rawOps = diffOps(splitLines(before), splitLines(after));
  const counts = `+${rawOps.filter(([tag]) => tag === "+").length} -${rawOps.filter(([tag]) => tag === "-").length} lines`;
  let maskLine: (line: string) => string = maskShell;
  let sensitive: Map<string, string> | undefined;
  if (
    file.endsWith(".json") ||
    /^\s*[[{]/.test(before) ||
    /^\s*[[{]/.test(after)
  ) {
    const found = new Map<string, string>();
    sensitive = found;
    for (const text of [before, after]) {
      try {
        if (text.trim() !== "") {
          collectSensitive(JSON.parse(text), found);
        }
      } catch {
        return {
          hidden: `not valid JSON, so secrets cannot be found; ${counts}`,
        };
      }
    }
    maskLine = (line) =>
      line.replace(STRING_TOKEN, (token) => {
        try {
          const value = JSON.parse(token);
          return found.has(value) ? JSON.stringify(found.get(value)) : token;
        } catch {
          return token;
        }
      });
  }
  const ops = diffOps(
    splitLines(before).map(maskLine),
    splitLines(after).map(maskLine)
  );
  if (!ops.some(([tag]) => tag !== " ")) {
    return { hidden: `the change is only in masked values; ${counts}` };
  }
  const text = renderHunks(ops).join("\n");
  for (const raw of sensitive?.keys() ?? []) {
    if (
      raw.length >= 6 &&
      (text.includes(raw) || text.includes(JSON.stringify(raw).slice(1, -1)))
    ) {
      return { hidden: `a secret value could not be masked; ${counts}` };
    }
  }
  return { text };
};

// ---- writing ----

// Temp file in the same folder, fsync, old mode, rename: readers see the old or the new file, never half of one.
export const atomicWrite = (
  file: string,
  text: string | Buffer,
  mode = 0o600
): void => {
  const temp = join(
    dirname(file),
    `.${basename(file)}.agentry-${process.pid}-${randomBytes(4).toString("hex")}.tmp`
  );
  try {
    const fd = openSync(temp, "wx", 0o600);
    try {
      if (typeof text === "string") {
        writeSync(fd, text);
      } else {
        writeSync(fd, text);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temp, mode);
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
};

const gitTracked = (file: string): boolean => {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", basename(file)], {
      cwd: dirname(file),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const createBackupSet = (
  paths: Paths,
  { now, cwd, version }: { now: () => Date; cwd: string; version: string }
) => {
  mkdirSync(paths.backupsDir, { recursive: true, mode: 0o700 });
  const createdAt = now().toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  let dir: string;
  for (let n = 0; ; n += 1) {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the value comes from user files and may be missing at runtime
    dir = join(paths.backupsDir, n ? `${stamp}-${n}` : stamp);
    try {
      mkdirSync(dir, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
  const manifest: Manifest = {
    version: 1,
    tool: `agentry ${version}`,
    createdAt,
    cwd,
    status: "writing",
    files: [],
    commands: [],
  };
  const byPath = new Map<string, ManifestFile>();
  const add = (snap: Snapshot, ruleIds: string[]): ManifestFile => {
    const known = byPath.get(snap.realPath);
    if (known) {
      known.ruleIds = [...new Set([...known.ruleIds, ...ruleIds])];
      return known;
    }
    const copyable = snap.kind === "file" || snap.kind === "directory";
    const backup = copyable
      ? join("files", snap.path.replace(/^\/+/, ""))
      : null;
    if (snap.kind === "file") {
      mkdirSync(dirname(join(dir, backup as string)), {
        recursive: true,
        mode: 0o700,
      });
      copyFileSync(snap.realPath, join(dir, backup as string));
    } else if (snap.kind === "directory") {
      cpSync(snap.realPath, join(dir, backup as string), {
        recursive: true,
        verbatimSymlinks: true,
      });
    }
    const entry: ManifestFile = {
      path: snap.path,
      realPath: snap.realPath,
      kind: snap.kind,
      backup,
      mtimeMs: snap.mtimeMs,
      mode: snap.mode,
      sha256: snap.sha256,
      gitTracked: snap.kind === "missing" ? false : gitTracked(snap.realPath),
      ruleIds,
      result: "pending",
    };
    if (snap.kind === "symlink") {
      entry.linkTarget = readlinkSync(snap.path);
    }
    byPath.set(snap.realPath, entry);
    manifest.files.push(entry);
    return entry;
  };
  const save = () =>
    writeFileSync(
      join(dir, "manifest.json"),
      `${JSON.stringify(manifest, null, "\t")}\n`,
      { mode: 0o600 }
    );
  return { dir, manifest, add, save };
};

// ---- engine ----

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

const defaultRunCommand: RunCommand = (argv, { cwd }) => {
  const result = spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8" });
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: (result.error as NodeJS.ErrnoException | undefined)?.code,
  };
};

export const createFix = (
  paths: Paths,
  {
    out = console.log,
    err = console.error,
    fixes = defaultFixes,
    doctor = () =>
      createDoctor(paths, { out: () => undefined, err: () => undefined }),
    isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    confirm = defaultConfirm,
    runCommand = defaultRunCommand,
    now = () => new Date(),
  }: FixOptions = {}
) => {
  const tilde = (text: unknown): string =>
    paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text);
  const failure = (error: unknown): string => {
    const known = error as { code?: string; name?: string } | undefined;
    return known?.code ?? known?.name ?? "error";
  };

  // Pure: reads the files, asks every registered fix what it would do, writes nothing.
  // → { findings, edits[{ snap, after, items[] }], commands[{ snap?, command, cwd, item }], unfixable[], failures[], errors }
  // `include(finding)` limits the plan to some findings (scan --fix splits user-level from per-repo ones).
  const plan = (
    cwd: string,
    { include = () => true }: Pick<FixRunArgs, "include"> = {}
  ): Planned => {
    const data = doctor().collect(cwd);
    const ctx = { paths, cwd, project: data.project, findings: data.findings };
    data.findings = data.findings.filter(include);
    const snaps = new Map<string, Snapshot>();
    const snapOf = (file: string): Snapshot => {
      if (!snaps.has(file)) {
        snaps.set(file, snapshot(file));
      }
      return snaps.get(file) as Snapshot;
    };
    const edits = new Map<string, PlanEdit>();
    const commands: PlanStep[] = [];
    const unfixable: Planned["unfixable"] = [];
    const failures: Planned["failures"] = [];
    for (const finding of data.findings) {
      const make = fixes[finding.id];
      if (!make) {
        unfixable.push(finding);
        continue;
      }
      let made: Fix[];
      try {
        made = [make(finding, ctx)]
          .flat()
          .filter((one): one is Fix => Boolean(one));
      } catch (error) {
        failures.push({
          finding,
          reason: `could not plan (${failure(error)})`,
        });
        continue;
      }
      for (const fix of made) {
        if (isUnfixable(fix)) {
          unfixable.push({ ...finding, reason: fix.unfixable });
          continue;
        }
        const item: PlanItem = { finding, fix };
        try {
          const snap = fix.file ? snapOf(resolve(fix.file)) : undefined;
          const edit = snap && edits.get(snap.realPath);
          const current = edit
            ? edit.after
            : snap?.kind === "file"
              ? snap.text
              : snap?.kind === "missing"
                ? ""
                : undefined;
          const result = fix.apply(current);
          if (typeof result === "string") {
            if (!snap || (snap.kind !== "file" && snap.kind !== "missing")) {
              // biome-ignore lint/suspicious/useErrorMessage: only the code is read; a message would change the error text
              throw Object.assign(new Error(), { code: "ENOTFILE" });
            }
            if (result !== current) {
              edits.set(snap.realPath, {
                snap,
                after: result,
                items: [...(edit?.items ?? []), item],
              });
            }
          } else if (
            result &&
            Array.isArray(result.command) &&
            result.command.length > 0
          ) {
            commands.push({
              snap,
              command: result.command,
              cwd: result.cwd ?? cwd,
              item,
            });
          }
        } catch (error) {
          failures.push({
            finding,
            reason: `${fix.describe?.() ?? fix.ruleId}: could not plan (${failure(error)})`,
          });
        }
      }
    }
    return {
      findings: data.findings,
      edits: [...edits.values()],
      commands,
      unfixable,
      failures,
      errors: data.errors,
    };
  };

  const label = (item: PlanItem): string =>
    `[${item.finding.id}] ${item.fix.describe?.() ?? item.finding.message}`;
  const commandLine = (command: string[]): string =>
    maskArgs(command).join(" ");

  const preview = (planned: Planned): void => {
    for (const edit of planned.edits) {
      for (const item of edit.items) {
        out(label(item));
      }
      const shown = tilde(edit.snap.path);
      if (edit.snap.kind === "file" && gitTracked(edit.snap.realPath)) {
        out(`(${shown} is tracked in git: the change also shows in git diff)`);
      }
      out(
        `--- ${edit.snap.kind === "missing" ? "/dev/null" : shown}\n+++ ${shown}`
      );
      const diff = previewDiff(
        edit.snap.path,
        edit.snap.kind === "missing" ? "" : (edit.snap.text as string),
        edit.after
      );
      out(diff.text ?? `(diff hidden: ${diff.hidden})`);
    }
    for (const step of planned.commands) {
      out(label(step.item));
      out(
        `  run: ${tilde(commandLine(step.command))}\n  in:  ${tilde(step.cwd)}`
      );
    }
    for (const { finding, reason } of planned.failures) {
      err(`error  [${finding.id}] ${tilde(reason)}`);
    }
    if (planned.unfixable.length > 0) {
      out(
        `\n${planned.unfixable.length} finding${planned.unfixable.length === 1 ? " has" : "s have"} no automatic fix (see agentry doctor):`
      );
      for (const finding of planned.unfixable) {
        out(
          `  [${finding.id}] ${tilde(finding.message)}${finding.reason ? `\n      no fix: ${tilde(finding.reason)}` : ""}`
        );
      }
    }
  };

  const apply = (planned: Planned, cwd: string): boolean => {
    const set = createBackupSet(paths, { now, cwd, version: packageVersion() });
    let ok = true;
    for (const edit of planned.edits) {
      edit.entry = set.add(
        edit.snap,
        edit.items.map((item) => item.finding.id)
      );
    }
    for (const step of planned.commands) {
      step.entry =
        step.snap && step.snap.kind !== "missing"
          ? set.add(step.snap, [step.item.finding.id])
          : undefined;
    }
    set.save();
    out(`\nBackup: ${tilde(set.dir)}`);
    for (const edit of planned.edits) {
      const entry = edit.entry as ManifestFile; // set above
      if (!unchanged(edit.snap)) {
        entry.result = "skipped";
        err(
          `error  ${tilde(edit.snap.path)} changed on disk after the preview; not written. Run agentry fix again.`
        );
        ok = false;
        continue;
      }
      try {
        atomicWrite(edit.snap.realPath, edit.after, edit.snap.mode ?? 0o600);
        entry.result = "written";
        entry.writtenSha256 = sha256(edit.after);
        edit.written = true;
        out(`wrote ${tilde(edit.snap.path)}`);
      } catch (error) {
        entry.result = "failed";
        err(
          `error  could not write ${tilde(edit.snap.path)} (${failure(error)})`
        );
        ok = false;
      }
    }
    for (const step of planned.commands) {
      out(`run: ${tilde(commandLine(step.command))}  (in ${tilde(step.cwd)})`);
      const result = runCommand(step.command, { cwd: step.cwd });
      for (const line of `${result.stdout ?? ""}${result.stderr ?? ""}`
        .split("\n")
        .filter(Boolean)) {
        out(`  ${tilde(maskShell(line))}`);
      }
      set.manifest.commands.push({
        ruleId: step.item.finding.id,
        command: maskArgs(step.command),
        cwd: step.cwd,
        exitCode: result.status,
      });
      if (step.entry) {
        step.entry.result =
          step.entry.result === "pending" ? "command" : step.entry.result;
      }
      step.done = result.status === 0;
      if (!step.done) {
        err(
          `error  command failed (${result.error ?? `exit ${result.status}`})`
        );
        ok = false;
      }
    }
    set.manifest.status = ok ? "done" : "partial";
    set.save();
    return ok;
  };

  const verify = (planned: Planned, cwd: string): boolean => {
    const still = new Set(doctor().collect(cwd).findings.map(findingKey));
    const fixed = [
      ...planned.edits
        .filter((edit) => edit.written)
        .flatMap((edit) => edit.items),
      ...planned.commands.filter((step) => step.done).map((step) => step.item),
    ];
    const seen = new Set();
    let ok = true;
    for (const { finding } of fixed) {
      const key = findingKey(finding);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const gone = !still.has(key);
      ok &&= gone;
      out(
        `verify [${finding.id}] ${tilde(finding.message)}: ${gone ? "gone" : "still reported"}`
      );
    }
    return ok;
  };

  // Returns the exit code (see the header). Async only because of the confirm prompt.
  // `include` and `label` are for scan --fix: a plan limited to some findings, and a heading naming the repo.
  const run = async ({
    path,
    yes = false,
    dryRun = false,
    include,
    label: heading,
  }: FixRunArgs = {}): Promise<number> => {
    const cwd = resolve(path ?? process.cwd());
    if (!(existsSync(cwd) && statSync(cwd).isDirectory())) {
      err(`Not a folder: ${cwd}`);
      return 2;
    }
    const previewOnly = dryRun || !(yes || isTTY());
    for (let attempt = 1; ; attempt += 1) {
      const planned = plan(cwd, { include });
      if (
        heading &&
        planned.edits.length +
          planned.commands.length +
          planned.failures.length >
          0
      ) {
        out(`\n=== ${tilde(heading)} ===`);
      }
      preview(planned);
      const failed = planned.failures.length > 0;
      const steps = planned.edits.length + planned.commands.length;
      if (steps === 0) {
        out(
          planned.findings.length === 0
            ? "Nothing to fix."
            : "\nNothing to apply."
        );
        return failed ? 1 : 0;
      }
      if (previewOnly) {
        out(
          `\n${dryRun ? "Dry run" : "Not a terminal, so preview only"}: nothing written.${dryRun ? "" : " Pass --yes to apply."}`
        );
        return failed ? 1 : 0;
      }
      if (
        !(
          yes ||
          (await confirm(
            `\nApply ${steps} change${steps === 1 ? "" : "s"}${heading ? ` for ${tilde(heading)}` : ""}? [y/N] `
          ))
        )
      ) {
        out("Nothing written.");
        return 0;
      }
      const moved = [...planned.edits, ...planned.commands]
        .map((step) => step.snap)
        .filter(
          (snap): snap is Snapshot => snap !== undefined && !unchanged(snap)
        );
      if (moved.length > 0) {
        const names = [...new Set(moved.map((snap) => tilde(snap.path)))].join(
          ", "
        );
        if (attempt >= MAX_ATTEMPTS) {
          err(
            `error  ${names} keeps changing on disk; nothing written. Close what is editing it and run agentry fix again.`
          );
          return 1;
        }
        out(`\n${names} changed on disk after the preview; planning again.\n`);
        continue;
      }
      const applied = apply(planned, cwd);
      const verified = verify(planned, cwd);
      return applied && verified && !failed ? 0 : 1;
    }
  };

  return { plan, run };
};
