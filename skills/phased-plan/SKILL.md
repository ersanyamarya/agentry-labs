---
name: phased-plan
description: Write a phased implementation plan as a Markdown file in the project. Every phase delivers testable value, each phase has a task table (checkbox, task, model), each task names the cheapest Claude model that does it, and the plan says how to run it (Sonnet inline, Haiku and Opus as subagents). Use when the user asks to "make a plan in phases", "write an implementation plan", "plan this so I can execute it from another session", "break this into phases with models", or wants work split across Haiku, Sonnet and Opus.
argument-hint: "[what to build] [--file docs/<name>-plan.md]"
---

# Phased plan

Write one plan file that a mid-tier coordinator session executes phase by phase: it does mid-tier tasks itself and
hands small- and large-tier tasks to subagents set to the planned model. `scripts/check-plan.mjs` confirms the shape.

1. **Learn the project**
   - Read `CLAUDE.md` / `AGENTS.md`, the README, the package manifest and the top-level layout for the runtime, test
     command, conventions and where docs live.
   - Read the code the plan touches, enough to name real files and functions.
   - Reuse facts already settled in the conversation; do not re-ask them.

2. **Ask once, before writing**
   - One round, up to four questions, recommended option first, only what changes the plan: scope boundary, open
     technology choices, how the result ships, names.
   - Also ask, unless already answered:
     - Model versions (default: latest Haiku, Sonnet, Opus).
     - Branching: one branch per phase (recommended; squash-merged into the default branch when its checks pass), one
       branch for the whole plan, or the current branch.
     - File path (default `docs/<name>-plan.md`; create `docs/` only with consent).
   - Never create a branch or worktree without that answer.

3. **Design phases and assign models**
   - Order phases so each ships something usable and testable alone: foundation first, UI and polish last.
   - Give each phase a `**Value:**` line (what becomes possible) and a `**Done when:**` line (checks a reviewer can run).
   - Write each task as one bounded change naming files, commands or behaviour. Split anything one pass cannot finish
     and review.
   - Read `references/model-choice.md` and pick the cheapest tier that does each task well. Every large-tier task gets
     a one-line reason in the plan; downgrade any whose only reason is size or importance.
   - Add an "Out of scope" list of tempting extras nobody asked for.

4. **Write the plan**
   - Start from `assets/plan.md.template`; keep its execution rules and fill the brackets (test command, branching
     answer, model names).
   - Keep the worktree line only if two or more tasks share no files and can run in parallel; otherwise delete it.
   - Fill "Ground rules" from step 1 facts, not assumptions.
   - Log the step 2 answers in "Decisions log" with today's date.
   - Never put an unescaped `|` in a table cell, even in backticks; write `list`, `on` and `off` instead.

5. **Check and report**
   - Run `node ${CLAUDE_SKILL_DIR}/scripts/check-plan.mjs <plan-file> --models "<small>,<mid>,<large>"`; fix every
     `errors` entry and re-run until `errorCount` is 0.
   - Confirm each row in `priciestModelRows` has its reason in the plan.
   - Report the path, one line per phase, task count per model, and large-tier tasks with reasons. Offer to commit
     only the plan file.
