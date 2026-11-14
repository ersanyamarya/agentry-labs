#!/usr/bin/env node
// Checks bundles.tsv: every component has exactly one line, every line points at a real path,
// and every bundle name is one of the allowed topics. Usage: node scripts/check-bundles.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLES = ["general", "web", "flutter", "flutter-assets", "mongodb"];

const argv = process.argv.slice(2);
const rootFlag = argv.indexOf("--root");
const root = resolve(rootFlag >= 0 ? argv[rootFlag + 1] : join(dirname(fileURLToPath(import.meta.url)), ".."));

const list = (dir) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)) : []);
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

const components = [
  ...list("skills").filter((n) => existsSync(join(root, "skills", n, "SKILL.md"))).map((n) => `skills/${n}`),
  ...list("agents").filter((n) => n.endsWith(".agent.md")).map((n) => `agents/${n}`),
  ...list("rules").filter((n) => n.endsWith(".md") && n !== "README.md").map((n) => `rules/${n}`),
  ...list("claude-md-files").filter((n) => n.endsWith(".md")).map((n) => `claude-md-files/${n}`),
];

const problems = [];
const seen = new Map();
const tsv = join(root, "bundles.tsv");
if (!existsSync(tsv)) problems.push("bundles.tsv is missing");
else {
  readFileSync(tsv, "utf8").split("\n").forEach((line, i) => {
    if (!line.trim() || line.startsWith("#")) return;
    const [bundle, selector] = line.split("\t");
    const at = `bundles.tsv:${i + 1}`;
    if (!selector) return problems.push(`${at}: expected "<bundle><TAB><path>"`);
    if (!BUNDLES.includes(bundle)) problems.push(`${at}: unknown bundle "${bundle}" (allowed: ${BUNDLES.join(", ")})`);
    if (!existsSync(join(root, selector))) problems.push(`${at}: ${selector} does not exist`);
    if (seen.has(selector)) problems.push(`${at}: ${selector} already listed at line ${seen.get(selector)}`);
    else seen.set(selector, i + 1);
  });
}
for (const c of components) if (!seen.has(c)) problems.push(`${c} has no line in bundles.tsv`);

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`bundles.tsv ok (${components.length} components, ${BUNDLES.length} bundles)`);
