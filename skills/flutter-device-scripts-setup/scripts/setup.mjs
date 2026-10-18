#!/usr/bin/env node
// Detects a Flutter project's app identifiers and (with --write) renders lib.sh,
// run_all.sh and build_release.sh from assets/*.tmpl into <project>/<out>, and adds a usage section to CLAUDE.md.
// Usage: node setup.mjs [project-dir] [--write] [--out scripts] [--force]
//        [--android-id X] [--android-debug-id X] [--ios-id X] [--macos-name X] [--activity X]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    write: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    out: { type: 'string', default: 'scripts' },
    'android-id': { type: 'string' },
    'android-debug-id': { type: 'string' },
    'ios-id': { type: 'string' },
    'macos-name': { type: 'string' },
    activity: { type: 'string' },
  },
});

const root = path.resolve(positionals[0] ?? '.');
const skillDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => {
  try { return fs.readFileSync(path.join(root, ...p), 'utf8'); } catch { return null; }
};
const exists = (...p) => fs.existsSync(path.join(root, ...p));

const pubspec = read('pubspec.yaml');
if (!pubspec || !/^\s*flutter:/m.test(pubspec)) {
  console.error(`Not a Flutter project: no pubspec.yaml with a flutter section in ${root}`);
  process.exit(1);
}
const notes = [];
const dartName = pubspec.match(/^name:\s*(\S+)/m)?.[1] ?? path.basename(root);

// --- Android ---
const gradle = read('android/app/build.gradle.kts') ?? read('android/app/build.gradle');
const manifest = read('android/app/src/main/AndroidManifest.xml');
let androidId = null, debugSuffix = '', namespace = null;
if (gradle) {
  androidId = gradle.match(/applicationId\s*=?\s*["']([^"']+)["']/)?.[1] ?? null;
  namespace = gradle.match(/namespace\s*=?\s*["']([^"']+)["']/)?.[1] ?? null;
  debugSuffix = gradle.match(/debug\s*\{[^}]*?applicationIdSuffix\s*=?\s*["']([^"']*)["']/s)?.[1] ?? '';
  if (/productFlavors/.test(gradle)) notes.push('Android productFlavors found: the scripts build the default flavor only. Add --flavor to the flutter commands in lib.sh if needed.');
  if (androidId?.includes('$')) notes.push('Android applicationId is computed; pass --android-id.');
}
// Activity: the one with a MAIN/LAUNCHER intent filter, expanded to a fully qualified class.
let activity = null;
if (manifest) {
  for (const m of manifest.matchAll(/<activity\b[\s\S]*?<\/activity>/g)) {
    if (/android\.intent\.category\.LAUNCHER/.test(m[0])) {
      activity = m[0].match(/android:name="([^"]+)"/)?.[1] ?? null;
      break;
    }
  }
  if (activity && !activity.includes('.')) activity = `.${activity}`;
  if (activity?.startsWith('.')) activity = `${namespace ?? androidId ?? ''}${activity}`;
}

// --- iOS: most common non-test PRODUCT_BUNDLE_IDENTIFIER in the Xcode project ---
function bundleIds(pbx) {
  const counts = {};
  for (const m of pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([^";\s]+)"?;/g)) {
    if (/Tests?$/.test(m[1]) || m[1].includes('$(')) continue;
    counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
const iosPbx = read('ios/Runner.xcodeproj/project.pbxproj');
const iosIds = iosPbx ? bundleIds(iosPbx) : [];
if (iosIds.length > 1) notes.push(`Multiple iOS bundle ids found (${iosIds.join(', ')}); using the most common. Override with --ios-id.`);

// --- macOS: PRODUCT_NAME from the AppInfo.xcconfig Flutter generates ---
const xcconfig = read('macos/Runner/Configs/AppInfo.xcconfig');
const macosName = xcconfig?.match(/^PRODUCT_NAME\s*=\s*(.+)$/m)?.[1].trim() ?? null;

const detected = {
  project: root,
  dartName,
  androidEnabled: !!gradle,
  iosEnabled: !!iosPbx,
  macosEnabled: !!macosName,
  androidId: values['android-id'] ?? androidId,
  androidDebugId: values['android-debug-id'] ?? ((values['android-id'] ?? androidId) ? (values['android-id'] ?? androidId) + debugSuffix : null),
  androidActivity: values.activity ?? activity,
  iosBundleId: values['ios-id'] ?? iosIds[0] ?? null,
  macosAppName: values['macos-name'] ?? macosName,
  notes,
};
const missing = [];
if (detected.androidEnabled && (!detected.androidId || !detected.androidActivity)) missing.push('Android id or launch activity');
if (detected.iosEnabled && !detected.iosBundleId) missing.push('iOS bundle id');
if (detected.macosEnabled && !detected.macosAppName) missing.push('macOS app name');

if (!values.write) {
  console.log(JSON.stringify({ ...detected, unresolved: missing }, null, 2));
  process.exit(missing.length ? 2 : 0);
}
if (missing.length) {
  console.error(`Cannot write: unresolved ${missing.join(', ')}. Pass overrides (see usage).`);
  process.exit(2);
}

const subs = {
  APP_NAME: dartName,
  ANDROID_APP_ID: detected.androidId ?? '',
  ANDROID_DEBUG_APP_ID: detected.androidDebugId ?? '',
  ANDROID_LAUNCH_ACTIVITY: detected.androidActivity ?? '',
  IOS_BUNDLE_ID: detected.iosBundleId ?? '',
  MACOS_APP_NAME: detected.macosAppName ?? '',
  ANDROID_ENABLED: String(detected.androidEnabled),
  IOS_ENABLED: String(detected.iosEnabled),
  MACOS_ENABLED: String(detected.macosEnabled),
};
const outDir = path.join(root, values.out);
fs.mkdirSync(outDir, { recursive: true });
const written = [], skipped = [];
for (const name of ['lib.sh', 'run_all.sh', 'build_release.sh']) {
  const target = path.join(outDir, name);
  if (fs.existsSync(target) && !values.force) { skipped.push(name); continue; }
  const body = fs.readFileSync(path.join(skillDir, 'assets', `${name}.tmpl`), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, k) => subs[k] ?? `{{${k}}}`);
  fs.writeFileSync(target, body, { mode: 0o755 });
  written.push(name);
}
// Add the usage section to CLAUDE.md (created if missing); the marker makes it idempotent.
const claudePath = path.join(root, 'CLAUDE.md');
const section = fs.readFileSync(path.join(skillDir, 'assets', 'claude-md-section.md.tmpl'), 'utf8')
  .replace(/\{\{OUT\}\}/g, values.out)
  .replace(/\{\{(\w+)\}\}/g, (_, k) => subs[k] ?? `{{${k}}}`);
const existing = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf8') : '';
let claudeMd = 'already present';
if (!existing.includes('<!-- flutter-device-scripts-setup -->')) {
  fs.writeFileSync(claudePath, existing ? existing.replace(/\s*$/, '\n\n') + section : section);
  claudeMd = existing ? 'section appended' : 'created';
}
console.log(JSON.stringify({ outDir, claudeMd, written, skipped: skipped.length ? `${skipped.join(', ')} exist; pass --force to overwrite` : [], detected }, null, 2));
