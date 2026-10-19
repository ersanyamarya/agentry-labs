#!/usr/bin/env node
// Reports the Flutter facts the icon pipeline depends on: SDK, the two generator
// packages, existing configs and icon assets, platforms, theme sources, runtimes.
// Usage: node inspect-project.mjs [project-root] [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { limit: { type: 'string', default: '10' } },
});
const root = path.resolve(positionals[0] ?? '.');
const limit = Number(values.limit);
const SKIP = new Set(['node_modules', 'build', '.dart_tool', '.git', 'Pods', '.symlinks', 'ephemeral', '.fvm']);

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const pubspec = read(path.join(root, 'pubspec.yaml'));
if (!pubspec) {
  console.log(JSON.stringify({ root, flutter: false, error: 'No pubspec.yaml at project root' }, null, 2));
  process.exit(0);
}

const depVersion = (name) => {
  const m = pubspec.match(new RegExp(`^\\s+${name}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim() || 'any' : null;
};
// A top-level config block in pubspec.yaml; the dedicated YAML file wins when both exist.
const pubspecBlock = (name) => new RegExp(`^${name}:\\s*$`, 'm').test(pubspec);

const walk = (dir, depth, out) => {
  if (depth < 0 || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, depth - 1, out);
    else out.push(p);
  }
  return out;
};
const rel = (p) => path.relative(root, p);

const docFiles = walk(root, 3, []).filter((p) =>
  /^(brand|design|design[-_ ]?system|style[-_ ]?guide|brand[-_ ]?guide)\.md$/i.test(path.basename(p)),
);
// \b keeps ListTileThemeData( etc. out; files with the most color literals rank first.
const themeDart = walk(path.join(root, 'lib'), 6, [])
  .filter((p) => p.endsWith('.dart'))
  .map((p) => ({ p, src: read(p) }))
  .filter(({ src }) => /\b(ThemeData|ColorScheme(\.fromSeed|\.light|\.dark)?)\s*\(/.test(src))
  .map(({ p, src }) => ({ p, literals: (src.match(/Color\(\s*0x/g) ?? []).length, seeded: /seedColor\s*:/.test(src) }))
  .filter((f) => f.literals > 0 || f.seeded)
  .sort((a, b) => b.literals - a.literals)
  .map((f) => f.p);

const iconDir = path.join(root, 'assets', 'icon');
const jsToolDirs = walk(root, 3, [])
  .filter((p) => path.basename(p) === 'package.json' && path.dirname(p) !== root)
  .map((p) => rel(path.dirname(p)));

const version = (cmd) => {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : null;
};

const report = {
  root,
  flutter: /sdk:\s*flutter/.test(pubspec),
  appName: pubspec.match(/^name:\s*(\S+)/m)?.[1] ?? null,
  packages: {
    flutter_launcher_icons: depVersion('flutter_launcher_icons'),
    flutter_native_splash: depVersion('flutter_native_splash'),
  },
  configs: {
    'flutter_launcher_icons.yaml': fs.existsSync(path.join(root, 'flutter_launcher_icons.yaml')),
    'flutter_native_splash.yaml': fs.existsSync(path.join(root, 'flutter_native_splash.yaml')),
    pubspecLauncherIconsBlock: pubspecBlock('flutter_launcher_icons'),
    pubspecNativeSplashBlock: pubspecBlock('flutter_native_splash'),
  },
  platforms: ['android', 'ios', 'web', 'macos', 'windows', 'linux'].filter((d) =>
    fs.existsSync(path.join(root, d)),
  ),
  existingIconAssets: fs.existsSync(iconDir)
    ? walk(iconDir, 2, []).map(rel).slice(0, limit * 2)
    : [],
  themeSources: {
    docs: docFiles.map(rel).slice(0, limit),
    dart: themeDart.map(rel).slice(0, limit),
  },
  jsToolDirs: jsToolDirs.slice(0, limit),
  runtimes: { node: version('node'), bun: version('bun'), dart: version('dart') },
  gitRepo: fs.existsSync(path.join(root, '.git')),
};
console.log(JSON.stringify(report, null, 2));
