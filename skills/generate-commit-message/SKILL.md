---
name: generate-commit-message
description: "Write a Conventional Commit message in this repo's style (type(scope): Capitalized summary) from staged or unstaged changes. Use when writing a commit message, preparing a commit, or summarizing git diff changes."
disable-model-invocation: true
---

# Generate a commit message

If the repo's CLAUDE.md or `git log` shows a different convention (for example Gitmoji before the type), follow that instead of the format below.

## Gather the inputs

Run these from the repo root:

1. `git diff --staged --stat` and `git diff --staged` for staged changes, which are what a commit will contain.
2. If nothing is staged, use `git diff --stat` and `git diff` instead.
3. `git log --oneline -20` to match the recent style.

Read the diff, not just the file list. Ignore generated or lock churn (`*.g.dart`, `pnpm-lock.yaml`, `pubspec.lock`) when choosing the summary, unless that churn is the change.

## Format

```
<type>(<scope>): <Summary>

<body, optional>

<footer, optional>
```

- **type**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, or `chore` (tooling and config).
- **scope**: the area a reader would search for, usually the package or app: `mobile`, `api`, `web`, `design-tokens`, `biome`. Omit it only when the change spans many areas.
- **summary**: imperative mood, first word capitalized, no trailing period, about 50 characters or fewer.
- **body**: optional. Explain what and why, not how. Wrap at 72 characters.
- **footer**: `BREAKING CHANGE:` or issue references, only when they apply.
- No gitmoji. The history does not use them.

Example from this repo's history:

```
feat(mobile-app-rename): Add generator to rename a mobile app everywhere
```

## Output

Show the proposed message to the user. Commit only when the user asks. When Claude makes the commit, append the `Co-Authored-By` trailer that the session instructions specify.
