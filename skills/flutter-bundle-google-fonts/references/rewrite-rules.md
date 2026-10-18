# Rewrite rules: google_fonts to bundled fonts

Apply after `fetch-fonts.mjs` has produced each family's files and pubspec block.

## Code patterns

| Before | After |
|---|---|
| `GoogleFonts.nunito(fontSize: 14, ...)` | `TextStyle(fontFamily: 'Nunito', fontSize: 14, ...)` |
| `GoogleFonts.nunitoTextTheme([base])` | `(base ?? ThemeData.light().textTheme).apply(fontFamily: 'Nunito')` |
| `GoogleFonts.getFont(name)` or `getTextTheme(...)` | Cannot resolve statically. Ask the user which families the name can be, bundle them, and map name to family by hand. |
| `GoogleFonts.config.allowRuntimeFetching = ...` | Delete the line. Nothing fetches anymore. |
| `GoogleFonts.nunito` passed without a call (tear-off) | Replace by hand with a `TextStyle` factory. |

- Use the family name that `fetch-fonts.mjs` printed (the file prefix, such as `FiraCode`), not the method name.
- Define each family once as a private top-level constant next to the theme (`const _uiFont = 'Nunito';`). A top-level constant is reachable from extensions on `TextTheme`, where a class-private static is not.
- Keep every other argument (`fontSize`, `color`, `height`, `letterSpacing`) untouched. Drop nothing.
- A call whose args are all constants can become `const TextStyle(...)`; run `dart fix --apply` and let the lint decide.
- Add the file's `dart:ui`/`material.dart` import only when the file lacks it; remove `import 'package:google_fonts/google_fonts.dart';` from every Dart file.

## Weights the scan cannot see

- `unresolvedWeights` lists calls where `fontWeight` is a variable. Read each call site and add the weights that flow in.
- Widgets that call `.copyWith(fontWeight: ...)` on a theme style also need their weight bundled. Grep `fontWeight:` in files that touch theme text styles and add any weight missing from the scan.
- `textThemeCalls` never state weights. Material text styles use 400, 500 and 700 by default: bundle 400 and 700 at minimum, plus any weight the app sets elsewhere.
- Flutter picks the nearest declared weight when one is missing, so a missed weight renders slightly off rather than failing.

## pubspec.yaml

- Delete the `google_fonts:` dependency line.
- Under `flutter:`, add the `fonts:` block from the script (a sibling of `assets:`, indented two spaces). Merge into an existing `fonts:` list instead of adding a second one.
- Add `- assets/fonts/LICENSES.txt` to `assets:`. Declare font files only under `fonts:`, never under `assets:`.
- Delete any `google_fonts/` entry under `assets:` and delete that folder if it exists.
- Then run `flutter pub get` (or `dart pub get`).

## License notice

Register the bundled license text once, early in `main()`, after `WidgetsFlutterBinding.ensureInitialized()`:

```dart
LicenseRegistry.addLicense(() async* {
  yield LicenseEntryWithLineBreaks(
    ['Nunito', 'Fira Code'], // families the project bundles
    await rootBundle.loadString('assets/fonts/LICENSES.txt'),
  );
});
```

Import `package:flutter/services.dart` for `rootBundle` (`show rootBundle` keeps the import narrow). If the project already registers licenses, add the line to that block. An app that never opens `showLicensePage` still needs the text bundled to satisfy the OFL.

## Tests and docs

- Tests that only worked around font fetching (stubbed HTTP, `testWidgets`-only theme building) can stay. Update comments that still say fonts are fetched, since they will mislead the next reader.
- Update README, stack and theming docs and any `CLAUDE.md` or `AGENTS.md` that name `google_fonts` (`otherFilesMentioning` lists them). Say fonts are bundled under `assets/fonts/` and declared under `fonts:` in `pubspec.yaml`.
