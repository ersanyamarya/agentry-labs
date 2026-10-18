---
name: flutter-store-assets
description: Sets up and runs an image tool for a Flutter app that makes store screenshots (App Store iPhone and iPad, Mac App Store, Play phone and tablet), a Play feature graphic, store icons and website images (shots, favicons, share card). Captures every screen on booted simulators and this Mac with demo data, in light and dark, and renders them from HTML. Use when the user asks to "make store screenshots", "set up the image tool", "generate store assets", "capture the app with demo data", "regenerate the store images", "make website screenshots", or "set up image-gen-tools" for a Flutter project.
argument-hint: "[project-root] [--tool-dir <dir>]"
---

# Flutter store assets

Sets up a repeatable pipeline that turns a running Flutter app into store and website images. Code does the detection, the copying and the rendering. The model makes the decisions a person must make, and asks before installing anything or writing into the repo.

1. **Detect the project**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/detect-project.mjs <project-root>`. Use the current directory when no root is given.
   - Stop when `flutterApps` is empty: this skill only supports Flutter apps.
   - When there is more than one Flutter app, ask which one to use.
   - Keep the report. Later steps use `flutterApps`, `booted`, `tools`, `themeSources`, `websites`, `existingToolFolder` and `packageManager`.

2. **Check prerequisites and ask for what is missing**
   - Read `references/prerequisites.md`, then check each item against the report.
   - Ask for anything missing that cannot be discovered: the brand colours source, the logo SVG, a website folder to write into, or the simulators to boot. Ask one question at a time, and never guess colours.
   - Ask the user to boot the iPhone and iPad simulators when `booted` is empty. Never boot them without asking.

3. **Choose the tool folder and the screens**
   - Use `existingToolFolder` when it is set, and offer to reuse it. Otherwise propose `tools/image-gen-tools/` and ask.
   - Read `references/screens.md`, then list the screens that exist in the app's router. Ask the user which of them go in the store set, in order, and which are ready to ship. Never include a screen that is not ready.

4. **Build the demo data layer**
   - Read `references/demo-data.md`. Discover the app's models and repositories, then write a demo seed that fills them with made-up names, `example.com` emails and public test brokers.
   - Write `lib/core/demo/demo_mode.dart` from `${CLAUDE_SKILL_DIR}/assets/flutter/demo_mode.dart.template`. Show the seed to the user and ask them to confirm it before the first capture.
   - Make sure the demo mode blocks anything that would clear real data on a device, and never runs unless the `DEMO` define is set.

5. **Write the capture harness**
   - Copy `${CLAUDE_SKILL_DIR}/assets/flutter/capture_test.dart.template` to `integration_test/capture_test.dart`, and `${CLAUDE_SKILL_DIR}/assets/flutter/driver.dart.template` to `test_driver/integration_test.dart`. Fill in the screen list from step 3 and the routes from `routerFiles`.
   - Run `flutter analyze` on the new files and fix every issue.

6. **Set up the image tool**
   - Read `references/tool-setup.md`. Copy `${CLAUDE_SKILL_DIR}/assets/image-gen-tools/` into the tool folder. The copied files are `assets/image-gen-tools/capture-auto.ts`, `assets/image-gen-tools/generate-store-assets.ts`, `assets/image-gen-tools/generate-feature-graphic.ts`, `assets/image-gen-tools/generate-store-icons.ts`, `assets/image-gen-tools/generate-website-shots.ts`, `assets/image-gen-tools/generate-website-brand.ts`, `assets/image-gen-tools/theme.ts`, `assets/image-gen-tools/project.json.template`, and the files `assets/image-gen-tools/lib/app.ts`, `assets/image-gen-tools/lib/cards.ts`, `assets/image-gen-tools/lib/store-design.ts`, `assets/image-gen-tools/lib/device-frame.ts` and `assets/image-gen-tools/lib/mac-window.ts`.
   - Fill the placeholders in `lib/app.ts` (app name, package, folder, macOS process) and the `{{...}}` placeholders in the Dart templates, from the report. Fill `project.json.template` and `theme.ts` with the colours confirmed in step 2. Apply `references/portability.md` to every file, because some copy is specific to one app.
   - Add `playwright-core` and `sharp` with the package manager in the report, after asking.

7. **Run it and check the output**
   - Run the capture for the booted simulators, then the renders. Read `references/tool-setup.md` for the commands.
   - Open at least one image from each set. Check for overlapping text, clipped devices and demo-only data. Report any problem with the screen it came from.

8. **Report**
   - State the tool folder, the commands to re-run, the screens in each set, the colours and where they came from, and anything the model could not verify.
   - List what changed in the repo by folder, and note that nothing was committed.
