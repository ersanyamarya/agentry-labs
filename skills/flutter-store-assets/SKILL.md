---
name: flutter-store-assets
description: Operates the gentlemans-stack image tool (tools/image-gen-tools) for a Flutter app. Checks the tool is synced, drafts apps/<app>/image-gen.config.json with the user, runs capture on booted simulators and this Mac with demo data, then renders store cards (App Store iPhone, iPad, Mac; Play phone, tablet), the Play feature graphic, store listing icons and website images through the nx targets, and reports the outputs. Use when the user asks to "make store screenshots", "generate store assets", "capture the app with demo data", "regenerate the store images", "make website screenshots", or "set up the image config" for a Flutter app in the stack. Does not copy any tool code into projects.
argument-hint: "[app-name]"
---

# Flutter store assets

Runs the stack's single image tool. The tool owns capture, store cards, the feature graphic, listing icons and website images. This skill detects the app, drafts the config with the user, runs the nx targets and reports. It never copies tool or harness code into a project.

1. **Detect and check the tool is synced**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/detect-project.mjs <repo-root>`. Use the current directory when no root is given.
   - Stop when `flutterApps` is empty: this skill only supports Flutter apps. With more than one app, ask which one. The app name is its folder under `apps/`.
   - Stop when `imageGenToolSynced` is false. Tell the user to sync `tools/image-gen-tools` from the stack (`sync-from-stack`); do not copy it.
   - When `captureSetup` lacks `captureTest` or `driver`, the app predates the generated harness: tell the user to regenerate it with the `mobile-app` generator, and stop before capture. Screens that a route cannot reach need a named action in `integration_test/capture_actions.dart`; that is app code the user writes.

2. **Draft `apps/<app>/image-gen.config.json` with the user**
   - Skip this when `imageGenConfig` is true and the user only wants a re-run; read the config and confirm the screens still match.
   - Read `docs/opinions.md`, section "Store and website images", for the schema. Do not restate it here.
   - Read the app's router files (`routerFiles`) and list each route with a one-line description. Ask which screens go in the store set, in order, and which are not ready to ship (leave those out). Give each a stable slug.
   - Ask for the brand name, the card copy and the devices (`iphone`, `ipad`, `macos`) and targets. Colours and font are token names from `ui-libs/design-tokens/src/tokens.json`; never invent colours or hex values.
   - Ask for the website folder only when a website image set is wanted (`websites` lists candidates); otherwise leave `website` out.
   - Write the config and show it for confirmation before any capture.

3. **Check demo data**
   - Demo data is app code behind the `capture.dartDefines` flag (for example `DEMO=true`). Confirm with the user that the app has it and that it never touches real data. When it is missing, read `references/demo-data.md` and help write it as app code; the tool holds none.

4. **Capture**
   - Ask the user to boot the iPhone and iPad simulators when `booted` is empty. Never boot them without asking. Mac capture needs Screen Recording and Accessibility permission.
   - Run `node scripts/flutter/capture.mjs <app> [device...]` (or `pnpm nx run image-gen-tools:capture -- --app=<app>`). Add `--dry-run` to preview. Capture is `flutter drive` only.

5. **Render**
   - Store set: `node scripts/flutter/store-assets.mjs <app>` (or `pnpm nx run image-gen-tools:store -- --app=<app>`). Writes `dist/<app>/store/`, including the listing icons.
   - Website set, only when asked and configured: `pnpm nx run image-gen-tools:website -- --app=<app>`.
   - Open at least one image from each set. Look for overlapping text, clipped devices and demo-only data, and name the screen any problem came from.

6. **Report**
   - List the commands to re-run, the config path, the output folders and the screens in each set. Note what was skipped (a device not booted, no website) and what could not be verified. State that nothing was committed.
