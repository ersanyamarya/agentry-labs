#!/usr/bin/env node
// Condenses fallow --format json output (any command) into counts plus the top findings per category.
// Usage: node summarize.mjs <fallow.json> [--top N]
import fs from 'node:fs';

const [file, flag, value] = process.argv.slice(2);
const top = flag === '--top' ? Number(value) : 10;

if (!file) {
  console.error('Usage: node summarize.mjs <fallow.json> [--top N]');
  process.exit(1);
}

const KEEP = [
  'path', 'file', 'line', 'name', 'export_name', 'package_name', 'specifier', 'member',
  'severity', 'cyclomatic', 'cognitive', 'crap', 'line_count', 'maintainability_index',
  'priority', 'category', 'effort', 'recommendation', 'kind', 'message',
];
const SKIP_ARRAYS = new Set(['actions', 'next_steps', 'workspace_diagnostics', 'factors', 'contributions']);

const isScalar = (v) => v === null || typeof v !== 'object';

const compactItem = (item) => {
  if (isScalar(item)) return item;
  const out = {};
  for (const key of KEEP) if (key in item && isScalar(item[key])) out[key] = item[key];
  // Nested location lists (clone instances, cycle members): keep a few paths.
  for (const [key, value] of Object.entries(item)) {
    if (!Array.isArray(value) || SKIP_ARRAYS.has(key) || value.length === 0) continue;
    out[key] = {
      count: value.length,
      sample: value.slice(0, 3).map((v) => (isScalar(v) ? v : [v.path ?? v.file, v.start_line ?? v.line].filter(Boolean).join(':'))),
    };
  }
  return out;
};

const summarizeSection = (section) => {
  const result = { totals: {}, findings: {} };
  for (const [key, value] of Object.entries(section)) {
    if (key === '_meta' || SKIP_ARRAYS.has(key)) continue;
    if (['summary', 'stats', 'vital_signs'].includes(key) && value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (typeof v === 'number' && v !== 0) result.totals[k] = v;
    } else if (key === 'health_score') {
      result.totals.health_score = `${value.score} (${value.grade})`;
    } else if (key === 'total_issues') {
      result.totals[key] = value;
    } else if (Array.isArray(value) && value.length > 0 && key !== 'file_scores') {
      result.findings[key] = { count: value.length, top: value.slice(0, top).map(compactItem) };
    }
  }
  return result;
};

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const sections = ['check', 'dupes', 'health'].filter((k) => data[k]);
const output = sections.length
  ? Object.fromEntries(sections.map((k) => [k, summarizeSection(data[k])]))
  : { [data.kind ?? 'result']: summarizeSection(data) };

output.nextSteps = (data.next_steps ?? []).map((s) => s.command);
output.diagnostics = (data.workspace_diagnostics ?? []).map((d) => d.message);

console.log(JSON.stringify(output, null, 2));
