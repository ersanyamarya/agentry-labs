// `agentry backups`: what agentry keeps under <config>/backups/agentry/ and how to clear it.
//   fix/<set>                      a fix-engine backup set (lib/fix.mjs); deleting one ends `fix --undo` for it
//   removed/<time>/<label>         the copy `shelf remove` keeps of a deleted skill; next to it meta.json records where it came from
//   updated/<time>/<label>         the copy `catalog update` keeps of what it overwrote; meta.json maps each label to where it lives
// The id of an entry is that path below the backups folder. Nothing is deleted or moved without --yes (or a y at the prompt);
// --dry-run (and a run without a terminal and without --yes) only previews.
// Exit codes: 0 done or preview, 1 refused or failed, 2 unknown id or nothing selected.

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Paths } from "./paths.js";

const DAY = 86_400_000;
const META = "meta.json";

export const KINDS = ["fix", "removed", "updated"] as const;
export type BackupKind = (typeof KINDS)[number];

/** One backup, as listed by `agentry backups list --json`. */
export interface BackupEntry {
  bytes: number;
  date: string;
  days: number;
  detail: string;
  from?: string | undefined;
  id: string;
  kind: BackupKind;
  name: string;
  path: string;
  undone?: boolean;
  what?: string;
}

// What meta.json records next to a removed copy, or (with `items`) under an updated/<time>/ folder.
interface BackupNote {
  from?: string;
  what?: string;
}
interface BackupMeta extends BackupNote {
  items?: Record<string, BackupNote>;
  label?: string;
  removedAt?: string;
  updatedAt?: string;
}
interface FixManifest {
  createdAt?: string;
  files?: unknown;
  status?: string;
  undoneAt?: string;
}

export interface BackupsOptions {
  confirm?: (question: string) => Promise<boolean>;
  err?: (text: string) => void;
  isTTY?: () => boolean;
  now?: () => Date;
  out?: (text: string) => void;
}

interface Failure {
    error: string;
    code: number 
}

export const defaultConfirm = async (question: string): Promise<boolean> => {
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

const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

// Total bytes of a file or folder tree (links are not followed).
const sizeOf = (path: string): number => {
  try {
    const info = lstatSync(path);
    return info.isDirectory()
      ? readdirSync(path).reduce(
          (total, name) => total + sizeOf(join(path, name)),
          0
        )
      : info.size;
  } catch {
    return 0;
  }
};

// Where the copy of a removed item goes: <backups>/removed/<time>/<label>; a taken time gets -1, -2, ... appended.
export const removedCopyPath = (
  paths: Pick<Paths, "backupsDir">,
  now: () => Date,
  label: string
): string => {
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  let n = 0;
  while (
    existsSync(join(paths.backupsDir, "removed", n ? `${stamp}-${n}` : stamp))
  ) {
    n++;
  }
  return join(
    paths.backupsDir,
    "removed",
    n ? `${stamp}-${n}` : stamp,
    label.replace(/[\s/]+/g, "_")
  );
};

// Copies `from` (a skill folder or a rule file) to `to`; meta.json next to it records where it came from, for `backups restore`.
export const saveRemovedCopy = ({
  from,
  to,
  label,
  now,
  what = "skill",
}: {
  from: string;
  to: string;
  label: string;
  now: () => Date;
  what?: string;
}): void => {
  mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
  cpSync(from, to, { recursive: true });
  writeFileSync(
    join(dirname(to), META),
    `${JSON.stringify({ label, from, what, removedAt: now().toISOString() })}\n`
  );
};

// `catalog update` saves several items under one <backups>/updated/<time>/, so its meta.json maps label -> { from, what }.
export const noteUpdatedCopy = ({
  saveIn,
  label,
  from,
  what,
  now,
}: {
  saveIn: string;
  label: string;
  from: string;
  what: string;
  now: () => Date;
}): void => {
  const file = join(saveIn, META);
  const meta = readJson<BackupMeta>(file) ?? {
    updatedAt: now().toISOString(),
    items: {},
  };
  (meta.items as Record<string, BackupNote>)[label] = { from, what };
  writeFileSync(file, `${JSON.stringify(meta)}\n`);
};

export const formatBytes = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export const formatAge = (days: number): string =>
  days < 1 ? "today" : `${Math.floor(days)}d`;

const movePath = (from: string, to: string): void => {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true });
  }
};

