---
name: flutter-bundle-google-fonts
description: Replaces the google_fonts package in a Flutter project with fonts bundled in the app. Finds the families and weights in use, downloads static TTFs from the google/fonts repo, declares them in pubspec, rewrites the GoogleFonts calls in the theme and main files, removes the dependency and verifies. Use when the user asks to "remove google_fonts", "bundle fonts", "stop downloading fonts at runtime", "make fonts work offline", or wants Google Fonts to ship inside the app.
argument-hint: "[project-dir]"
---

# Bundle Google Fonts into a Flutter app

Scripts find the usages, download the fonts and verify the result. The model edits the Dart files, `pubspec.yaml` and docs.

1. **Scan the project**
   - Run `node ${CLAUDE_SKILL_DIR}/scripts/scan.mjs [project-dir]`. Stop when it reports no `pubspec.yaml`.
   - Read the JSON: `families` (name, weights, italic), `unresolvedWeights`, `textThemeCalls`, `dynamicUsages`, `otherFilesMentioning`.
   - Ask the user before continuing when `dynamicUsages` contains `getFont` or `getTextTheme`, since the family names come from runtime values.
   - Read the project's `CLAUDE.md` or `AGENTS.md` for icon, comment, logging and localization rules that affect the edits.

2. **Settle the weights**
   - Read `references/rewrite-rules.md` section "Weights the scan cannot see".
   - Resolve every `unresolvedWeights` entry and every `.copyWith(fontWeight: ...)` on theme styles by reading the call sites. Build the final weight list per family, and note italics.
   - Tell the user the families, weights and rough size (about 130 KB to 650 KB per file) before downloading.

3. **Download the fonts**
   - For each family run `node ${CLAUDE_SKILL_DIR}/scripts/fetch-fonts.mjs --family <dir> --weights <w,w> [--italic] --out assets/fonts`, where `<dir>` is the scan's `dir`.
   - The script exits 2 when the family is variable-only and `fonttools` is missing. Ask the user before re-running with `--allow-install`, which installs `fonttools` into a temp venv.
   - Keep each result's `pubspecFontsBlock` and `family`. The script also writes `assets/fonts/LICENSES.txt`.
   - Never download fonts from anywhere else. When a family is not on Google Fonts, stop and ask.

4. **Rewrite the project**
   - Read `references/rewrite-rules.md` and apply it: Dart call sites and imports, `pubspec.yaml` (dependency out, `fonts:` and license asset in), the `main()` license registration, and the docs and comments listed by the scan.
   - Change only what the scan reported. Do not touch unrelated theme values.

5. **Verify**
   - Run `dart pub get` or `flutter pub get`, then `dart format` on the changed files, `dart fix --apply` and `flutter analyze`. Follow any stricter check the project's `CLAUDE.md` names.
   - Run `node ${CLAUDE_SKILL_DIR}/scripts/scan.mjs [project-dir] --verify`. It must exit 0 with `remainingReferences: 0` and no `missingAssets`.
   - Run the project's tests. Never launch the app unless the user asks, and say the text appearance is unchecked.

6. **Report**
   - List families and weights bundled, files added (with total size), files edited, and the verify result.
   - Say what stays unverified: on-device rendering, and any weight the user should confirm.
   - Do not commit unless the user asks.
