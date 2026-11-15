// Vitest global setup: the CLI tests spawn dist/bin/agentry.js, so build it before they run, unless dist is newer than every source file.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { bin, root } from "./paths.js";

const newestSource = (dir: string): number => {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const path = join(dir, entry.name);
    newest = Math.max(
      newest,
      entry.isDirectory() ? newestSource(path) : statSync(path).mtimeMs
    );
  }
  return newest;
};

const upToDate = (): boolean => {
  if (!existsSync(bin)) {
    return false;
  }
  const built = statSync(bin).mtimeMs;
  const sources = [
    join(root, "src"),
    join(root, "packages"),
    join(root, "package.json"),
  ];
  return sources.every((source) =>
    statSync(source).isDirectory()
      ? newestSource(source) <= built
      : statSync(source).mtimeMs <= built
  );
};

export default () => {
  if (upToDate()) {
    return;
  }
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
};