export const createBackups = (
  paths: Paths,
  {
    out = console.log,
    err = console.error,
    now = () => new Date(),
    isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    confirm = defaultConfirm,
  }: BackupsOptions = {}
) => {
  const { backupsDir, home } = paths;
  const tilde = (text: string): string =>
    home ? text.replaceAll(`${home}/`, "~/") : text;

  const dirs = (dir: string) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).filter((entry) =>
          entry.isDirectory()
        )
      : [];

  const ageOf = (
    date: string | undefined,
    path: string
  ): { date: string; days: number } => {
    const time = Date.parse(date ?? "") || statSync(path).mtimeMs;
    return {
      date: new Date(time).toISOString(),
      days: Math.max(0, (now().getTime() - time) / DAY),
    };
  };

  // Where a removed copy goes back to: the recorded folder, or for older copies made before meta.json the global skill folder.
  const originOf = (
    meta: BackupNote | null | undefined,
    label: string
  ): string | undefined =>
    meta?.from ??
    (label.endsWith("_(global)")
      ? join(paths.configDir, "skills", label.slice(0, -"_(global)".length))
      : undefined);

  // Every backup, newest first: { id, kind, name, path, bytes, date, days, detail, from?, undone? }.
  const entries = (): BackupEntry[] => {
    const found: BackupEntry[] = [];
    for (const { name } of dirs(backupsDir)) {
      const dir = join(backupsDir, name);
      const manifest = readJson<FixManifest>(join(dir, "manifest.json"));
      if (
        name === "removed" ||
        name === "updated" ||
        !existsSync(join(dir, "manifest.json"))
      ) {
        continue;
      }
      const files = Array.isArray(manifest?.files)
        ? (manifest.files as unknown[]).length
        : 0;
      found.push({
        id: `fix/${name}`,
        kind: "fix",
        name,
        path: dir,
        bytes: sizeOf(dir),
        ...ageOf(manifest?.createdAt, dir),
        undone: Boolean(manifest?.undoneAt),
        detail: manifest
          ? `fix set, ${files} file${files === 1 ? "" : "s"}, ${manifest.undoneAt ? "undone" : manifest.status}`
          : "fix set (manifest unreadable)",
      });
    }
    for (const kind of ["removed", "updated"] as const) {
      for (const { name: stamp } of dirs(join(backupsDir, kind))) {
        const dir = join(backupsDir, kind, stamp);
        const meta = readJson<BackupMeta>(join(dir, META));
        for (const name of readdirSync(dir).filter((one) => one !== META)) {
          const path = join(dir, name);
          const note = kind === "updated" ? meta?.items?.[name] : meta;
          const from = originOf(note, name);
          found.push({
            id: `${kind}/${stamp}/${name}`,
            kind,
            name: (kind === "removed" && meta?.label) || name,
            path,
            bytes: sizeOf(path),
            ...ageOf(
              meta?.[kind === "removed" ? "removedAt" : "updatedAt"],
              dir
            ),
            from,
            what: note?.what ?? "skill",
            detail: `${kind} ${note?.what ?? "skill"}${from ? `, from ${tilde(from)}` : ", original folder unknown (copy it back by hand)"}`,
          });
        }
      }
    }
    return found.sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
    );
  };

  const line = (entry: BackupEntry): string =>
    `${entry.id}  ${formatBytes(entry.bytes)}  ${formatAge(entry.days)}  ${entry.detail}`;

  const list = ({ json = false }: { json?: boolean } = {}): number => {
    const all = entries();
    if (json) {
      out(
        JSON.stringify(
          {
            dir: backupsDir,
            total: all.reduce((sum, entry) => sum + entry.bytes, 0),
            backups: all,
          },
          null,
          2
        )
      );
      return 0;
    }
    if (all.length === 0) {
      out(`No backups in ${tilde(backupsDir)}.`);
      return 0;
    }
    out(`Backups in ${tilde(backupsDir)} (newest first):`);
    all.forEach((entry) => out(`  ${line(entry)}`));
    out(
      `${all.length} backup${all.length === 1 ? "" : "s"}, ${formatBytes(all.reduce((sum, entry) => sum + entry.bytes, 0))}.`
    );
    return 0;
  };

  // Drops the time folder once only its meta.json is left, and the removed/ or updated/ folder once that is empty.
  const dropEmptyStamp = (entry: BackupEntry): void => {
    if (entry.kind === "fix") {
      return;
    }
    const stampDir = dirname(entry.path);
    if (
      existsSync(stampDir) &&
      readdirSync(stampDir).every((name) => name === META)
    ) {
      rmSync(stampDir, { recursive: true });
    }
    const removedDir = dirname(stampDir);
    if (existsSync(removedDir) && readdirSync(removedDir).length === 0) {
      rmSync(removedDir, { recursive: true });
    }
  };

  // Moves a removed skill back where it came from; never overwrites.
  const plan = (
    id: string
  ): Failure | { entry: BackupEntry & { from: string } } => {
    const entry = entries().find((one) => one.id === id);
    if (!entry) {
      return {
        error: `No backup "${id}". Run agentry backups list to see the ids.`,
        code: 2,
      };
    }
    if (entry.kind === "fix") {
      return {
        error: `${id} is a fix set; restore it with agentry fix --undo ${entry.name}.`,
        code: 1,
      };
    }
    const { from } = entry;
    if (!from) {
      return {
        error: `${id} has no recorded original folder (made by an older agentry). Copy ${entry.path} back by hand.`,
        code: 1,
      };
    }
    if (
      entry.kind === "removed" &&
      (existsSync(from) || lstatSync(from, { throwIfNoEntry: false }))
    ) {
      return { error: `${from} already exists; not overwriting.`, code: 1 };
    }
    return { entry: { ...entry, from } };
  };

  const restore = async (
    id: string,
    { dryRun = false }: { dryRun?: boolean } = {}
  ): Promise<number> => {
    const planned = plan(id);
    if ("error" in planned) {
      err(planned.error);
      return planned.code;
    }
    const { entry } = planned;
    if (dryRun) {
      out(`would restore ${entry.name}: ${entry.path} -> ${entry.from}`);
      return 0;
    }
    if (
      entry.kind === "updated" &&
      lstatSync(entry.from, { throwIfNoEntry: false })
    ) {
      // the catalog copy now there is kept under removed/, so restoring never loses anything
      const kept = removedCopyPath(
        paths,
        now,
        `${entry.name} (before restore)`
      );
      saveRemovedCopy({
        from: entry.from,
        to: kept,
        label: entry.name,
        now,
        ...(entry.what !== undefined && { what: entry.what }),
      });
      rmSync(entry.from, { recursive: true });
      out(`kept the current copy as ${tilde(kept)}`);
    }
    movePath(entry.path, entry.from);
    dropEmptyStamp(entry);
    out(`restored ${entry.name} to ${entry.from}`);
    return 0;
  };

  // Selects by ids, or olderThan days, or all; kind (fix, removed, updated) narrows the last two.
  const select = ({
    ids,
    olderThan,
    all,
    kind,
  }: {
    ids?: string[] | undefined;
    olderThan?: number | undefined;
    all?: boolean;
    kind?: string | undefined;
  }): Failure | { chosen: BackupEntry[] } => {
    const every = entries();
    if (ids) {
      const missing = ids.filter(
        (id) => !every.some((entry) => entry.id === id)
      );
      return missing.length > 0
        ? {
            error: `No backup "${missing[0]}". Run agentry backups list to see the ids.`,
            code: 2,
          }
        : { chosen: every.filter((entry) => ids.includes(entry.id)) };
    }
    const ofKind = kind ? every.filter((entry) => entry.kind === kind) : every;
    return {
      chosen: all
        ? ofKind
        : ofKind.filter((entry) => entry.days >= (olderThan as number)),
    };
  };

  // Deletes the selected backups for good: previewed first; confirmed by y, --yes. Returns the exit code.
  const prune = async ({
    ids,
    olderThan,
    all = false,
    kind,
    dryRun = false,
    yes = false,
  }: {
    ids?: string[] | undefined;
    olderThan?: number | undefined;
    all?: boolean;
    kind?: string | undefined;
    dryRun?: boolean;
    yes?: boolean;
  } = {}): Promise<number> => {
    if (
      kind !== undefined &&
      (!(KINDS as readonly string[]).includes(kind) || ids)
    ) {
      err(
        ids
          ? "--kind goes with --older-than or --all, not with ids."
          : `--kind must be one of ${KINDS.join(", ")}.`
      );
      return 2;
    }
    if (
      !(
        ids ||
        all ||
        (Number.isFinite(olderThan) && (olderThan as number) >= 0)
      )
    ) {
      err("Say what to delete: --older-than <days> or --all.");
      return 2;
    }
    const selected = select({ ids, olderThan, all, kind });
    if ("error" in selected) {
      err(selected.error);
      return selected.code;
    }
    const { chosen } = selected;
    if (chosen.length === 0) {
      out("Nothing to delete.");
      return 0;
    }
    out(
      `Would delete ${chosen.length} backup${chosen.length === 1 ? "" : "s"} (${formatBytes(chosen.reduce((sum, entry) => sum + entry.bytes, 0))}) for good:`
    );
    chosen.forEach((entry) => out(`  ${line(entry)}`));
    const live = chosen.filter(
      (entry) => entry.kind === "fix" && !entry.undone
    );
    if (live.length > 0) {
      out(
        `${live.length} fix set${live.length === 1 ? "" : "s"} not undone yet: agentry fix --undo can no longer restore ${live.length === 1 ? "it" : "them"}.`
      );
    }
    if (dryRun || !(yes || isTTY())) {
      out(
        dryRun
          ? "Dry run: nothing deleted."
          : "Nothing deleted; run again with --yes to apply."
      );
      return 0;
    }
    if (!(yes || (await confirm("\nDelete these? [y/N] ")))) {
      out("Cancelled; nothing deleted.");
      return 0;
    }
    for (const entry of chosen) {
      rmSync(entry.path, { recursive: true, force: true });
      dropEmptyStamp(entry);
    }
    out(`deleted ${chosen.length} backup${chosen.length === 1 ? "" : "s"}`);
    return 0;
  };

  return { entries, list, restore, prune };
};
