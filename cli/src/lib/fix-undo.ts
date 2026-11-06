// `agentry fix --undo [timestamp]` and `--list`: put back what a backup set (lib/fix.mjs header) recorded.
// The set is the newest one unless a timestamp (its folder name, or the createdAt ISO time) is given.
// Per manifest file, by `result` and `kind`:
//   written   file: original bytes back, original mode kept. missing: realPath deleted.
//   failed    file: back to the original bytes (the atomic write never replaced it). Nothing else.
//   command   file/directory/symlink: restored from the backup or link target. The command's own effect is not
//             checked, and command fixes are never replayed: they are listed after the run.
//   skipped, pending: never changed, left alone.
// A file that differs from what the fix wrote (or, for a missing file, from what it created) is a conflict: skipped
// and exit 1, unless --force. A set is marked `undoneAt` once every file is restored, and cannot be undone twice.
// Exit codes: 0 restored, nothing to restore, list, or preview only; 1 a conflict (without --force), a failed restore
// or a refused set; 2 unknown timestamp or no sets.

import {
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Manifest, ManifestFile } from "./fix.js";
import { atomicWrite, snapshot } from "./fix.js";
import { maskArgs } from "./mask.js";
import type { Paths } from "./paths.js";

const MANIFEST = "manifest.json";

/** A manifest as stored: `undoneAt` is added once a set has been undone. */
export interface StoredManifest extends Manifest {
  undoneAt?: string;
}

interface BackupSet {
  dir: string;
  manifest: StoredManifest | null;
  name: string;
}

type Action = "none" | "restore" | "delete" | "link";

export interface PlannedEntry {
  action: Action;
  conflict?: string;
  entry: ManifestFile;
}

export interface FixUndoOptions {
  confirm?: (question: string) => Promise<boolean>;
  err?: (text: string) => void;
  isTTY?: () => boolean;
  now?: () => Date;
  out?: (text: string) => void;
}

export interface FixUndoArgs {
  dryRun?: boolean;
  force?: boolean;
  list?: boolean;
  timestamp?: string;
  yes?: boolean;
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

// Backup sets oldest first. A set whose manifest does not parse is kept with manifest: null, so --list can say so.
const loadSets = (paths: Paths): BackupSet[] => {
  if (!existsSync(paths.backupsDir)) {
    return [];
  }
  return readdirSync(paths.backupsDir)
    .filter((name) => existsSync(join(paths.backupsDir, name, MANIFEST)))
    .map((name): BackupSet => {
      const dir = join(paths.backupsDir, name);
      try {
        return {
          name,
          dir,
          manifest: JSON.parse(
            readFileSync(join(dir, MANIFEST), "utf8")
          ) as StoredManifest,
        };
      } catch {
        return { name, dir, manifest: null };
      }
    })
    .sort(
      (a, b) =>
        (a.manifest?.createdAt ?? a.name).localeCompare(
          b.manifest?.createdAt ?? b.name
        ) || a.name.localeCompare(b.name)
    );
};

// What is at `path` now: null (nothing), the link target of a symlink, or "other" (a file or folder).
const linkState = (path: string): string | null => {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : "other";
  } catch {
    return null;
  }
};

