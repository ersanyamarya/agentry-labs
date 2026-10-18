---
argument-hint: 'Optional: specific area to focus on, e.g. "architecture only", "state management and routing"'
compatibility: Flutter/Dart only. Requires Flutter SDK and Dart SDK. Run the scan workflow from the target project root.
description: Use this skill when the user explicitly asks to map, document, or onboard into an existing Flutter/Dart codebase. Only trigger for Flutter projects; do not use it for non-Flutter repositories.
name: acquire-codebase-knowledge
---

# Acquire Flutter Codebase Knowledge

Produces seven populated documents in `docs/codebase/` for a Flutter project. Only document what is verifiable from source files, config, or terminal output. Never infer architecture from assumptions.

## Scope and Preconditions

This skill is intentionally scoped to Flutter and Dart codebases. It should only be used when the repository contains clear evidence of Flutter development, such as `pubspec.yaml`, `lib/`, and Flutter/Dart tooling. If the repo is not a Flutter project, stop and report that the skill is not applicable.

## Output Contract (Required)

Before finishing, all of the following must be true:

1. Exactly these files exist in `docs/codebase/`: `STACK.md`, `STRUCTURE.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `INTEGRATIONS.md`, `TESTING.md`, `CONCERNS.md`.
2. Every claim is traceable to source files, config, or terminal output.
3. Unknowns are marked as `[TODO]`; intent-dependent decisions are marked `[ASK USER]`.
4. Every document includes a short "evidence" list with concrete file paths.
5. Final response includes numbered `[ASK USER]` questions and intent-vs-reality divergences.

## Workflow

Copy and track this checklist:

```
- [ ] Phase 1: Run scan, confirm Flutter scope, read intent documents
- [ ] Phase 2: Investigate Flutter-specific areas
- [ ] Phase 3: Populate all seven docs in docs/codebase/
- [ ] Phase 4: Validate docs, present findings, resolve all [ASK USER] items
```

## Focus Area Mode

If the user supplies a focus area (for example: "architecture only" or "testing and state management"):

1. Always run Phase 1 in full.
2. Fully complete focus-area documents first.
3. For non-focus documents not yet analyzed, keep required sections present and mark unknowns as `[TODO]`.
4. Still run the Phase 4 validation loop on all seven documents before final output.

### Phase 1: Scan and Read Intent

1. Run the scan script from the target project root:

   ```bash
   python3 "$SKILL_ROOT/scripts/scan.py" --output docs/codebase/.codebase-scan.txt
   ```

   Where `$SKILL_ROOT` is the absolute path to the skill folder. Works on Windows, macOS, and Linux.

   **Quick start:** If you have the path inline:

   ```bash
   python3 /absolute/path/to/skills/acquire-codebase-knowledge/scripts/scan.py --output docs/codebase/.codebase-scan.txt
   ```

2. Confirm the repo is a Flutter project by checking for `pubspec.yaml`, `lib/`, and Flutter/Dart tooling before continuing.
3. Search for `README`, `ROADMAP`, `SPEC`, `DESIGN`, `Brand.md`, `CLAUDE.md`, and repo-local docs under `docs/`, then read the relevant ones.
4. Summarise the stated project intent before reading any source code.

### Phase 2: Investigate Flutter-Specific Areas

Use the scan output to answer questions for each of the seven templates. Load [`references/inquiry-checkpoints.md`](references/inquiry-checkpoints.md) for the full per-template question list.

If the stack is ambiguous or the repo mixes multiple ecosystems, load [`references/stack-detection.md`](references/stack-detection.md) and treat the project as Flutter-only only if `pubspec.yaml` and the `flutter` SDK are present.

Prioritize Flutter-relevant evidence such as:

- `pubspec.yaml` for SDK constraints, dependencies, and scripts
- `lib/main.dart` and app entry points
- `lib/router/`, `lib/providers/`, `lib/features/`, `lib/widgets/`, `lib/core/`
- `assets/`, `assets/translations/`, `l10n/`, and localization config
- `android/`, `ios/`, `macos/`, `web/`, `linux/`, and `windows/` for platform-specific code
- `analysis_options.yaml`, `test/`, and CI configuration for quality gates

### Phase 3: Populate Templates

Copy each template from `assets/templates/` into `docs/codebase/`. Fill in this order:

1. [STACK.md](assets/templates/STACK.md) — Dart/Flutter SDK version, package manager, runtime, core packages, and scripts
2. [STRUCTURE.md](assets/templates/STRUCTURE.md) — `lib/` layout, entry points, assets, platform folders, and generated-vs-source boundaries
3. [ARCHITECTURE.md](assets/templates/ARCHITECTURE.md) — app shell, routing, state management, data flow, and platform integration patterns
4. [CONVENTIONS.md](assets/templates/CONVENTIONS.md) — naming, formatting, linting, imports, error handling, and localization conventions
5. [INTEGRATIONS.md](assets/templates/INTEGRATIONS.md) — Firebase, APIs, storage, auth, device plugins, and platform channels
6. [TESTING.md](assets/templates/TESTING.md) — widget tests, unit tests, mock strategy, and coverage expectations
7. [CONCERNS.md](assets/templates/CONCERNS.md) — technical debt, flaky tests, state-management hotspots, and platform-specific risks

Use `[TODO]` for anything that cannot be determined from code. Use `[ASK USER]` where the right answer requires team intent.

### Phase 4: Validate, Repair, Verify

Run this mandatory validation loop before finalizing:

1. Validate each doc against `references/inquiry-checkpoints.md`.
2. For each non-trivial claim, confirm at least one evidence reference exists.
3. If any required section is missing or unsupported:

- Fix the document.
- Re-run validation.

4. Repeat until all seven docs pass.

Then present a summary of all seven documents, list every `[ASK USER]` item as a numbered question, and highlight any Intent vs. Reality divergences from Phase 1.

Validation pass criteria:

- No unsupported claims.
- No empty required sections.
- Unknowns use `[TODO]` rather than assumptions.
- Team-intent gaps are explicitly marked `[ASK USER]`.

---

## Gotchas

**Not every Dart repo is a Flutter app:** Confirm `pubspec.yaml` contains Flutter SDK constraints and app/package entrypoints before treating the repo as Flutter.

**Outdated README:** README often describes intended architecture, not the current one. Cross-reference with actual files in `lib/`, `test/`, and platform folders before treating any README claim as fact.

**Flutter package layout:** A Flutter project may include `lib/`, `test/`, `assets/`, `android/`, `ios/`, `web/`, or `example/`. Document the actual structure rather than assuming a web-only or mobile-only app.

**Generated/compiled output:** Never document patterns from `build/`, `.dart_tool/`, `.flutter-plugins`, `GeneratedPluginRegistrant`, or other generated artifacts. Document source conventions only.

**Localization and assets matter:** `assets/translations/`, `l10n/`, and platform resource folders often encode user-facing conventions and should be documented alongside the app UI code.

**State-management and routing patterns are core:** If the app uses Riverpod, Provider, Bloc, GetX, or `go_router`, document those patterns explicitly because they often shape the architecture more than folder names alone.

**High-churn files = fragile areas:** Files appearing most in recent git history have the highest modification rate and likely hidden complexity. Always note them in `CONCERNS.md`.

---

## Anti-Patterns

| ❌ Don't                                                                            | ✅ Do instead                                                                       |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| "Uses Clean Architecture with Domain/Data layers." (when no such directories exist) | State only what the actual `lib/` structure and package usage show.                 |
| "This is a Flutter app." (without checking `pubspec.yaml` and `lib/main.dart`)      | Confirm Flutter SDK constraints and the app entry point first.                      |
| Assume Riverpod or `go_router` from folder names alone                              | Check the dependency list and router/provider files before documenting the pattern. |
| Document generated plugin registrant files as architecture conventions              | Treat generated files as artifacts and document the source files that created them. |

---

## Enhanced Scan Output Sections

The `scan.py` script now produces the following sections in addition to the original output:

- **CODE METRICS** — Total files, lines of code by language, largest files (complexity signals)
- **FLUTTER-SPECIFIC SIGNALS** — `pubspec.yaml` dependencies, platform folders, localization assets, test layout, and route/state-management evidence
- **CI/CD PIPELINES** — GitHub Actions, Codemagic, Fastlane, or other automation configs
- **SECURITY & COMPLIANCE** — secrets handling, signed builds, and platform-specific release config
- **PERFORMANCE & TESTING** — widget test coverage, performance markers, and build-size considerations

Use these sections during Phase 2 to inform investigation questions and identify repository-specific patterns.

---

## Bundled Assets

| Asset                                                                    | When to load                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [`scripts/scan.py`](scripts/scan.py)                                     | Phase 1 — run first, before reading any code (Python 3.8+ required) |
| [`references/inquiry-checkpoints.md`](references/inquiry-checkpoints.md) | Phase 2 — load for per-template investigation questions             |
| [`references/stack-detection.md`](references/stack-detection.md)         | Phase 2 — only if stack is ambiguous                                |
| [`assets/templates/STACK.md`](assets/templates/STACK.md)                 | Phase 3 step 1                                                      |
| [`assets/templates/STRUCTURE.md`](assets/templates/STRUCTURE.md)         | Phase 3 step 2                                                      |
| [`assets/templates/ARCHITECTURE.md`](assets/templates/ARCHITECTURE.md)   | Phase 3 step 3                                                      |
| [`assets/templates/CONVENTIONS.md`](assets/templates/CONVENTIONS.md)     | Phase 3 step 4                                                      |
| [`assets/templates/INTEGRATIONS.md`](assets/templates/INTEGRATIONS.md)   | Phase 3 step 5                                                      |
| [`assets/templates/TESTING.md`](assets/templates/TESTING.md)             | Phase 3 step 6                                                      |
| [`assets/templates/CONCERNS.md`](assets/templates/CONCERNS.md)           | Phase 3 step 7                                                      |

Template usage mode:

- Default mode: complete only the "Core Sections (Required)" in each template.
- Extended mode: add optional sections only when the repo complexity justifies them.

<PreToolUse-context>
<context_guidance>
  <tip>
    If you are reading this file to Edit it, Read is the correct tool — Edit needs file content in context.
    If you are reading to analyze or explore, use mcp__plugin_context-mode_context-mode__ctx_execute_file(path, language, code) instead — only your printed summary will enter the context.
  </tip>
</context_guidance>
</PreToolUse-context>
