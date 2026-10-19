---
name: sync-docs-from-diff
description: "Update repo documentation from a git diff. Use when code, architecture, workflow, tooling, or skill changes may have made CLAUDE.md, README.md, docs/, or an app or package README stale."
argument-hint: 'Optional diff scope, e.g. "--staged", "main...HEAD", or "v1.2.0..HEAD"'
user-invocable: true
---

# Sync docs from a git diff

## Scope

- Default: the current branch against `main` (`git diff main...HEAD`).
- `--staged`: staged changes only (`git diff --staged`).
- An explicit ref or range, when the user gives one.
- If the diff is empty or only generated output, stop and say no docs need updates.

## Which doc owns what

Use the repo's own doc-ownership table as the source of truth: look for a "Keeping the docs current" section (or similar) in the root CLAUDE.md. If the repo has none, use this default:

| Change | Update |
| --- | --- |
| Architecture, layer responsibility, conventions, agent guidance | `CLAUDE.md` |
| Setup steps, env vars, commands, project layout | `README.md` |
| A decision or a library/stack choice and its reasoning | `docs/opinions.md` or the repo's decision log |
| Something non-obvious learned while working | `docs/learnings.md`, newest entry first |
| A package's public API | that package's `README.md` |
| An app's behavior, commands or theme | that app's `README.md` and `CLAUDE.md` |
| Skill, prompt or agent changes | the affected `SKILL.md` or agent file, and any skill index in CLAUDE.md |

Skip docs whose source of truth did not change. A local refactor with no durable impact may need no doc change at all.

## Steps

1. **Gather the diff** for the chosen scope and list the changed areas.
2. **Map each area** to the table above. Ignore build output, generated files and lock files unless a source change means a doc must mention new behavior.
3. **Re-read before editing.** Open the target doc and the changed source. Never patch a doc from memory.
4. **Edit surgically.** Change only the sentences the diff made wrong. Keep the existing structure.
5. **Verify every claim.** Commands must exist in the repo's task files (`package.json`, `project.json`, `Makefile`, `pubspec.yaml` scripts); with Nx, check with `nx show project <name>`. Paths must exist (`ls` them). Do not invent versions or flags.
6. **Re-check the diff** if the code changed while you worked.

## Done when

- Every edited doc maps to a real change in the diff.
- No doc that the diff touches is left stale on purpose.
- The final summary lists each doc changed and why, and names the likely targets you left alone.

Brand, product or intent docs (for example `docs/Brand.md`, `docs/Product.md`) are not yours to rewrite. If a change affects them, propose the edit and ask before touching the file.
