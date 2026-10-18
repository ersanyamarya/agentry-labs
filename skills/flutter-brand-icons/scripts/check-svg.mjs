#!/usr/bin/env node
// Checks an SVG is usable as a recolorable logo source: flat fills, no raster or
// text, a viewBox, and no white shapes (white can't be told apart from "empty").
// Usage: node check-svg.mjs <file.svg> [--role mark|wordmark]
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { role: { type: 'string', default: 'mark' } },
});
if (positionals.length !== 1) {
  console.error('Usage: node check-svg.mjs <file.svg> [--role mark|wordmark]');
  process.exit(1);
}

const svg = fs.readFileSync(positionals[0], 'utf8');
const errors = [];
const warnings = [];

const rootTag = svg.match(/<svg\b[^>]*>/i)?.[0];
if (!rootTag) errors.push('No <svg> root element.');

const attr = (tag, name) => tag?.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
const viewBox = attr(rootTag, 'viewBox');
let aspect = null;
if (!viewBox) {
  errors.push('Root <svg> has no viewBox; resizing would clip or distort it.');
} else {
  const [, , w, h] = viewBox.trim().split(/[\s,]+/).map(Number);
  aspect = w / h;
  if (values.role === 'mark' && Math.abs(aspect - 1) > 0.25)
    warnings.push(`Mark is not near-square (aspect ${aspect.toFixed(2)}); it will be letterboxed inside the icon.`);
}

for (const [tag, why] of [
  ['image', 'embedded raster image: cannot be recolored and blurs when scaled'],
  ['text', 'live text: renders in a fallback font unless converted to outlines'],
  ['foreignObject', 'foreignObject is not rendered by librsvg'],
  ['script', 'script element'],
]) {
  if (new RegExp(`<${tag}\\b`, 'i').test(svg)) errors.push(`<${tag}>: ${why}.`);
}
if (/<(linearGradient|radialGradient)\b/i.test(svg))
  warnings.push('Gradient found: only flat colors are recolored; gradient stops need a manual mapping.');
if (/<(filter|mask)\b/i.test(svg)) warnings.push('filter/mask found: check the rendered PNG by eye.');

const NAMED = { black: '#000000', white: '#ffffff', none: 'none', currentcolor: 'currentColor' };
const normalize = (raw) => {
  const v = raw.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgb) return `#${rgb.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return v;
};
const colors = {};
for (const m of svg.matchAll(/\b(fill|stroke|stop-color)\s*(?:=\s*"|:\s*)([^";>]+)/gi)) {
  const c = normalize(m[2]);
  if (c === 'none' || c.startsWith('url(')) continue;
  colors[c] = (colors[c] ?? 0) + 1;
}
// Shapes without any fill attribute default to black in SVG.
const shapes = (svg.match(/<(path|rect|circle|ellipse|polygon|polyline)\b/gi) ?? []).length;
if (shapes === 0) errors.push('No drawable shapes found.');
if (Object.keys(colors).length === 0 && shapes > 0) colors['#000000 (default fill)'] = shapes;

if (colors['#ffffff']) errors.push('White fill found: use transparency for empty areas, and a distinct flat color for any second tone.');
if (colors.currentColor) warnings.push('currentColor renders black; it is recolored like #000000.');
const distinct = Object.keys(colors).length;
if (distinct > 3) warnings.push(`${distinct} distinct colors: each needs a role in the config recolor map.`);

console.log(JSON.stringify({ ok: errors.length === 0, viewBox, aspect, shapes, colors, errors, warnings }, null, 2));
