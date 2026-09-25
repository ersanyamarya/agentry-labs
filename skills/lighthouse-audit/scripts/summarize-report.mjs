#!/usr/bin/env node
// Summarizes Lighthouse JSON reports without dumping the raw files into context.
// Lighthouse reports commonly run 10-20k lines; this keeps only what triage needs:
// category scores, core metrics with Lighthouse's own rating, ranked opportunities,
// and failing binary audits.
//
// Usage:
//   node summarize-report.mjs <report.json> [--full] [--limit N]
//   node summarize-report.mjs <mobile.json> <desktop.json>
//
// One report prints a JSON summary. --full adds diagnostic detail (LCP element and
// breakdown, CLS culprits, render-blocking requests, longest request chain, unused
// JS, console errors), with every list capped at --limit items (default 10).
// Two reports print Markdown: score and metric tables for the fix plan, then the
// opportunities and failing audits from both runs merged.
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const METRICS = [
  ['first-contentful-paint', 'FCP'],
  ['largest-contentful-paint', 'LCP'],
  ['total-blocking-time', 'TBT'],
  ['cumulative-layout-shift', 'CLS'],
  ['speed-index', 'Speed Index'],
  ['interactive', 'TTI'],
  ['server-response-time', 'TTFB'],
];

// Newer Lighthouse versions replace some legacy audits with "-insight" audits.
// Each entry lists candidate audit ids, newest first.
const FULL_DETAILS = {
  lcpElement: ['lcp-discovery-insight', 'largest-contentful-paint-element'],
  lcpBreakdown: ['lcp-breakdown-insight'],
  clsCulprits: ['cls-culprits-insight', 'layout-shift-elements'],
  renderBlocking: ['render-blocking-insight', 'render-blocking-resources'],
  networkDependencyTree: ['network-dependency-tree-insight', 'critical-request-chains'],
  unusedJavaScript: ['unused-javascript'],
  consoleErrors: ['errors-in-console'],
  accessibilityLabelIssues: ['label-content-name-mismatch'],
};

const NOISE_KEYS = new Set(['debugData', 'screenshot', 'path', 'boundingRect', 'lhId']);

const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// Lighthouse's own color bands: >=0.9 good, >=0.5 needs work, else poor.
const rating = (score) => (score == null ? 'n/a' : score >= 0.9 ? 'good' : score >= 0.5 ? 'needs work' : 'poor');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Flatten a network tree to its longest request chain, the one that gates rendering.
const longestChain = (detail) => {
  const stack = [detail];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) stack.push(...node);
    if (!isObject(node)) continue;
    if (!('chains' in node)) {
      stack.push(...Object.values(node));
      continue;
    }
    const path = [];
    let chains = node.chains;
    while (chains && Object.keys(chains).length) {
      const links = Object.values(chains);
      const link =
        links.find((c) => c.isLongest) ??
        links.reduce((a, b) => ((b.navStartToEndTime ?? 0) > (a.navStartToEndTime ?? 0) ? b : a));
      path.push({
        url: (link.url ?? '').slice(0, 120),
        endMs: Math.round(link.navStartToEndTime ?? 0),
        kb: Math.round((link.transferSize ?? 0) / 1024),
      });
      chains = link.children;
    }
    return path;
  }
  return null;
};

// Trim nested lists, long strings, and deep trees so output stays small.
const cap = (value, limit, depth = 0) => {
  if (depth > 6) return '...';
  if (Array.isArray(value)) {
    const trimmed = value.slice(0, limit).map((v) => cap(v, limit, depth + 1));
    if (value.length > limit) trimmed.push(`... ${value.length - limit} more`);
    return trimmed;
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !NOISE_KEYS.has(k))
        .map(([k, v]) => [k, cap(v, limit, depth + 1)]),
    );
  }
  if (typeof value === 'string' && value.length > 200) return `${value.slice(0, 200)}...`;
  return value;
};

// An audit is an opportunity when it saves time on any metric (LCP, FCP, TBT, ...).
// CLS savings are unitless, so they are reported separately from milliseconds.
const opportunities = (audits) =>
  Object.entries(audits)
    .map(([audit, a]) => {
      const details = a.details ?? {};
      const timed = Object.entries(a.metricSavings ?? {}).filter(([metric, v]) => metric !== 'CLS' && v > 0);
      const [savesOn, best] = timed.reduce((top, entry) => (entry[1] > top[1] ? entry : top), [null, 0]);
      const savings = details.overallSavingsMs || best;
      const cls = a.metricSavings?.CLS || 0;
      const failing = a.score != null && a.score < 1 && (details.type === 'opportunity' || savings || cls);
      return (
        failing && {
          audit,
          title: a.title,
          displayValue: a.displayValue,
          savingsMs: Math.round(savings),
          savesOn: savesOn ?? (cls ? 'CLS' : null),
          ...(cls && { clsSavings: cls }),
        }
      );
    })
    .filter(Boolean)
    .sort((a, b) => b.savingsMs - a.savingsMs);