// One manifest entry → { entry, action, conflict? }. action: "none" | "restore" | "delete" | "link".
// A conflict keeps the action that --force would take.
export const planEntry = (entry: ManifestFile): PlannedEntry => {
  const plan = (action: Action, conflict?: string): PlannedEntry => ({
    entry,
    action,
    ...(conflict ? { conflict } : {}),
  });
  if (entry.result === "skipped" || entry.result === "pending") {
    return plan("none");
  }
  if (entry.kind === "symlink") {
    const state = linkState(entry.path);
    if (state === entry.linkTarget) {
      return plan("none");
    }
    if (state === null) {
      return plan("link");
    }
    return plan(
      "link",
      state === "other"
        ? "a file or folder is there now"
        : "a different link is there now"
    );
  }
  if (entry.kind === "directory") {
    return plan("restore");
  }
  const now = snapshot(entry.realPath);
  if (entry.kind === "missing") {
    if (now.kind === "missing") {
      return plan("none");
    }
    if (
      entry.result === "written" &&
      now.kind === "file" &&
      now.sha256 === entry.writtenSha256
    ) {
      return plan("delete");
    }
    return plan("delete", "changed since the fix created it");
  }
  if (now.kind !== "file" && now.kind !== "missing") {
    return plan("restore", `now a ${now.kind}`);
  }
  if (entry.result === "written" || entry.result === "failed") {
    const expected =
      entry.result === "written" ? entry.writtenSha256 : entry.sha256;
    if (!expected || now.sha256 !== expected) {
      return plan("restore", "changed since the fix wrote it");
    }
  }
  return now.kind === "file" && now.sha256 === entry.sha256
    ? plan("none")
    : plan("restore");
};

// Makes the change for one planned entry; returns what it did, for the output.
const restore = ({ entry, action }: PlannedEntry, dir: string): string => {
  if (action === "delete") {
    rmSync(entry.realPath, { force: true });
    return `deleted ${entry.path}`;
  }
  if (action === "link") {
    rmSync(entry.path, { force: true });
    symlinkSync(entry.linkTarget as string, entry.path);
    return `linked ${entry.path} -> ${entry.linkTarget}`;
  }
  if (entry.kind === "directory") {
    rmSync(entry.realPath, { recursive: true, force: true });
    cpSync(join(dir, entry.backup as string), entry.realPath, {
      recursive: true,
      verbatimSymlinks: true,
    });
    return `restored folder ${entry.path}`;
  }
  atomicWrite(
    entry.realPath,
    readFileSync(join(dir, entry.backup as string)),
    entry.mode ?? 0o600
  );
  return `restored ${entry.path}`;
};

