#!/usr/bin/env node
// Validates brand-icons.config.json before generating (shape, hex format, files,
// 3:1 mark/background contrast) and, with --outputs, the generated files after.
// Usage: node check-config.mjs <brand-icons.config.json> [--outputs]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { outputs: { type: 'boolean', default: false } },
});
if (positionals.length !== 1) {
  console.error('Usage: node check-config.mjs <brand-icons.config.json> [--outputs]');
  process.exit(1);
}

const configPath = path.resolve(positionals[0]);
const toolDir = path.dirname(configPath);
const errors = [];
const warnings = [];
const passed = [];
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.log(JSON.stringify({ ok: false, errors: [`Cannot parse config: ${e.message}`] }, null, 2));
  process.exit(0);
}
const root = path.resolve(toolDir, config.projectRoot ?? '.');
const HEX = /^#[0-9A-Fa-f]{6}$/;

// WCAG 2.x relative luminance / contrast ratio.
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

if (!fs.existsSync(path.join(root, 'pubspec.yaml'))) errors.push(`projectRoot does not reach a pubspec.yaml: ${root}`);
for (const key of ['mark', 'wordmark']) {
  if (config[key] && !fs.existsSync(path.join(root, config[key]))) errors.push(`${key} file not found: ${config[key]}`);
}
for (const mode of ['light', 'dark']) {
  const f = config.brandingImages?.[mode];
  if (config.brandingImages && !(f && fs.existsSync(path.join(root, f)))) errors.push(`brandingImages.${mode} not found: ${f}`);
}
if (config.wordmark && config.brandingImages) warnings.push('Both wordmark and brandingImages are set; brandingImages wins in the YAML.');
if (!config.mark) errors.push('mark is required.');

const hexes = { tinted: config.tinted, 'background.light': config.background?.light, 'background.dark': config.background?.dark };
for (const [role, v] of Object.entries(config.roles ?? {})) {
  hexes[`roles.${role}.light`] = v.light;
  hexes[`roles.${role}.dark`] = v.dark;
}
for (const [k, v] of Object.entries(hexes)) if (!HEX.test(v ?? '')) errors.push(`${k} must be #RRGGBB, got ${JSON.stringify(v)}`);

for (const [src, role] of Object.entries(config.recolor ?? {})) {
  if (!config.roles?.[role]) errors.push(`recolor maps ${src} to unknown role "${role}".`);
}
if (!config.recolor || Object.keys(config.recolor).length === 0) errors.push('recolor map is empty.');

if (errors.length === 0) {
  for (const [role, v] of Object.entries(config.roles)) {
    for (const mode of ['light', 'dark']) {
      const ratio = contrast(v[mode], config.background[mode]);
      const line = `${role}.${mode} ${v[mode]} on ${config.background[mode]}: ${ratio.toFixed(2)}:1`;
      (ratio < 3 ? errors : passed).push(ratio < 3 ? `${line} (below 3:1 for graphics)` : line);
    }
  }
}
for (const [p, on] of Object.entries(config.platforms ?? {})) {
  if (on && !fs.existsSync(path.join(root, p))) warnings.push(`platforms.${p} is on but ${p}/ does not exist.`);
}
if (config.platforms?.linux) warnings.push('flutter_launcher_icons does not generate Linux icons.');

// PNG IHDR: width/height at 16/20, color type at 25 (4 and 6 carry alpha; 3 may via tRNS).
const png = (file) => {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: [4, 6].includes(b[25]) || b.includes('tRNS') };
};
const expect = (file, spec) => {
  const p = path.isAbsolute(file) ? file : path.join(root, file);
  const label = path.relative(root, p);
  if (!fs.existsSync(p)) return errors.push(`missing ${label}`);
  const got = png(p);
  const bad = [];
  if (spec.width && got.width !== spec.width) bad.push(`width ${got.width}≠${spec.width}`);
  if (spec.height && got.height !== spec.height) bad.push(`height ${got.height}≠${spec.height}`);
  if (spec.alpha !== undefined && got.alpha !== spec.alpha) bad.push(spec.alpha ? 'no alpha channel' : 'has alpha channel');
  (bad.length ? errors : passed).push(bad.length ? `${label}: ${bad.join(', ')}` : `${label} ${got.width}×${got.height}`);
};

if (values.outputs && errors.length === 0) {
  const out = config.outputDir;
  for (const f of ['light', 'dark', 'tinted', 'ios_splash_light', 'ios_splash_dark', 'android12_light', 'android12_dark']) {
    expect(`${out}/${f}.png`, { width: 1152, height: 1152, alpha: true });
  }
  if (config.wordmark) for (const f of ['branding_light', 'branding_dark']) expect(`${out}/${f}.png`, { width: 800, height: 320 });
  const store = path.join(toolDir, config.storeIconsDir ?? 'store-icons');
  expect(path.join(store, 'app-store-icon-1024.png'), { width: 1024, height: 1024, alpha: false });
  expect(path.join(store, 'play-store-icon-512.png'), { width: 512, height: 512, alpha: true });
  if (config.platforms.ios) {
    const set = path.join(root, 'ios/Runner/Assets.xcassets/AppIcon.appiconset');
    const big = fs.existsSync(set) && fs.readdirSync(set).find((f) => /1024/.test(f) && f.endsWith('.png') && !/dark|tint/i.test(f));
    if (big) expect(path.join(set, big), { width: 1024, height: 1024, alpha: false });
    else errors.push('no 1024px icon in ios/Runner/Assets.xcassets/AppIcon.appiconset');
  }
  if (config.platforms.android) {
    for (const f of ['mipmap-xxxhdpi/ic_launcher.png', 'drawable-xxxhdpi/ic_launcher_foreground.png', 'drawable-xxxhdpi/android12splash.png']) {
      const p = path.join(root, 'android/app/src/main/res', f);
      (fs.existsSync(p) ? passed : errors).push(`${fs.existsSync(p) ? '' : 'missing '}android/app/src/main/res/${f}`);
    }
  }
  for (const y of ['flutter_launcher_icons.yaml', 'flutter_native_splash.yaml']) {
    const t = fs.existsSync(path.join(root, y)) ? fs.readFileSync(path.join(root, y), 'utf8') : '';
    (t.includes('Generated by') ? passed : errors).push(t.includes('Generated by') ? `${y} generated` : `${y} missing or not generated by the tool`);
  }
}

console.log(JSON.stringify({ ok: errors.length === 0, root, errors, warnings, passed: passed.slice(0, 30) }, null, 2));
