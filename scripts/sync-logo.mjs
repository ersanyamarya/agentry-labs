#!/usr/bin/env node
// Copies the master logo (.github/assets/logo.svg) to every place that needs it.
// Run by the web package's predev/prebuild; also: node scripts/sync-logo.mjs
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const master = resolve(root, ".github/assets/logo.svg");
const targets = ["cli/packages/web/src/assets/logo.svg"];

for (const t of targets) {
  const dest = resolve(root, t);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(master, dest);
  console.log(`logo -> ${t}`);
}
