// Vitest global setup: the CLI tests spawn dist/bin/agentry.js, so build it once before they run.

import { execFileSync } from "node:child_process";
import { root } from "./paths.js";

export default () => {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
};
