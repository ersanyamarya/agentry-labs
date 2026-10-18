#!/usr/bin/env node
// Downloads one Google Fonts family from github.com/google/fonts as static TTFs and prints its pubspec block.
// Usage: node fetch-fonts.mjs --family <method-name-lowercase> --weights 400,700 [--italic] --out assets/fonts [--allow-install]
// Variable-only families are cut into static weights with fonttools (needs python3; --allow-install lets the script pip-install it into a temp venv).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    family: { type: 'string' }, weights: { type: 'string', default: '400' }, italic: { type: 'boolean', default: false },
    out: { type: 'string', default: 'assets/fonts' }, 'allow-install': { type: 'boolean', default: false },
  },
});
if (!values.family) {
  console.error('Usage: node fetch-fonts.mjs --family <dir> --weights 400,700 [--italic] --out assets/fonts [--allow-install]');
  process.exit(1);
}

const NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const dir = values.family.toLowerCase().replace(/[^a-z0-9]/g, '');
const weights = values.weights.split(',').map(Number);
const styles = values.italic ? ['normal', 'italic'] : ['normal'];
const raw = 'https://github.com/google/fonts/raw/main';
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'gfont-'));

async function json(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'flutter-bundle-google-fonts' } });
  return r.ok ? r.json() : null;
}
async function download(url, dest) {
  const r = await fetch(url, { redirect: 'follow' });
  const buf = Buffer.from(await r.arrayBuffer());
  if (!r.ok || buf.length < 1000 || buf.subarray(0, 15).toString().includes('<')) throw new Error(`download failed: ${url}`);
  fs.writeFileSync(dest, buf);
}
function fail(msg, code = 1) { console.error(msg); process.exit(code); }

let license = null, listing = null;
for (const l of ['ofl', 'apache', 'ufl']) {
  listing = await json(`https://api.github.com/repos/google/fonts/contents/${l}/${dir}`);
  if (Array.isArray(listing)) { license = l; break; }
}
if (!license) fail(`No family folder "${dir}" under ofl/, apache/ or ufl/ in google/fonts. Check the name, or the font is not on Google Fonts.`);

const ttfs = listing.filter((f) => f.name.endsWith('.ttf')).map((f) => f.name);
const prefix = ttfs[0]?.split(/[-[]/)[0];
if (!prefix) fail(`No .ttf files in ${license}/${dir}.`);
const staticName = (w, s) => {
  const n = NAMES[w];
  return s === 'italic' ? (w === 400 ? `${prefix}-Italic.ttf` : `${prefix}-${n}Italic.ttf`) : `${prefix}-${n}.ttf`;
};
const variableFor = (s) => ttfs.find((f) => (s === 'italic' ? f.startsWith(`${prefix}-Italic[`) : f.startsWith(`${prefix}[`)));

fs.mkdirSync(values.out, { recursive: true });

let fonttools = null;
function ensureFonttools() {
  if (fonttools) return fonttools;
  if (spawnSync('fonttools', ['--version']).status === 0) return (fonttools = ['fonttools']);
  const venv = path.join(process.env.TMPDIR ?? os.tmpdir(), 'flutter-fonts-venv');
  const bin = path.join(venv, 'bin', 'fonttools');
  if (!fs.existsSync(bin)) {
    if (!values['allow-install']) fail('fonttools is required to cut static weights from a variable font. Ask the user, then re-run with --allow-install (installs fonttools into a temp venv).', 2);
    if (spawnSync('python3', ['-m', 'venv', venv]).status !== 0 || spawnSync(path.join(venv, 'bin', 'pip'), ['-q', 'install', 'fonttools']).status !== 0) fail('Could not install fonttools with python3/pip.');
  }
  return (fonttools = [bin]);
}

const written = [], entries = [];
const cache = {};
for (const s of styles) {
  for (const w of weights) {
    const name = staticName(w, s);
    const dest = path.join(values.out, name);
    if (ttfs.includes(name)) {
      await download(`${raw}/${license}/${dir}/${encodeURIComponent(name)}`, dest);
    } else {
      const v = variableFor(s);
      if (!v) fail(`Neither ${name} nor a variable font exists for ${s} ${w} in ${dir}. Available: ${ttfs.slice(0, 8).join(', ')}`);
      const src = path.join(tmp, v);
      if (!cache[v]) { await download(`${raw}/${license}/${dir}/${encodeURIComponent(v)}`, src); cache[v] = true; }
      const [cmd] = ensureFonttools();
      const r = spawnSync(cmd, ['varLib.instancer', '--static', src, `wght=${w}`, '-o', dest, '-q'], { encoding: 'utf8' });
      if (r.status !== 0) {
        const r2 = spawnSync(cmd, ['varLib.instancer', src, `wght=${w}`, '-o', dest, '-q'], { encoding: 'utf8' });
        if (r2.status !== 0) fail(`fonttools failed for ${v} wght=${w}: ${(r2.stderr || r.stderr).slice(0, 300)}`);
      }
    }
    written.push(`${values.out}/${name}`);
    entries.push({ name, w, s });
  }
}

const licenseFile = listing.find((f) => /^(OFL|LICENSE|UFL)\.txt$/i.test(f.name))?.name;
const licensesPath = path.join(values.out, 'LICENSES.txt');
if (licenseFile) {
  const dest = path.join(tmp, licenseFile);
  await download(`${raw}/${license}/${dir}/${licenseFile}`, dest);
  const existing = fs.existsSync(licensesPath) ? fs.readFileSync(licensesPath, 'utf8') : '';
  if (!existing.includes(`== ${prefix} ==`)) fs.appendFileSync(licensesPath, `${existing ? '\n\n' : ''}== ${prefix} ==\n\n${fs.readFileSync(dest, 'utf8')}`);
}

const snippet = [`    - family: ${prefix}`, '      fonts:', ...entries.flatMap((e) => [`        - asset: ${values.out}/${e.name}`, `          weight: ${e.w}`, ...(e.s === 'italic' ? ['          style: italic'] : [])])].join('\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ family: prefix, license, files: written, licensesFile: licenseFile ? licensesPath : null, pubspecFontsBlock: snippet }, null, 2));
