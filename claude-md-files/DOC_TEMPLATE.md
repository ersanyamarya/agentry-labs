# Doc template

The shared shape for a gentlemans-stack project's docs. `scripts/docs-lint.mjs` checks the required headings and links.
Sections marked **required** must exist in that order. **Optional** sections go where shown, or are left out.
Product-specific content goes in the marked project sections, never in the shared ones.

---

## 1. `CLAUDE.md`

Order matters: Claude reads top to bottom.

```markdown
# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Implementation principles            <!-- required -->

(The seven-step checklist from the stack. Copy it verbatim; do not reword it per project.)

## Architecture                         <!-- required -->

One paragraph: what the layers are and what each may import. Then the project's own layer list.
Link the stack's `docs/opinions.md` for the reasoning, do not repeat it.

### Adding an endpoint                  <!-- optional, only if the project has contracts -->

## Conventions                          <!-- required -->

Bullets. One convention per bullet. Name the tool that enforces it (Biome, `pnpm fix`, `lefthook`) when there is one.

## <Project-specific sections>           <!-- optional, e.g. Agent tooling, Skill hand-offs, Product rules -->

## Keeping the docs current             <!-- required -->

A table: file, "update it when…". Include `docs/learnings.md` with the "Any time" rule.

## General Guidelines for working with Nx   <!-- optional, last; only in Nx repos -->
```

Rules:

- No stale commands. Every command in a code block must exist in `package.json` or `project.json`.
- Name skills and paths that really exist. Check them before you write them down.

---

## 2. `README.md`

```markdown
# <Project name>

One or two sentences: what it is and who it is for.

## Requirements            <!-- required -->

Tools and versions, one per line. Only versions you have verified.

## Getting started         <!-- required -->

Numbered steps from a clean clone to a running app. Include env vars (name, where they come from, example value).

## Commands                <!-- required -->

A table or code block with each command and what it does. Every command is one that runs.

## Project layout          <!-- required -->

A tree of the top-level folders, one line each.

## Deployment              <!-- optional -->
```

---

## 3. `docs/opinions.md`

Settled, load-bearing choices. One decision per `##` heading, `## <Topic>: <choice>`.
Each section says what was chosen, why, and what it rules out. Changing a decision means editing its section here.

```markdown
# Opinions

Intro: what this file is for, and that disagreeing with an entry is a conversation, not a per-project override.

## <Topic>: <choice>

- What we use and what it replaces.
- Why (one reason per bullet).
- What is not allowed.
```

---

## 4. `docs/learnings.md`

Append-only log, newest entries first. Each entry is a level-2 heading that starts with the date.

```markdown
# Learnings

Intro: what goes here (the why, not the what) and that new entries go at the top.

## YYYY-MM-DD — <Short title> (plan <step>, optional)

- **Decided / Learned:** what happened.
- **Why:** why it matters or why the other option lost.
```

Rules:

- Heading date format is `YYYY-MM-DD`, then ` — ` (em dash), then the title.
- Dates are in order, newest first.
- Keep an entry short. Link to the code or the decision it depends on.

---

## 5. Package README (`<package>/README.md`)

```markdown
# @<scope>/<name>

One paragraph: what the package is for and what it must not do.

## Contract            <!-- optional; for packages that export types or schemas -->

Code block with the exported types.

## API                 <!-- required -->

One bullet or table row per exported function or repository method, with its signature.
Update this in the same change as any signature change.
```

---

## Project sections (kept per project, not shared)

Examples that stay in one project's docs:

- DeskMate: a "Learnings log" section in `CLAUDE.md`.
- mqtizer: its frozen API surface, in `CLAUDE.md`.
- wemove: its RBAC and squad rules, in `CLAUDE.md`.
