---
name: flutter-quality-gate
description: "Run the Flutter quality checks (format, analyze, test) for a Flutter app and fix common issues. Use when verifying Dart code, before finishing a task that touched a Flutter app, fixing analyzer warnings, or running Flutter tests."
argument-hint: "[app directory or Nx project name]"
user-invocable: true
---

# Flutter Quality Gate

## Find the app and the runner

1. Locate the app: the directory with the `pubspec.yaml` you changed (or the one the user names).
2. Prefer the repo's own targets. If the repo uses Nx, run `pnpm nx show project <app>` and use its `format`, `analyze` and `test` targets (`pnpm nx run <app>:format`, and so on). Targets often run `pub-get` or code generation first.
3. Otherwise run from the app directory:

```bash
dart format lib test
flutter analyze
flutter test
```

4. If the repo's CLAUDE.md names a generator check (design tokens, OpenAPI client, `build_runner`), run it when its inputs changed.

## Procedure

1. Format, then analyze, then test, in that order. Fix every error and warning; don't silence lints.
2. Replace deprecated `withOpacity(...)` with `withValues(alpha: ...)`.
3. Never hand-edit generated files (`*.g.dart`, generated fonts or tokens). Edit the source and regenerate.
4. If `test/widget_test.dart` is still the Flutter counter stub, replace it with a real test of the app's root widget.
5. A widget test that depends on localization or state providers wraps the widget in the same providers the app uses.

## Diff review before finishing

- **Theme:** colors, radii, spacing and text styles come from `Theme.of(context)` or the repo's token/theme extension, not literals inside widgets.
- **Errors:** a new `catch` never silently discards its error; bind it and handle it, or comment why silence is correct.
- **Scope:** only files the task needed changed; no stray formatting churn in unrelated files.

Report which checks ran, their result, and anything left unfixed with the reason.
