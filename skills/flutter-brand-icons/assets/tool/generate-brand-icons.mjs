#!/usr/bin/env node
/**
 * Builds every app icon and native splash source image from one single-color
 * logo SVG, writes the flutter_launcher_icons / flutter_native_splash configs,
 * then runs both generators and writes the store-listing icons.
 *
 * All inputs live in brand-icons.config.json next to this file. The splash wordmark
 * comes from `wordmark` (an SVG, rendered here) or `brandingImages` (existing PNGs).
 * Edit the config,
 * never the generated YAML or PNGs, then re-run:
 *
 *   node generate-brand-icons.mjs [--skip-flutter]   (or: bun generate-brand-icons.mjs)
 *
 * Sizes follow the flutter_native_splash / platform specs:
 *   - icon + splash images are 1152×1152 with the mark in the central 768px
 *   - the Android 12+ splash is clipped to a 768px circle, so its mark is shrunk
 *     until its farthest opaque pixel sits inside that circle
 *   - iOS splash images carry the mark at 960px (iOS does not crop)
 *   - store icons: 1024×1024 without alpha (App Store), 512×512 with alpha (Play)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, 'brand-icons.config.json'), 'utf8'));
const ROOT = path.resolve(TOOL_DIR, config.projectRoot);
const OUT = path.join(ROOT, config.outputDir);
const STORE_OUT = path.join(TOOL_DIR, config.storeIconsDir ?? 'store-icons');
const skipFlutter = process.argv.includes('--skip-flutter');

const CANVAS = 1152;
const ICON_MARK = 768;
const IOS_SPLASH_MARK = 960;
const ANDROID12_RADIUS = 384 - 8;
const BRANDING = { width: 800, height: 320, boxWidth: 640, boxHeight: 160 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const rel = (p) => path.relative(ROOT, p);
const outPath = (file) => path.join(config.outputDir, file).split(path.sep).join('/');

const NAMED = { black: '#000000', white: '#ffffff', currentcolor: '#000000' };
const normalize = (raw) => {
  const v = raw.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const s = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  return s ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : v;
};

/** variant: 'light' | 'dark' | 'tinted'. Maps each source color to its role's color for that variant. */
const colorFor = (role, variant) => (variant === 'tinted' ? config.tinted : config.roles[role][variant]);
const recolor = (svg, variant) => {
  const map = Object.fromEntries(
    Object.entries(config.recolor).map(([src, role]) => [normalize(src), colorFor(role, variant)]),
  );
  let out = svg.replace(/\b(fill|stroke|stop-color)(\s*=\s*"|\s*:\s*)([^";>]+)/gi, (m, prop, sep, value) => {
    const target = map[normalize(value)];
    return target ? `${prop}${sep}${target}` : m;
  });
  // Shapes with no fill default to black; give the root the black mapping so they inherit it.
  const rootTag = out.match(/<svg\b[^>]*>/i)[0];
  if (map['#000000'] && !/\sfill\s*=/.test(rootTag)) {
    out = out.replace(rootTag, rootTag.replace(/^<svg/i, `<svg fill="${map['#000000']}"`));
  }
  return out;
};

/** Rasterizes the SVG large, trims transparent margins, and fits it inside a box. */
const renderMark = async (svg, boxWidth, boxHeight) => {
  const [, , vw, vh] = svg.match(/viewBox\s*=\s*"([^"]*)"/i)[1].trim().split(/[\s,]+/).map(Number);
  const scale = 2048 / Math.max(vw, vh);
  const sized = svg.replace(/<svg\b[^>]*>/i, (tag) =>
    tag
      .replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '')
      .replace(/^<svg/i, `<svg width="${Math.round(vw * scale)}" height="${Math.round(vh * scale)}"`),
  );
  const trimmed = await sharp(Buffer.from(sized)).png().trim().toBuffer();
  return sharp(trimmed).resize(boxWidth, boxHeight, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
};

const onCanvas = async (mark, width, height) => {
  const meta = await sharp(mark).metadata();
  const left = Math.floor((width - meta.width) / 2);
  const top = Math.floor((height - meta.height) / 2);
  return sharp(mark)
    .extend({ left, top, right: width - meta.width - left, bottom: height - meta.height - top, background: TRANSPARENT })
    .png()
    .toBuffer();
};

/** Farthest opaque pixel from the canvas center, in px. */
const maxRadius = async (png) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cx = info.width / 2;
  const cy = info.height / 2;
  let max = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) max = Math.max(max, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
  }
  return max;
};

const write = async (file, buffer) => {
  const target = path.join(OUT, file);
  await fs.promises.writeFile(target, buffer);
  console.log(`wrote ${rel(target)}`);
};

const run = (cmd, args) => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const yamlHeader = `# Generated by ${rel(path.join(TOOL_DIR, 'generate-brand-icons.mjs'))} from brand-icons.config.json.\n# Edit the config and re-run the script; manual edits here are overwritten.\n`;

const launcherIconsYaml = () => {
  const p = config.platforms;
  const lines = [yamlHeader + 'flutter_launcher_icons:', `  image_path: "${outPath('light.png')}"`, ''];
  lines.push(`  android: ${Boolean(p.android)}`);
  if (p.android) {
    lines.push(
      `  adaptive_icon_background: "${config.background.light}"`,
      `  adaptive_icon_foreground: "${outPath('light.png')}"`,
      `  adaptive_icon_foreground_inset: ${config.androidAdaptiveInset ?? 16}`,
      `  adaptive_icon_monochrome: "${outPath('tinted.png')}"`,
    );
  }
  lines.push('', `  ios: ${Boolean(p.ios)}`);
  if (p.ios) {
    lines.push(
      '  remove_alpha_ios: true',
      `  background_color_ios: "${config.background.light}"`,
      `  image_path_ios_dark_transparent: "${outPath('dark.png')}"`,
      `  image_path_ios_tinted_grayscale: "${outPath('tinted.png')}"`,
      '  desaturate_tinted_to_grayscale_ios: true',
    );
  }
  if (p.web) {
    lines.push(
      '',
      '  web:',
      '    generate: true',
      `    background_color: "${config.background.light}"`,
      `    theme_color: "${config.roles.mark.light}"`,
    );
  }
  for (const platform of ['windows', 'macos']) if (p[platform]) lines.push('', `  ${platform}:`, '    generate: true');
  return lines.join('\n') + '\n';
};

