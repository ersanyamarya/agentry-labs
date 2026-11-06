import { readFileSync } from "node:fs";

// The package's own version. From dist/lib or src/lib the package root is two levels up, in the repo and in an npm tarball alike.
export const packageVersion = (): string =>
  JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8")
  ).version;
