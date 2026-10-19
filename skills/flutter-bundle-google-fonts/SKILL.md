---
name: flutter-bundle-google-fonts
description: Replaces the google_fonts package in a Flutter app with fonts bundled in the app, using the gentlemans-stack scripts/flutter/bundle-fonts.mjs to scan usages, download static TTFs and verify. Use when the user asks to "remove google_fonts", "bundle fonts", "stop downloading fonts at runtime", "make fonts work offline", or wants Google Fonts to ship inside the app.
argument-hint: "[app]"
---

# Bundle Google Fonts into a Flutter app

`scripts/flutter/bundle-fonts.mjs` (stack) does the scan, download and verify; this skill covers the judgment and the Dart/pubspec edits. Fonts declared in the design tokens are not handled here: `pnpm nx run design-tokens:generate` copies them into every app. Run from the repo root; `[app]` is the folder under `apps/` (default `todo-mobile`). When the script is missing, the repo has not synced the stack's `scripts/flutter/`; say so and stop.

1. **Scan**
   - `node scripts/flutter/bundle-fonts.mjs scan <app>`. Read `families` (dir, weights, italic, `unresolvedWeights`), `textThemeCalls`, `dynamicUsages`, `otherFilesMentioning`.
   - Ask the user before continuing when `dynamicUsages` has `getFont` or `getTextTheme`: the family names come from runtime values.
   - Read the app's `CLAUDE.md` for comment, logging and localization rules that affect the edits.

2. **Settle the weights**
   - Read `references/rewrite-rules.md` section "Weights the scan cannot see". Resolve every unresolved weight and every `.copyWith(fontWeight: ...)` by reading call sites. Tell the user families, weights and rough size (130 KB to 650 KB per file) before downloading.

3. **Download**
   - Per family: `node scripts/flutter/bundle-fonts.mjs fetch <app> --family <dir> --weights <w,w> [--italic]`. It writes `apps/<app>/assets/fonts/` and `LICENSES.txt` and prints the `pubspecFontsBlock`.
   - Exit code 2 means a variable-only family needs `fonttools`; ask the user, then re-run with `--allow-install`. Never fetch fonts from anywhere but Google Fonts; stop and ask when a family is not there. `--dry-run` prints the plan without downloading.

4. **Rewrite**
   - Apply `references/rewrite-rules.md` (Dart call sites and imports, pubspec `fonts:` block, license asset, license registration in `main()`, docs). Change only what the scan reported.

5. **Verify**
   - `flutter pub get`, then `pnpm nx run <app>:format`, `:analyze`, `:test`. Then `node scripts/flutter/bundle-fonts.mjs verify <app>` must exit 0 (`remainingReferences: 0`, no `missingAssets`).
   - Never launch the app unless asked; say text appearance is unchecked.

6. **Report**
   - Families and weights bundled, files added with total size, files edited, verify result, what stays unverified (on-device rendering, weights to confirm). Do not commit unless asked.