const nativeSplashYaml = (hasBranding) => {
  const p = config.platforms;
  const s = config.splash ?? {};
  // Pre-made branding PNGs (config.brandingImages) are referenced as-is; a wordmark SVG renders into outputDir.
  const img = config.brandingImages ?? { light: outPath('branding_light.png'), dark: outPath('branding_dark.png') };
  const branding = (indent) =>
    hasBranding ? [`${indent}branding: "${img.light}"`, `${indent}branding_dark: "${img.dark}"`] : [];
  const lines = [
    yamlHeader + 'flutter_native_splash:',
    `  color: "${config.background.light}"`,
    `  color_dark: "${config.background.dark}"`,
    `  image: "${outPath('light.png')}"`,
    `  image_dark: "${outPath('dark.png')}"`,
    `  image_ios: "${outPath('ios_splash_light.png')}"`,
    `  image_dark_ios: "${outPath('ios_splash_dark.png')}"`,
    ...branding('  '),
    ...(hasBranding ? [`  branding_bottom_padding: ${s.brandingBottomPadding ?? 24}`] : []),
    `  fullscreen: ${s.fullscreen ?? false}`,
    `  android: ${Boolean(p.android)}`,
    `  ios: ${Boolean(p.ios)}`,
    `  web: ${Boolean(p.web)}`,
  ];
  if (p.android) {
    lines.push(
      '  android_12:',
      `    color: "${config.background.light}"`,
      `    color_dark: "${config.background.dark}"`,
      `    image: "${outPath('android12_light.png')}"`,
      `    image_dark: "${outPath('android12_dark.png')}"`,
      ...branding('    '),
    );
  }
  return lines.join('\n') + '\n';
};

/** Reverts a file the splash generator touched only with blank-line churn. */
const revertWhitespaceOnly = (file) => {
  if (!fs.existsSync(path.join(ROOT, '.git'))) return;
  const git = (...a) => spawnSync('git', a, { cwd: ROOT });
  const changed = git('diff', '--quiet', '--', file).status === 1;
  const real = git('diff', '--quiet', '--ignore-all-space', '--ignore-blank-lines', '--', file).status === 1;
  if (changed && !real) {
    git('checkout', '--', file);
    console.log(`reverted whitespace-only changes in ${file}`);
  }
};

const main = async () => {
  const markSvg = fs.readFileSync(path.join(ROOT, config.mark), 'utf8');
  fs.mkdirSync(OUT, { recursive: true });

  for (const variant of ['light', 'dark', 'tinted']) {
    const svg = recolor(markSvg, variant);
    const icon = await onCanvas(await renderMark(svg, ICON_MARK, ICON_MARK), CANVAS, CANVAS);
    await write(`${variant}.png`, icon);
    if (variant === 'tinted') continue;

    await write(`ios_splash_${variant}.png`, await onCanvas(await renderMark(svg, IOS_SPLASH_MARK, IOS_SPLASH_MARK), CANVAS, CANVAS));

    const radius = await maxRadius(icon);
    const fit = radius > ANDROID12_RADIUS ? Math.floor((ICON_MARK * ANDROID12_RADIUS) / radius) : ICON_MARK;
    await write(`android12_${variant}.png`, await onCanvas(await renderMark(svg, fit, fit), CANVAS, CANVAS));
    if (variant === 'light' && fit < ICON_MARK) console.log(`  Android 12 mark shrunk to ${fit}px to fit the circular crop`);
  }

  const hasBranding = Boolean(config.wordmark || config.brandingImages);
  if (config.wordmark && !config.brandingImages) {
    const wordSvg = fs.readFileSync(path.join(ROOT, config.wordmark), 'utf8');
    for (const variant of ['light', 'dark']) {
      const mark = await renderMark(recolor(wordSvg, variant), BRANDING.boxWidth, BRANDING.boxHeight);
      await write(`branding_${variant}.png`, await onCanvas(mark, BRANDING.width, BRANDING.height));
    }
  }

  fs.writeFileSync(path.join(ROOT, 'flutter_launcher_icons.yaml'), launcherIconsYaml());
  fs.writeFileSync(path.join(ROOT, 'flutter_native_splash.yaml'), nativeSplashYaml(hasBranding));
  console.log('wrote flutter_launcher_icons.yaml, flutter_native_splash.yaml');

  fs.mkdirSync(STORE_OUT, { recursive: true });
  for (const { file, size, alpha } of [
    { file: 'app-store-icon-1024.png', size: 1024, alpha: false },
    { file: 'play-store-icon-512.png', size: 512, alpha: true },
  ]) {
    let pipeline = sharp(path.join(OUT, 'light.png')).resize(size, size).flatten({ background: config.background.light });
    if (alpha) pipeline = pipeline.ensureAlpha();
    const target = path.join(STORE_OUT, file);
    await pipeline.png().toFile(target);
    console.log(`wrote ${rel(target)}`);
  }

  if (skipFlutter) return;
  run('dart', ['run', 'flutter_launcher_icons']);
  run('dart', ['run', 'flutter_native_splash:create']);
  if (config.platforms.web) revertWhitespaceOnly('web/index.html');
};

await main();
