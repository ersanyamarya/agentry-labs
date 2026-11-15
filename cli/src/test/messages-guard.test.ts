// Keeps user-facing text in the shared messages module: a new sentence typed straight into the terminal or web UI
// fails here. Line-based on purpose (the repo's `typescript` is root-only), so it checks the common shapes: JSX text,
// a KeyHint tuple, notify(...), and title, intro, done, label, hint or details values.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import { root as CLI_ROOT } from "./helpers/paths.js";

// Literals that are not user-facing prose: paths, glyphs, key names, brand and machine tokens.
const ALLOWED = new Set<string>(["agentry", "ink"]);
const ROOTS = ["packages/tui/src", "packages/web/src"];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "test" || name === "ui" ? [] : files(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

const twoWords = (text: string) => /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text);
const SHAPES: [string, RegExp][] = [
  ["JSX text", />\s*([^<>{}=;]*[A-Za-z]{2,}[^<>{}=;]*)<\//],
  ["KeyHint text", /^\s*\[\s*"[^"]+",\s*"([^"]*)"/],
  ["notify text", /\bnotify\(\s*["'`]([^"'`]*)["'`]/],
  [
    "labelled text",
    /\b(?:title|intro|done|label|hint|details)\s*[:=]\s*\{?\s*["'`]([^"'`$]*)["'`]/,
  ],
];

export const offenders = (): string[] => {
  const found: string[] = [];
  for (const root of ROOTS) {
    for (const file of files(join(CLI_ROOT, root))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const code = line.trim();
          if (code.startsWith("//") || code.startsWith("*")) {
            return;
          }
          for (const [kind, shape] of SHAPES) {
            const text = shape.exec(line)?.[1]?.trim();
            if (text && twoWords(text) && !ALLOWED.has(text)) {
              found.push(
                `${relative(CLI_ROOT, file)}:${index + 1} ${kind}: ${text}`
              );
            }
          }
        });
    }
  }
  return found;
};

describe("messages guard", () => {
  test("user-facing text lives in @agentry/core/messages", () => {
    expect(offenders()).toEqual([]);
  });
});
