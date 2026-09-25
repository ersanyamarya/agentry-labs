#!/usr/bin/env node
// Checks whether a JS/TS project is ready for fallow and prints a compact JSON report.
// Usage: node preflight.mjs [project-root]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const exists = (p) => fs.existsSync(path.join(root, p));

const run = (args) => {
  try {
    return execFileSync('fallow', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    return error.stdout || null;
  }
};

const version = run(['--version'])?.split('\n')[0].trim() ?? null;

const configFile = ['.fallowrc.json', '.fallowrc.jsonc', 'fallow.toml', '.fallow.toml'].find(exists) ?? null;

const lockfiles = {
  'package-lock.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lockb': 'bun',
  'bun.lock': 'bun',
};
const packageManager = Object.entries(lockfiles).find(([file]) => exists(file))?.[1] ?? null;

let workspaces = false;
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  workspaces = Boolean(pkg.workspaces) || exists('pnpm-workspace.yaml');
} catch {}

// Lines in guidance files that state a numeric code-quality limit.
const guidanceFiles = ['CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md', '.claude/CLAUDE.md'].filter(exists);
const limitPattern = /(cyclomatic|cognitive|complexity|max[- ]?lines|dead code|duplicat)/i;
const statedStandards = guidanceFiles.flatMap((file) =>
  fs
    .readFileSync(path.join(root, file), 'utf8')
    .split('\n')
    .map((line, i) => ({ file, line: i + 1, text: line.trim().slice(0, 160) }))
    .filter(({ text }) => limitPattern.test(text) && /\d/.test(text)),
);

let entryPoints = null;
if (version) {
  try {
    const listed = JSON.parse(run(['list', '--entry-points', '--format', 'json']) ?? 'null');
    const list = listed?.entry_points ?? listed?.entryPoints ?? [];
    entryPoints = { count: list.length, sample: list.slice(0, 10).map((e) => e.path ?? e) };
  } catch {}
}

const warnings = [];
if (!version) warnings.push('fallow not found on PATH; ask before installing (npx fallow or npm i -g fallow)');
if (!exists('package.json')) warnings.push('no package.json at root; confirm this is the JS/TS project root');
if (!exists('node_modules')) warnings.push(`node_modules missing; dependency and plugin findings will be unreliable until install runs${packageManager ? ` (${packageManager} install)` : ''}`);
if (!configFile) warnings.push('no fallow config; fallow uses auto-detection and defaults');

console.log(
  JSON.stringify({ root, fallowVersion: version, configFile, packageManager, workspaces, entryPoints, guidanceFiles, statedStandards, warnings }, null, 2),
);
