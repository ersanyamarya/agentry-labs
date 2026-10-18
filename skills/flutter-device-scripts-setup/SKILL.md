---
name: flutter-device-scripts-setup
description: Generate scripts/lib.sh, scripts/run_all.sh and scripts/build_release.sh for any Flutter project, with the app ids (Android applicationId, iOS bundle id, macOS app name, launch activity) read from the project itself. run_all builds, installs and launches a debug build on every connected Android phone, iPhone and this Mac; build_release does the same with release builds for unplugged testing. Use when the user asks to "set up run_all", "add device run scripts", "one command to install on all my phones", "build release on all devices", "copy the scripts setup to this project", or wants the debug/release install loop automated in a Flutter repo.
argument-hint: "[project-dir] [--out scripts] [--force]"
---

# Flutter device scripts setup

Generates three shell files in the target project. `scripts/setup.mjs` detects the identifiers and renders `assets/lib.sh.tmpl`, `assets/run_all.sh.tmpl` and `assets/build_release.sh.tmpl`; the model handles ambiguity and verification.

1. **Confirm the project**
   - Use the given directory, else the current one. It must contain `pubspec.yaml` with a `flutter:` section; stop with a clear message otherwise.
   - Check `flutter` is on PATH. Note which of `adb` and `xcrun` are missing; the generated scripts skip a platform whose tool is absent, so this is informational.

2. **Detect identifiers**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/setup.mjs <project-dir>` (no `--write`). It prints JSON: `androidId`, `androidDebugId` (id plus any `debug` build-type suffix), `androidActivity`, `iosBundleId`, `macosAppName`, per-platform enabled flags, `notes`, and `unresolved`.
   - Exit code 2 or a non-empty `unresolved` means a value could not be read (computed `applicationId`, flavors, custom Xcode configs). Read the relevant file (`android/app/build.gradle*`, `ios/Runner.xcodeproj/project.pbxproj`, `macos/Runner/Configs/AppInfo.xcconfig`), then pass the override flags: `--android-id`, `--android-debug-id`, `--ios-id`, `--macos-name`, `--activity`.
   - Show the user the detected values and every entry in `notes` (for example product flavors, multiple iOS bundle ids) before writing.

3. **Write the scripts**
   - Existing `scripts/lib.sh`, `run_all.sh` or `build_release.sh` are never overwritten unless `--force` is passed. When any exist, ask the user before using `--force`.
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/setup.mjs <project-dir> --write [--out <dir>] [overrides]`. The default output directory is `scripts`.
   - The same command adds a "Running and testing on devices" section (from `assets/claude-md-section.md.tmpl`) to the project's `CLAUDE.md`, creating the file when missing and skipping it when the marker comment is already there. This is what makes later "run and test the app" requests use the scripts.
   - Run `bash -n` on each written file.

4. **Verify**
   - List devices with `adb devices` and `xcrun devicectl list devices` and tell the user what `run_all.sh` will touch. Running it installs on real hardware and launches the app on this Mac, so ask before executing it.
   - On approval, run `scripts/run_all.sh` and report the result per device.

5. **Report**
   - List the files written, whether `CLAUDE.md` was created, appended or already had the section, the detected values, and platforms disabled because their folder is missing.
   - Recommend adding `scripts/.run/` to `.gitignore` (iOS debug logs and pid files go there) and ask before editing `.gitignore`.
   - Read `references/platform-notes.md` and pass on the caveats that apply to the detected platforms.
