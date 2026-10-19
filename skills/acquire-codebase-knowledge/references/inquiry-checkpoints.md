# Inquiry Checkpoints

Per-template investigation questions for Phase 2 of the acquire-codebase-knowledge workflow. For each template area, look for answers in the scan output first, then read source files to fill gaps.

---

## 1. STACK.md — Flutter/Dart Tech Stack

- What is the primary language and exact SDK version? (check `pubspec.yaml`, `.fvmrc`, `flutter` constraints, `.tool-versions`)
- What package manager is used? (`flutter`, `dart pub`, `melos`)
- What are the core Flutter packages and plugins? (for example `go_router`, `riverpod`, `firebase_core`, `easy_localization`, `shared_preferences`)
- What do `dependencies` vs `dev_dependencies` contain?
- Which platform folders exist and what platform-specific integrations are present? (`android/`, `ios/`, `macos/`, `web/`, `linux/`, `windows/`)
- What are the key scripts in `pubspec.yaml`, `Makefile`, or CI config?

## 2. STRUCTURE.md — Flutter Directory Layout

- Where does app source code live? (usually `lib/`)
- What are the entry points? (check `lib/main.dart` and any alternative entrypoints)
- What is the stated purpose of each top-level directory?
- Are there non-obvious directories such as `core/`, `features/`, `widgets/`, `providers/`, `router/`, `assets/`, or `test/`?
- Are there hidden config directories (`.github/`, `.vscode/`, `.fvm/`, `.idea/`)?
- What naming conventions do directories follow? (feature-based, layer-based, or mixed)

## 3. ARCHITECTURE.md — Flutter Patterns

- Is the app organized by feature (`features/`) or by layer (`core/`, `data/`, `widgets/`)?
- What is the primary data flow? Trace one screen or action from UI to provider/service/data source.
- Are there state-management patterns such as Riverpod, Provider, Bloc, or GetX?
- How are routes defined and navigated? (`go_router`, `Navigator`, nested shell routes)
- Are there platform channels, background services, or asynchronous flows?
- What design patterns appear repeatedly? (Repository, Service, Adapter, Singleton, Dependency Injection)

## 4. CONVENTIONS.md — Flutter Coding Standards

- What is the file naming convention? (check 10+ files — snake_case, camelCase, PascalCase)
- What is the function and variable naming convention?
- Are private methods/fields prefixed with `_`?
- What linter and formatter are configured? (check `analysis_options.yaml`, `dart format`, `flutter analyze`)
- How are errors handled at each layer? (throw vs. return `Result`/`Either`/`AsyncValue`)
- How are imports organized? (relative vs package imports, barrel exports, path aliases)
- Are localization and asset access patterns standardized?

## 5. INTEGRATIONS.md — Flutter External Services

- What external APIs are called? (search for `http`, `dio`, `firebase`, `shared_preferences`, `google_sign_in`, platform channels)
- How are credentials stored and accessed? (`.env`, secrets manager, env vars, remote config)
- What backend or storage services are connected? (Firebase, Supabase, REST, GraphQL, local storage)
- Are there platform-specific integrations for Android/iOS/macOS/web?
- What monitoring or observability tools are used? (Crashlytics, Analytics, logging, Sentry)
- Are there message queues or background tasks?

## 6. TESTING.md — Flutter Test Setup

- What test runner is configured? (`flutter test`, widget tests, integration tests)
- Where are tests located? (alongside source, in `test/`, or under feature directories)
- What assertion and mocking libraries are used? (`flutter_test`, `mocktail`, `mockito`, `fake_async`)
- How are external dependencies mocked? (dependency injection, fakes, network stubs)
- Are there widget tests, unit tests, or integration tests that hit real services?
- Is there a coverage threshold or CI enforcement?

## 7. CONCERNS.md — Known Flutter Issues

- How many TODOs/FIXMEs/HACKs are in production code? (see scan output)
- Which files have the highest git churn in the last 90 days? (see scan output)
- Are there large files that mix UI, state, and API logic?
- Are there fragile navigation or state flows that could break on rebuilds?
- Are there hardcoded values (URLs, API keys, colors, strings) that should be config or localization?
- What security risks exist? (raw tokens, insecure storage, missing auth checks)
- Are there performance patterns that don't scale? (expensive rebuilds, unbounded lists, heavy asset usage)

<PreToolUse-context>
<context_guidance>
  <tip>
    If you are reading this file to Edit it, Read is the correct tool — Edit needs file content in context.
    If you are reading to analyze or explore, use mcp__plugin_context-mode_context-mode__ctx_execute_file(path, language, code) instead — only your printed summary will enter the context.
  </tip>
</context_guidance>
</PreToolUse-context>
