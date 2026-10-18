#!/usr/bin/env node
// Detects the Flutter app, its ids, existing icon and capture setup, website folders, theme sources and local tools.
// Usage: node detect-project.mjs <repo-root> [--limit N]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { limit: { type: 'string', default: '8' } },
});
if (positionals.length !== 1) {
  console.error('Usage: node detect-project.mjs <repo-root> [--limit N]');
  process.exit(1);
}
const root = path.resolve(positionals[0]);
const limit = Number(values.limit);
const exists = (p) => fs.existsSync(p);
const read = (p) => (exists(p) ? fs.readFileSync(p, 'utf8') : '');
const skip = new Set(['node_modules', '.git', 'build', 'dist', 'Pods', '.dart_tool', '.nx', '.claude', '.graft', 'graft']);

/** Files up to `depth` levels below `dir`, skipping build and dependency folders. */
const walk = (dir, depth, match, out = []) => {
  if (depth < 0 || !exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, depth - 1, match, out);
    else if (match(entry.name, full)) out.push(full);
  }
  return out;
};
const rel = (p) => path.relative(root, p) || '.';

// Flutter apps: a pubspec that depends on the Flutter SDK.
const flutterApps = walk(root, 4, (name) => name === 'pubspec.yaml')
  .filter((p) => /^\s*flutter:\s*$/m.test(read(p)) && /sdk:\s*flutter/.test(read(p)))
  .map((pubspec) => {
    const dir = path.dirname(pubspec);
    const pkgName = /^name:\s*(\S+)/m.exec(read(pubspec))?.[1];
    const pbxproj = read(path.join(dir, 'ios/Runner.xcodeproj/project.pbxproj'));
    const bundleId = /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/.exec(pbxproj)?.[1]?.replace(/"/g, '');
    const gradle = read(path.join(dir, 'android/app/build.gradle')) || read(path.join(dir, 'android/app/build.gradle.kts'));
    const androidId = /applicationId\s*=?\s*"([^"]+)"/.exec(gradle)?.[1];
    const macName = /PRODUCT_NAME\s*=\s*(\S+)/.exec(read(path.join(dir, 'macos/Runner/Configs/AppInfo.xcconfig')))?.[1];
    const routers = walk(path.join(dir, 'lib'), 6, (n) => /router/i.test(n) && n.endsWith('.dart'));
    return {
      androidApplicationId: androidId ?? null,
      captureSetup: {
        driver: exists(path.join(dir, 'test_driver')),
        integrationTest: exists(path.join(dir, 'integration_test')),
      },
      dir: rel(dir),
      iosBundleId: bundleId ?? null,
      macosProductName: macName ?? null,
      name: pkgName,
      routerFiles: routers.slice(0, limit).map(rel),
      iconSource: exists(path.join(dir, 'assets/icon/source/logo.svg')),
      iconPngs: ['light.png', 'dark.png'].filter((f) => exists(path.join(dir, 'assets/icon', f))),
      platforms: ['ios', 'android', 'macos', 'web'].filter((p) => exists(path.join(dir, p))),
    };
  });

// Website folders: a package.json with a web framework and a public folder.
const websites = walk(root, 3, (n) => n === 'package.json')
  .filter((p) => /"(vite|next|@tanstack\/react-start|astro|nuxt)"/.test(read(p)))
  .map((p) => ({
    dir: rel(path.dirname(p)),
    publicDir: exists(path.join(path.dirname(p), 'public')),
    ogImage: exists(path.join(path.dirname(p), 'public/og-default.png')),
  }));

// Theme sources: brand or design docs, and Dart theme files.
const themeSources = [
  ...walk(root, 3, (n) => /brand|design|style-?guide/i.test(n) && n.endsWith('.md')),
  ...walk(root, 5, (n) => /theme/i.test(n) && n.endsWith('.dart')),
  ...walk(root, 4, (n) => n === 'tokens.json'),
].map(rel).slice(0, limit * 3);

// Tools on PATH, and simulators that are booted right now.
const has = (cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const tools = Object.fromEntries(['flutter', 'node', 'pnpm', 'npm', 'bun', 'xcrun', 'screencapture', 'adb'].map((t) => [t, has(t)]));
let booted = [];
if (tools.xcrun) {
  try {
    const out = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' }));
    booted = Object.values(out.devices).flat().map((d) => ({ name: d.name, udid: d.udid }));
  } catch {
    booted = [];
  }
}

const report = {
  booted,
  flutterApps,
  existingToolFolder: ['tools/image-gen-tools', 'scripts/image-gen-tools'].find((d) => exists(path.join(root, d))) ?? null,
  monorepo: exists(path.join(root, 'nx.json')) ? 'nx' : exists(path.join(root, 'pnpm-workspace.yaml')) ? 'pnpm' : null,
  packageManager: exists(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : exists(path.join(root, 'bun.lock')) ? 'bun' : exists(path.join(root, 'package-lock.json')) ? 'npm' : null,
  themeSources: themeSources.slice(0, limit * 3),
  tools,
  websites,
};
console.log(JSON.stringify(report, null, 2));
