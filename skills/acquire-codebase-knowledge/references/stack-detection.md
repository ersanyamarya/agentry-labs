# Stack Detection Reference

Load this file when the Flutter/Dart stack is ambiguous, such as when the project mixes platforms or uses an unusual package structure.

---

## Flutter/Dart Manifest Files

| File | Purpose | Key fields to read |
|------|---------|--------------------|
| `pubspec.yaml` | Flutter or Dart package/app | `environment`, `dependencies`, `dev_dependencies`, `flutter`, `scripts` |
| `melos.yaml` | Flutter monorepo | package graph, scripts, workspace layout |
| `analysis_options.yaml` | Dart linting and formatting rules | analyzer settings, lint rules |
| `.fvmrc` | Flutter version pinning | pinned Flutter SDK version |
| `.tool-versions` | Flutter/Dart version pinning | pinned SDK version |
| `l10n.yaml` | Localization config | arb directory and localization output settings |

---

## Flutter/Dart SDK Version Detection

| Source | What to look for |
|--------|------------------|
| `pubspec.yaml` | `environment.sdk` or Flutter SDK constraints |
| `.fvmrc` | pinned Flutter version |
| `.tool-versions` | pinned Flutter or Dart version |

---

## Flutter/Dart Framework Detection

| Dependency in `pubspec.yaml` | Pattern to document |
|-----------------------------|----------------------|
| `flutter` | Flutter app or package |
| `flutter_riverpod` / `riverpod` | Riverpod state management |
| `provider` | Provider-based state management |
| `flutter_bloc` / `bloc` | BLoC state management |
| `get` | GetX state management |
| `go_router` | Router-based navigation |
| `firebase_core` / `firebase_auth` | Firebase integration |
| `easy_localization` | Localization setup |
| `shared_preferences` | Local persistence |
| `google_sign_in` | Google auth integration |
| `flutter_test` | Widget/unit test support |
| `mocktail` / `mockito` | Mocking in tests |

---

## Flutter/Dart Monorepo Detection

Check these signals in order:

1. `melos.yaml` — Melos Flutter monorepo
2. Multiple `pubspec.yaml` files under `packages/`, `apps/`, or `modules/`
3. Shared assets, localization files, or platform folders across multiple packages

If a monorepo is detected, map each package separately in `STACK.md` and note the monorepo structure in `STRUCTURE.md`.

---

## Flutter/Dart Asset and Localization Detection

If the project contains `assets/`, `l10n/`, or localization-related packages, document them as part of the app structure and conventions rather than treating them as incidental files.

Look for:

- `assets/` or `assets/translations/`
- `l10n.yaml` or localization config
- `flutter_gen` generated code
- `AppLocalizations` or `.tr()`/`context.l10n` usage patterns
