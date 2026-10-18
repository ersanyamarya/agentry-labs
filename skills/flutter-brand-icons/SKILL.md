---
name: flutter-brand-icons
description: Generate every app icon and native splash asset for a Flutter project from one single-color logo SVG, with colors taken from the project's brand doc, design doc, or Dart app theme. Saves the SVG into the project, installs a small sharp-based generator script with a config file, writes flutter_launcher_icons.yaml and flutter_native_splash.yaml, then runs both packages and writes the App Store and Play Store listing icons. Use when the user asks to "generate app icons from an SVG", "set up the splash screen", "regenerate launcher icons", "make the icons match the brand colors", "set up flutter_launcher_icons / flutter_native_splash", or pastes a logo SVG in a Flutter repo. Flutter projects only.
argument-hint: "[logo.svg path or pasted <svg>] [--wordmark <svg>] [--theme <file>]"
---

# Flutter brand icons

Turns one logo SVG into the Android, iOS, web, macOS, and Windows launcher icons, the native splash for each platform (light, dark, and Android 12+), and both store-listing icons. Scripts inspect the project, check the SVG and config, and verify the outputs. The model chooses theme colors and asks the user wherever a person has to decide.

1. **Confirm the project**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/inspect-project.mjs <project-root>`.
   - If `flutter` is false, stop: this skill only supports Flutter projects.
   - Keep the report. Later steps use `packages`, `configs`, `platforms`, `themeSources`, `jsToolDirs`, `runtimes`, and `existingIconAssets`.

2. **Save the logo SVG before doing anything else**
   - Take the SVG from the arguments: a file path, or markup pasted in chat. If neither was given, ask for it.
   - Write it to `assets/icon/source/logo.svg`. Save a wordmark, if supplied, to `assets/icon/source/wordmark.svg`. When a file already exists there, show it and ask before replacing it.
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/check-svg.mjs assets/icon/source/logo.svg` (add `--role wordmark` for the wordmark).
   - When `ok` is false, list the errors and ask the user for a corrected SVG. The source must be flat colors on a transparent background: black for the mark, plus one distinct flat color per extra tone. Never convert text or raster images by hand.
   - The generator trims transparent margins, so padding in the SVG does not matter.

3. **Resolve the theme source**
   - When the user named a theme file (`--theme` or in the prompt), use it.
   - Otherwise show the `themeSources` candidates and ask the user which file holds the brand colors, recommending a brand or design doc over Dart. When there are no candidates, ask for the location of the brand doc, design doc, or Dart file that defines the app theme. Never guess colors without a source.
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/extract-colors.mjs <file> [file...]` on the chosen files.
   - Read `references/theme-mapping.md`, then pick the colors for `roles.mark.light`/`dark`, `background.light`/`dark`, and `tinted`. If an existing YAML config sets colors, compare them as the reference describes.
   - Show the chosen colors with the `file:line` each came from, and ask the user to confirm before continuing.

4. **Install the generator into the project**
   - Choose the folder. When `jsToolDirs` lists an existing image or asset tools folder, offer to reuse it. Otherwise propose `tool/brand_icons/` (Dart's convention for dev scripts). Ask when unclear.
   - Choose the runtime from that folder's lockfile (`bun.lock`/`bun.lockb` → bun, `package-lock.json` → npm, `pnpm-lock.yaml` → pnpm). With no lockfile, use bun if `runtimes.bun` is set, else npm.
   - Copy `assets/tool/generate-brand-icons.mjs` and `assets/tool/brand-icons.config.json` from `${CLAUDE_SKILL_DIR}` into the folder. Copy `assets/tool/package.json` only when the folder has none. Otherwise add `sharp` to its devDependencies and the `brand-icons` script to its scripts.
   - Fill the config:
     - `projectRoot` is relative to the tool folder.
     - `themeSource` lists the files from step 3.
     - Set `platforms` from the report.
     - Set `wordmark` when one was saved. With no wordmark SVG but existing branding PNGs in `existingIconAssets`, set `brandingImages` to `{ "light": ..., "dark": ... }` so the splash keeps them.
     - Carry over `androidAdaptiveInset`, `fullscreen`, and `brandingBottomPadding` from any existing YAML.
   - Ask once, listing everything that changes, before:
     - replacing existing `flutter_launcher_icons.yaml` / `flutter_native_splash.yaml` (the generator overwrites both)
     - replacing the PNGs in `existingIconAssets`
     - running `flutter pub add --dev flutter_launcher_icons flutter_native_splash` when `packages` has either one missing
     - installing `sharp` with the chosen package manager

5. **Check the config**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/check-config.mjs <tool-dir>/brand-icons.config.json`.
   - Fix every error. For a contrast failure, adjust the background as `references/theme-mapping.md` describes and re-confirm with the user. Mention each warning.

6. **Generate**
   - Run the package's `brand-icons` script (for example `bun run brand-icons` or `npm run brand-icons`) from the tool folder. Add `--skip-flutter` only when the user asked for PNGs without regenerating native files.
   - On any failure, read `references/troubleshooting.md` and apply the matching fix.

7. **Verify**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/check-config.mjs <tool-dir>/brand-icons.config.json --outputs` and fix every error.
   - Open `light.png`, `dark.png`, `android12_light.png`, and the 1024 store icon as images. Check that the colors match the theme and that nothing is clipped.

8. **Report**
   - State what now exists: the regenerate command, the config path, the colors and where each came from, and the platforms covered.
   - Summarize `git status` by folder rather than listing every file, and note that nothing was committed.
   - Offer, without applying: removing a leftover `pubspec.yaml` config block, and splash preserve/remove in `main()` (see `references/troubleshooting.md`).
