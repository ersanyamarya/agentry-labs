---
name: phased-plan
description: Write a short phased implementation plan as a Markdown file in the project. Each phase ships something testable, and each task row names the cheapest Claude model that does it (Haiku, Sonnet, Opus). Use when the user asks to "make a plan in phases", "write an implementation plan", "plan this so I can execute it from another session", "break this into phases with models", or wants work split across Haiku, Sonnet and Opus.
argument-hint: "[what to build] [--file docs/<name>-plan.md]"
---

# Phased plan

Write one plan file that someone can execute one phase at a time, from any session. Short beats complete: a long plan
gets skimmed.

1. **Orient.** Read `CLAUDE.md` / `AGENTS.md`, the README and the package manifest for the test command, layout and
   conventions. Use trail (`trail ask`, `trail map`) if the repo is indexed. Reuse what the conversation already
   settled; never re-ask it.
2. **Ask only what the code and conversation cannot answer**, in one round of at most three questions with a recommended option first:
   scope boundary, an open technology choice, the file path (default `docs/<name>-plan.md`). Do not ask about
   branches or model versions: no branches unless the user names a strategy, and models are `haiku`, `sonnet`, `opus`.
3. **Plan with Opus.** A plan is the spec every later row builds on, so Opus writes it. If this session runs Opus,
   write it here in the format below. Otherwise start one `general-purpose` subagent with `model: opus`. Its brief
   stands alone: the goal in the user's words, the answers from step 2, the test command and conventions from step 1,
   the file path, and the path of this `SKILL.md` for the format and row rules. It writes the file and returns the
   path and one line per phase.
4. **Check it:** `node ${CLAUDE_SKILL_DIR}/scripts/check-plan.mjs <plan-file>`; fix every error. Report the path, one
   line per phase and any Opus rows. Offer to commit only the plan file.

## Format

```markdown
# <Title>

<Two sentences: what gets built and what "done" looks like.>

**Run it:** one phase per session, in order; tick a row's box in the commit that finishes it. Test command: `<cmd>`.
Sonnet rows run inline; haiku and opus rows run as subagents (Agent tool, `model` set) with a brief that stands alone:
the row, its files and its done check.

## Phase 1: <Title>

**Value:** <what works after this phase that did not before>
**Done when:** <checks a reviewer can run>

| Done | Task | Model |
|---|---|---|
| [ ] | <one bounded change: what, where, the behaviour it adds> | sonnet |
```

Optional `## Notes` with at most five bullets, only for facts an executor would otherwise get wrong. No decisions log,
no out-of-scope list, no restated project facts.

## Writing the rows

- Order phases so each is usable and testable alone: foundation first, polish last. A phase is 3 to 8 rows.
- One row is one change a single pass can finish and review. Name files, commands or behaviour. Split anything bigger.
- **Model, cheapest that does it well.** `sonnet` is the default: new code, bug fixes with a known cause. `haiku` is
  mechanical work fully specified by the row: config, renames, docs of what shipped, tests that copy an existing
  pattern. `opus` only when a mistake is costly and hard to catch in review (a spec later rows build on, writes that
  are hard to undo, security). End an opus row with `Why opus: <reason>`. Size or importance alone is not a reason.
- Never put an unescaped `|` in a table cell, even inside backticks.