const failingAudits = (audits) =>
  Object.entries(audits)
    .filter(([, a]) => a.score != null && a.score < 1 && a.scoreDisplayMode === 'binary')
    .map(([audit, a]) => ({ audit, title: a.title }));

const summarize = (report, { full = false, limit = 10 } = {}) => {
  const audits = report.audits ?? {};
  const out = {
    finalUrl: report.finalUrl ?? report.finalDisplayedUrl,
    fetchTime: report.fetchTime,
    lighthouseVersion: report.lighthouseVersion,
    formFactor: report.configSettings?.formFactor,
    runWarnings: report.runWarnings ?? [],
    scores: Object.fromEntries(Object.entries(report.categories ?? {}).map(([k, v]) => [k, v.score])),
    metrics: Object.fromEntries(
      METRICS.filter(([key]) => audits[key]?.displayValue).map(([key, label]) => [
        label,
        { value: audits[key].displayValue, rating: rating(audits[key].score) },
      ]),
    ),
    opportunities: opportunities(audits).slice(0, limit),
    failingAudits: failingAudits(audits),
  };
  if (!full) return out;
  for (const [name, candidates] of Object.entries(FULL_DETAILS)) {
    const detail = candidates.map((c) => audits[c]?.details).find(Boolean);
    if (!detail) continue;
    out[name] = name === 'networkDependencyTree' ? longestChain(detail) : cap(detail.items ?? detail, limit);
  }
  return out;
};

const compare = (mobile, desktop) => {
  const m = summarize(mobile);
  const d = summarize(desktop);
  const lines = [`URL: ${m.finalUrl}  (Lighthouse ${m.lighthouseVersion}, ${m.fetchTime})`, ''];
  for (const warning of [...m.runWarnings, ...d.runWarnings]) lines.push(`WARNING: ${warning}`);

  lines.push('## Scores', '', '| Category | Mobile | Desktop |', '| --- | --- | --- |');
  for (const [cat, score] of Object.entries(m.scores)) lines.push(`| ${cat} | ${score} | ${d.scores[cat]} |`);

  const fmt = (v) => (v ? `${v.value} (${v.rating})` : 'n/a');
  lines.push('', '## Core metrics', '', '| Metric | Mobile | Desktop |', '| --- | --- | --- |');
  for (const [, label] of METRICS) {
    const mv = m.metrics[label];
    const dv = d.metrics[label];
    if (mv || dv) lines.push(`| ${label} | ${fmt(mv)} | ${fmt(dv)} |`);
  }

  lines.push('', '## Opportunities (savings in ms)', '');
  const merged = {};
  for (const [side, s] of [['mobile', m], ['desktop', d]]) {
    for (const o of s.opportunities) {
      const entry = (merged[o.audit] ??= { title: o.title });
      entry[side] = o.savingsMs;
      entry[`${side}Label`] = o.savesOn ? `${o.savingsMs} ${o.savesOn}` : `${o.savingsMs}`;
    }
  }
  const rows = Object.entries(merged).sort(([, a], [, b]) => (b.mobile ?? 0) - (a.mobile ?? 0));
  for (const [audit, o] of rows) lines.push(`- ${audit}: ${o.title} (mobile ${o.mobileLabel ?? '-'}, desktop ${o.desktopLabel ?? '-'})`);
  if (!rows.length) lines.push('- none');

  lines.push('', '## Failing audits', '');
  const failing = Object.fromEntries([...m.failingAudits, ...d.failingAudits].map((a) => [a.audit, a.title]));
  const failingLines = Object.entries(failing).map(([k, v]) => `- ${k}: ${v}`);
  lines.push(...(failingLines.length ? failingLines : ['- none']));
  return lines.join('\n');
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { full: { type: 'boolean', default: false }, limit: { type: 'string', default: '10' } },
});

if (positionals.length < 1 || positionals.length > 2) {
  console.error('Usage: node summarize-report.mjs <report.json> [--full] [--limit N]\n       node summarize-report.mjs <mobile.json> <desktop.json>');
  process.exit(1);
}

if (positionals.length === 2) {
  console.log(compare(load(positionals[0]), load(positionals[1])));
} else {
  console.log(JSON.stringify(summarize(load(positionals[0]), { full: values.full, limit: Number(values.limit) }), null, 2));
}