export const createFixUndo = (
  paths: Paths,
  {
    out = console.log,
    err = console.error,
    isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    confirm = defaultConfirm,
    now = () => new Date(),
  }: FixUndoOptions = {}
) => {
  const tilde = (text: unknown): string =>
    paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text);

  const label = (
    { entry, action, conflict }: PlannedEntry,
    force: boolean
  ): string => {
    const shown = tilde(entry.path);
    if (conflict) {
      return `conflict  ${shown} (${conflict}); ${force ? "overwritten: --force" : "skipped: pass --force to overwrite"}`;
    }
    if (action === "delete") {
      return `delete    ${shown}`;
    }
    if (action === "link") {
      return `link      ${shown} -> ${tilde(entry.linkTarget)}`;
    }
    return `restore   ${shown}${entry.gitTracked ? " (git-tracked)" : ""}`;
  };

  const commandLines = (manifest: StoredManifest): string[] =>
    (manifest.commands ?? []).map(
      (step) =>
        `  [${step.ruleId}] ${tilde(maskArgs(step.command).join(" "))}  (in ${tilde(step.cwd)})`
    );

  const list = (sets: BackupSet[]): number => {
    if (sets.length === 0) {
      out(`No backup sets in ${tilde(paths.backupsDir)} yet.`);
      return 0;
    }
    out(`Backup sets in ${tilde(paths.backupsDir)} (oldest first):`);
    for (const { name, manifest } of sets) {
      if (!manifest) {
        out(`  ${name}  unreadable manifest`);
        continue;
      }
      const count = `${manifest.files.length} file${manifest.files.length === 1 ? "" : "s"}`;
      const undone = manifest.undoneAt ? `  undone ${manifest.undoneAt}` : "";
      out(`  ${name}  ${manifest.status.padEnd(8)}  ${count}${undone}`);
    }
    return 0;
  };

  // Returns the exit code (see the header). Async only because of the confirm prompt.
  const run = async ({
    timestamp,
    list: listOnly = false,
    yes = false,
    dryRun = false,
    force = false,
  }: FixUndoArgs = {}): Promise<number> => {
    const sets = loadSets(paths);
    if (listOnly) {
      return list(sets);
    }
    let chosen: BackupSet | undefined;
    if (timestamp === undefined) {
      chosen = sets.at(-1);
      if (!chosen) {
        err(`No backup sets in ${tilde(paths.backupsDir)}; nothing to undo.`);
        return 2;
      }
    } else {
      const name = timestamp.replace(/[:.]/g, "-");
      chosen = sets.find((set) => set.name === name);
      if (!chosen) {
        err(
          `No backup set "${timestamp}". Run agentry fix --undo --list to see the sets.`
        );
        return 2;
      }
    }
    const { name, dir, manifest } = chosen;
    if (!manifest) {
      err(`Backup set ${name} has an unreadable manifest; nothing restored.`);
      return 1;
    }
    if (manifest.undoneAt) {
      err(
        `Backup set ${name} was already undone at ${manifest.undoneAt}; nothing restored.`
      );
      return 1;
    }

    const planned = manifest.files.map(planEntry);
    const changing = planned.filter((item) => item.action !== "none");
    const work = changing.filter((item) => !item.conflict || force);
    const conflicts = changing.filter((item) => item.conflict && !force);
    const unchanged = planned.length - changing.length;

    out(
      `Undo ${name} (made ${manifest.createdAt}, status ${manifest.status}): ${planned.length} file${planned.length === 1 ? "" : "s"} in the set.`
    );
    for (const item of changing) {
      out(`  ${label(item, force)}`);
    }
    if (changing.length === 0) {
      out("  nothing to restore");
    }
    if (unchanged > 0) {
      out(
        `  ${unchanged} unchanged (already original, or never changed by the run)`
      );
    }
    const commands = commandLines(manifest);
    if (commands.length > 0) {
      out(
        "\nCommand fixes cannot be undone automatically; undo these by hand if needed:"
      );
      out(commands.join("\n"));
    }

    const previewOnly = dryRun || !(yes || isTTY());
    if (previewOnly) {
      out(
        `\n${dryRun ? "Dry run" : "Not a terminal, so preview only"}: nothing restored.${dryRun ? "" : " Pass --yes to apply."}`
      );
      return conflicts.length > 0 ? 1 : 0;
    }
    if (
      work.length > 0 &&
      !yes &&
      !(await confirm(
        `\nRestore ${work.length} file${work.length === 1 ? "" : "s"}? [y/N] `
      ))
    ) {
      out("Nothing restored.");
      return 0;
    }

    let ok = true;
    for (const item of work) {
      try {
        out(tilde(restore(item, dir)));
      } catch (error) {
        ok = false;
        err(
          `error  could not restore ${tilde(item.entry.path)} (${(error as { code?: string; name?: string } | undefined)?.code ?? (error as { name?: string } | undefined)?.name ?? "error"})`
        );
      }
    }
    const tracked = work
      .filter((item) => item.entry.gitTracked)
      .map((item) => tilde(item.entry.path));
    if (tracked.length > 0) {
      out(
        `\nGit tracks ${tracked.length} restored file${tracked.length === 1 ? "" : "s"}; git status shows any difference from the last commit:\n  ${tracked.join("\n  ")}`
      );
    }
    if (conflicts.length > 0) {
      err(
        `error  ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} skipped; the set stays undoable. Run again with --force to overwrite.`
      );
    }
    if (ok && conflicts.length === 0) {
      atomicWrite(
        join(dir, MANIFEST),
        `${JSON.stringify({ ...manifest, undoneAt: now().toISOString() }, null, "\t")}\n`,
        0o600
      );
      out(`Marked ${name} as undone.`);
    }
    return ok && conflicts.length === 0 ? 0 : 1;
  };

  return { run };
};
