// Remembers the projects the picker offers: recent folders and the roots searched for repos.
// Stored as JSON in the agentry cache dir (paths.cacheDir). Best effort: a missing or unwritable file is never an error.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Paths } from "../lib/paths.js";

const MAX_RECENTS = 10;

interface State {
  recents: string[];
  roots: string[];
}

export const createRecents = (paths: Pick<Paths, "cacheDir">) => {
  const file = join(paths.cacheDir, "ui.json");

  const read = (): State => {
    try {
      const saved = JSON.parse(readFileSync(file, "utf8"));
      const strings = (value: unknown): string[] =>
        Array.isArray(value)
          ? value.filter((item) => typeof item === "string")
          : [];
      return { recents: strings(saved.recents), roots: strings(saved.roots) };
    } catch {
      return { recents: [], roots: [] };
    }
  };

  const write = (state: State) => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(state, null, "\t")}\n`);
    } catch {
      // the picker still works without persistence
    }
  };

  const add = (dir: string) => {
    const state = read();
    write({
      ...state,
      recents: [dir, ...state.recents.filter((item) => item !== dir)].slice(
        0,
        MAX_RECENTS
      ),
    });
  };

  return { read, add, file };
};
