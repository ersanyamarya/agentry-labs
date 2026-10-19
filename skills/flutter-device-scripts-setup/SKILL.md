---
name: flutter-device-scripts-setup
description: Build, install and launch a Flutter app on every connected Android phone, iPhone and this Mac, as a debug build (run-all) or a release build for unplugged testing (build-release), using the gentlemans-stack scripts in scripts/flutter/. Use when the user asks to "run on all my phones", "set up run_all", "build release on all devices", "one command to install on all devices", or wants the debug/release install loop in a Flutter repo.
argument-hint: "[app] [--dry-run]"
---

# Flutter device scripts

The only implementation is the stack's `scripts/flutter/run-all.mjs` and `scripts/flutter/build-release.mjs` (shared code in `scripts/flutter/lib/`). This skill only runs them and checks the result; it generates no shell files.

1. **Find the scripts**
   - Run from the repo root. Apps live under `apps/<app>`; the default app is `todo-mobile`.
   - When `scripts/flutter/run-all.mjs` is missing, the repo has not synced the stack's `scripts/flutter/` (and `scripts/lib/help.mjs`). Say so and stop; do not recreate the logic.

2. **Check what they will touch**
   - Run `node scripts/flutter/run-all.mjs <app> --dry-run` (or `build-release.mjs`). It prints every command and the ids it read from the app: Android `applicationId` (plus a debug `applicationIdSuffix`) and launch activity, iOS bundle id, macOS product name. A device list that is empty gets a placeholder so the plan still prints.
   - Show the user the ids. A missing platform means its folder or id could not be read (computed `applicationId`, flavors, custom Xcode configs); read the file named in `docs/flutter-targets.md` and fix the app, not the script.
   - `adb devices` and `xcrun devicectl list devices` show which real devices will be used.

3. **Run**
   - Running installs on real hardware and opens the app on this Mac, so ask first. On approval run the script without `--dry-run` and report the result per device. Through Nx: `pnpm nx run <app>:run-all` and `:build-release`.

4. **Caveats**
   - iOS debug keeps `flutter run` alive in the background (pid and log under `dist/<app>/run/`); stop it with `kill $(cat dist/<app>/run/<udid>.pid)`. Release builds install and launch directly, so unplug afterwards.
   - macOS launches with `open`, never `flutter run` (camera and microphone permission would be denied). Release installs to `~/Applications`, replacing the old copy.
   - Only iPhones with a connected tunnel are used. Android release signs with the debug key unless the app configures signing.
