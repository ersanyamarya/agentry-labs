---
name: flutter-lib-refactor
description: "Audit and refactor a Flutter project's lib/ folder into a feature-first layered architecture. Use when reorganizing Flutter code, migrating to clean architecture, restructuring lib/, moving screens/providers/models into core/data/features/widgets, or verifying a refactor did not break the app. Triggers: refactor lib, clean architecture, feature-first structure, reorganize flutter, move providers, migrate screens."
argument-hint: "Optional path to a custom target-structure JSON/YAML file"
user-invocable: true
---

# Flutter lib/ Refactor Skill

Audits the current `lib/` layout, proposes a migration to a layered, feature-first structure, applies the migration when approved, and verifies the app still builds and tests pass.

Follow the repo's code checklist (see `CLAUDE.md` → "Before Writing Any Code"): a refactor **moves and reuses** existing code — it must not rewrite working code or add new abstractions/dependencies that YAGNI would reject. Prefer moving files over recreating them; only extract a shared file/widget when something is genuinely reused.

## When to Use

- The `lib/` folder has grown organically and needs structural cleanup.
- You want to move from flat folders (`pages`, `providers`, `models`) to `core` / `data` / `features/<feature>` / `widgets`.
- You need to keep the app working while moving files and rewriting imports.
- You want a documented, reversible refactor plan before any file is touched.

## Target Architecture (Default)

```
lib/
├── main.dart
├── core/
│   ├── localization/    # Easy Localization helpers and keys
│   ├── router/          # go_router configuration
│   ├── theme/           # ThemeData + Google Fonts
│   └── utils/           # UUID generators and small helpers
├── data/
│   ├── api/             # Generated API client + Dio interceptors (stubbed today)
│   ├── local/           # Hive CE boxes + SharedPreferences wrappers
│   └── repository/      # App-wide repositories
├── features/
│   └── <feature>/
│       ├── data/        # Feature repositories + models
│       ├── presentation/# Screens/pages for the feature
│       └── providers/   # Riverpod providers for the feature
└── widgets/             # Shared reusable UI components
```

The exact target can be overridden with a JSON or YAML file passed as the skill argument.

## Procedure

1. **Discover current structure**
   - List every Dart file under `lib/`.
   - Read `pubspec.yaml` and note existing dependencies.
   - Build an import graph so we know which files depend on which.
   - Detect current conventions: `pages`, `providers`, `models`, `state`, `data`, `theme`, `router`, `utils`, `mqtt`, etc.

2. **Map files to the target structure**
   - Use heuristics and the import graph to propose a new location for each file.
   - Screens/pages map into `features/<feature>/presentation/`.
   - App-wide state maps into `features/<feature>/providers/` or a shared `core/providers/` if truly global.
   - Models and repositories map into `data/` or `features/<feature>/data/`.
   - Theme, routing, localization helpers, and generic utils map into `core/`.
   - Shared UI components map into `widgets/`.
   - Flag ambiguous files for user review instead of guessing.

3. **Generate a refactor plan**
   - Write `REFACTOR_PLAN.md` in the project root with:
     - Proposed directory tree
     - Every file move
     - Import rewrites required
     - New stub files/directories to create (e.g. `data/api/`)
     - Any files that need manual review
   - Default to dry-run: no files are moved yet.

4. **Get user approval**
   - Show the plan summary and ask the user to approve, edit, or abort.
   - If the user wants edits, update the plan and re-present.

5. **Apply the refactor**
   - Ensure the repo is under git and the working tree is clean (or create a backup branch).
   - Create target directories.
   - Move files with `git mv` when possible.
   - Rewrite Dart imports to match new relative paths.
   - Update or create barrel files (`export` statements) only when safe.
   - Create stub `data/api/` contents with a README explaining where the generated client will go.
   - Update `pubspec.yaml` only if needed packages are missing (do not add API packages until the user supplies an API spec).

6. **Verify the refactor**
   - Run `dart fix --apply`.
   - Run `dart format .`.
   - Run `flutter analyze`.
   - Run `flutter test`.
   - Capture output in `REFACTOR_LOG.md`.
   - If verification fails, report the errors and suggest fixes; do not hide failures.

7. **Report results**
   - Summarize what moved, what was stubbed, and any remaining manual steps.
   - Point to `REFACTOR_PLAN.md` and `REFACTOR_LOG.md`.

## Safety Rules

- Dry-run by default.
- Require a clean git working tree or create a backup branch.
- Never delete source files; only move them.
- Preserve file contents except for import paths.
- Do not auto-apply changes if `flutter analyze` or `flutter test` fails unless the user explicitly opts in.
