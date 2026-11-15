import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The published CLI's version. Walks up from this file (packages/core/src in the repo, dist/bin or dist/web/... in a
// bundle) to the first package.json named @ersanyamarya/agentry-cli, so it holds however the code is laid out.
const CLI = "@ersanyamarya/agentry-cli";

// The folder of that package.json (the CLI's own folder; in a repo checkout its parent holds global/).
export const packageRoot = (): string => {
  for (let url = new URL("./package.json", import.meta.url); ; ) {
    if (existsSync(url)) {
      const pkg = JSON.parse(readFileSync(url, "utf8"));
      if (pkg.name === CLI) {
        return fileURLToPath(new URL(".", url));
      }
    }
    const up = new URL("../package.json", url);
    if (up.href === url.href) {
      throw new Error(`${CLI} package.json not found above ${import.meta.url}`);
    }
    url = up;
  }
};

export const packageVersion = (): string =>
  JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8")).version;
