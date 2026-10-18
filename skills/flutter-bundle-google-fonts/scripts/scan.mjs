#!/usr/bin/env node
// Finds every google_fonts usage in a Flutter project and the font weights each family needs.
// Usage: node scan.mjs [project-dir] [--verify] [--limit N]
// --verify: exit 1 unless no google_fonts reference remains and every pubspec font asset exists.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { verify: { type: 'boolean', default: false }, limit: { type: 'string', default: '15' } },
});
const root = path.resolve(positionals[0] ?? '.');
const limit = Number(values.limit);
const SKIP = new Set(['build', '.dart_tool', '.git', 'node_modules', 'Pods', '.gradle', 'graft', '.idea']);
const WEIGHTS = { normal: 400, bold: 700, w100: 100, w200: 200, w300: 300, w400: 400, w500: 500, w600: 600, w700: 700, w800: 800, w900: 900 };
const DYNAMIC = new Set(['getFont', 'getTextTheme', 'asMap', 'config', 'pendingFonts', 'families']);

if (!fs.existsSync(path.join(root, 'pubspec.yaml'))) {
  console.error(`No pubspec.yaml in ${root}. Pass the Flutter project root.`);
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.') && e.name !== '.') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(dart|md|yaml|yml)$/.test(e.name) && e.name !== 'pubspec.lock') files.push(p);
  }
})(root);

const rel = (p) => path.relative(root, p);
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// Text between the parens that open at `open`, skipping quoted strings.
function callArgs(text, open) {
  let depth = 0, quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

const families = {};
const textThemes = [];
const dynamic = [];
const mentions = [];
let importCount = 0;

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  if (!/google_?fonts|GoogleFonts/i.test(text)) continue;
  const isDart = f.endsWith('.dart');
  if (!isDart) {
    if (path.basename(f) !== 'pubspec.yaml') mentions.push(rel(f));
    continue;
  }
  if (/package:google_fonts\//.test(text)) importCount++;
  const re = /GoogleFonts\.(\w+)/g;
  let m;
  let hits = 0;
  while ((m = re.exec(text))) {
    hits++;
    const name = m[1];
    const line = lineOf(text, m.index);
    const after = text.slice(m.index + m[0].length);
    const paren = after.match(/^\s*\(/);
    if (DYNAMIC.has(name)) { dynamic.push({ file: rel(f), line, symbol: name }); continue; }
    if (name.endsWith('TextTheme')) {
      textThemes.push({ file: rel(f), line, family: name.slice(0, -9) });
      continue;
    }
    const entry = (families[name] ??= { dir: name.toLowerCase(), calls: 0, weights: new Set(), italic: false, unresolved: [], files: new Set() });
    entry.calls++;
    entry.files.add(rel(f));
    const args = paren ? callArgs(text, m.index + m[0].length + paren[0].length - 1) : '';
    const w = args.match(/fontWeight\s*:\s*([^,\n)]+)/);
    if (!w) entry.weights.add(400);
    else {
      const k = w[1].trim().match(/^FontWeight\.(\w+)$/);
      if (k && WEIGHTS[k[1]]) entry.weights.add(WEIGHTS[k[1]]);
      else entry.unresolved.push(`${rel(f)}:${line} fontWeight: ${w[1].trim().slice(0, 40)}`);
    }
    if (/FontStyle\.italic/.test(args)) entry.italic = true;
    if (!paren) dynamic.push({ file: rel(f), line, symbol: `${name} (tear-off, no call)` });
  }
  if (hits === 0 && !/package:google_fonts\//.test(text)) mentions.push(rel(f));
}

const pubspec = fs.readFileSync(path.join(root, 'pubspec.yaml'), 'utf8');
const depLine = pubspec.split('\n').findIndex((l) => /^\s+google_fonts\s*:/.test(l));
const declared = [...pubspec.matchAll(/asset:\s*(\S+)/g)].map((x) => x[1]);
const missingAssets = declared.filter((a) => !fs.existsSync(path.join(root, a)));
const gfAssetDirs = [...pubspec.matchAll(/^\s*-\s*(\S*google_fonts\S*)\s*$/gm)].map((x) => x[1]);
const prefetch = files.some((f) => f.endsWith('.dart') && /allowRuntimeFetching/.test(fs.readFileSync(f, 'utf8')));

const out = {
  root,
  pubspec: { dependencyLine: depLine >= 0 ? depLine + 1 : null, googleFontsAssetEntries: gfAssetDirs, fontAssetsDeclared: declared.length, missingAssets },
  families: Object.fromEntries(Object.entries(families).map(([k, v]) => [k, { dir: v.dir, calls: v.calls, weights: [...v.weights].sort((a, b) => a - b), italic: v.italic, unresolvedWeights: v.unresolved.slice(0, limit), files: [...v.files].slice(0, limit) }])),
  textThemeCalls: textThemes.slice(0, limit),
  dynamicUsages: dynamic.slice(0, limit),
  dartFilesImportingPackage: importCount,
  runtimeFetchingConfigured: prefetch,
  otherFilesMentioning: mentions.slice(0, limit),
};

const remaining = importCount + Object.keys(families).length + textThemes.length + dynamic.length + (depLine >= 0 ? 1 : 0) + mentions.length + gfAssetDirs.length;
if (values.verify) {
  const ok = remaining === 0 && missingAssets.length === 0;
  console.log(JSON.stringify({ ok, remainingReferences: remaining, missingAssets, detail: out }, null, 2));
  process.exit(ok ? 0 : 1);
}
console.log(JSON.stringify(out, null, 2));
