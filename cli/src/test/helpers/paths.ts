// Where things live, from src/test/helpers: the package root (cli/) and the built CLI the tests run as a subprocess.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
export const bin = join(root, "dist/bin/agentry.js");
