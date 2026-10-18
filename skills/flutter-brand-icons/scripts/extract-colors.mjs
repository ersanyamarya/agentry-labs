#!/usr/bin/env node
// Lists every color literal in brand/design docs or Dart theme files, with the
// line it sits on, so the model can map colors to icon roles.
// Usage: node extract-colors.mjs <file> [file...] [--limit N]
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { limit: { type: 'string', default: '80' } },
});
if (positionals.length === 0) {
  console.error('Usage: node extract-colors.mjs <file> [file...] [--limit N]');
  process.exit(1);
}
const limit = Number(values.limit);

// Dart: Color(0xAARRGGBB) / Color(0xRRGGBB) / seedColor: Colors.x. Docs & CSS: #RGB / #RRGGBB / #AARRGGBB.
const PATTERNS = [
  { re: /Color\(\s*0x([0-9a-fA-F]{2})([0-9a-fA-F]{6})\s*\)/g, hex: (m) => m[2], alpha: (m) => m[1] },
  { re: /(?<![\w&])#([0-9a-fA-F]{6})(?![0-9a-fA-F])/g, hex: (m) => m[1] },
  { re: /(?<![\w&])#([0-9a-fA-F]{2})([0-9a-fA-F]{6})(?![0-9a-fA-F])/g, hex: (m) => m[2], alpha: (m) => m[1] },
  { re: /(?<![\w&])#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])(?![0-9a-fA-F])/g, hex: (m) => m[1] + m[1] + m[2] + m[2] + m[3] + m[3] },
];

const hits = [];
const seeds = [];
for (const file of positionals) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/seedColor\s*:/.test(line)) seeds.push(`${file}:${i + 1}: ${line.trim().slice(0, 140)}`);
    const found = new Set();
    for (const p of PATTERNS) {
      for (const m of line.matchAll(p.re)) {
        const hex = `#${p.hex(m).toUpperCase()}`;
        if (found.has(hex)) continue;
        found.add(hex);
        const alpha = p.alpha?.(m);
        hits.push({
          at: `${file}:${i + 1}`,
          hex,
          ...(alpha && alpha.toUpperCase() !== 'FF' ? { alpha: alpha.toUpperCase() } : {}),
          line: line.trim().slice(0, 160),
        });
      }
    }
  });
}

console.log(
  JSON.stringify(
    {
      total: hits.length,
      distinct: new Set(hits.map((h) => h.hex)).size,
      seeds: seeds.slice(0, 10),
      colors: hits.slice(0, limit),
      truncated: hits.length > limit,
    },
    null,
    2,
  ),
);
