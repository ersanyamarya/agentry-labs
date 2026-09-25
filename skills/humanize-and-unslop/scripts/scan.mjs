#!/usr/bin/env node
// Scans prose for high-precision AI tells (words, phrases, punctuation) listed in references/patterns.json.
// Structural tells need judgment and are left to the model (see references/judgment-patterns.md).
// Skips fenced code, inline code, URLs, HTML comments, and blockquotes.
// Usage: node scan.mjs [file|-] [--json]   (reads stdin when no file or "-")
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const input = args.find((a) => !a.startsWith('--')) ?? '-';

const here = path.dirname(fileURLToPath(import.meta.url));
const patterns = JSON.parse(fs.readFileSync(path.join(here, '../references/patterns.json'), 'utf8'));
const source = fs.readFileSync(input === '-' ? 0 : input, 'utf8');

// Replace non-prose spans with spaces so line and column numbers stay accurate.
const blank = (s) => s.replace(/[^\n]/g, ' ');
const masked = source
  .replace(/^(\s*)(```|~~~)[\s\S]*?^\s*\2.*$/gm, blank)
  .replace(/<!--[\s\S]*?-->/g, blank)
  .replace(/`[^`\n]+`/g, blank)
  .replace(/https?:\/\/\S+/g, blank)
  .replace(/^\s*>.*$/gm, blank);
const lines = masked.split('\n');

const findings = [];
const add = (severity, category, lineIndex, col, match, fix) =>
  findings.push({ severity, category, line: lineIndex + 1, col: col + 1, match, fix });

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Match simple inflections: leverage -> leverages/leveraged/leveraging, seamless -> seamlessly.
const wordRegex = (term) => {
  if (term.includes(' ') || term.includes('-')) return new RegExp(`\\b${escape(term)}\\b`, 'gi');
  const stem = term.endsWith('e') ? term.slice(0, -1) : term;
  const endings = term.endsWith('e') ? '(?:e|es|ed|ing)' : '(?:s|es|ed|ing|ly)?';
  return new RegExp(`\\b${escape(stem)}${endings}\\b`, 'gi');
};

const rules = [
  ...patterns.words.map((w) => ({ ...w, category: 'banned-word', regex: wordRegex(w.term) })),
  ...patterns.jargon.map((w) => ({ ...w, category: 'jargon', regex: wordRegex(w.term) })),
  ...patterns.phrases.map((p) => ({ ...p, regex: new RegExp(escape(p.text).replace(/'/g, "['’]"), 'gi') })),
  ...patterns.regexes.map((r) => ({ ...r, regex: new RegExp(r.pattern, 'gi') })),
  { category: 'em-dash', regex: /—/g, fix: 'period or comma' },
  { category: 'spaced-dash', regex: / (?:–|--) /g, fix: 'period or comma' },
  { category: 'curly-quote', regex: /[‘’“”]/g, fix: 'straight quote' },
  { category: 'emoji', regex: /(?![©®™])\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/gu, fix: 'delete' },
];

lines.forEach((line, i) => {
  for (const rule of rules) {
    for (const m of line.matchAll(rule.regex)) add(rule.severity ?? 'fix', rule.category, i, m.index, m[0], rule.fix);
  }
});

findings.sort((a, b) => a.line - b.line || a.col - b.col);
const counts = findings.reduce((acc, f) => ({ ...acc, [f.category]: (acc[f.category] ?? 0) + 1 }), {});
const fixCount = findings.filter((f) => f.severity === 'fix').length;

if (asJson) {
  console.log(JSON.stringify({ total: findings.length, fix: fixCount, review: findings.length - fixCount, counts, findings }, null, 2));
} else {
  console.log(`scan: ${findings.length} findings (${fixCount} fix, ${findings.length - fixCount} review)`);
  for (const f of findings) console.log(`${f.severity.padEnd(6)} ${f.line}:${f.col}  ${f.category}  "${f.match}" -> ${f.fix}`);
  if (findings.length) console.log(`counts: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
