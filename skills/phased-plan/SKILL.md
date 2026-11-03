---
name: phased-plan
description: Write a phased implementation plan as a Markdown file in the project, where every phase delivers testable value, each phase has a task table (checkbox, task, model), each task names the cheapest Claude model that does it well, and the plan says how to run it as one sub-session per task on that model. Use when the user asks to "make a plan in phases", "write an implementation plan", "plan this so I can execute it from another session", "break this into phases with models", or wants work split across Haiku, Sonnet and Opus sessions.
argument-hint: "[what to build] [--file docs/<name>-plan.md]"
---

# Phased plan

Produce one plan file that a coordinator session can execute phase by phase, starting a sub-session per task on the
model the plan names. The model designs phases and picks models; `scripts/check-plan.mjs` confirms the file's shape.

1. **Understand the project**
   - Read `CLAUDE.md` / `AGENTS.md`, the README, the package manifest and the top-level layout to learn the runtime,
     test command, conventions and where docs live.
   - Read the code the plan will touch, enough to name real files and functions in tasks.
   - Use any facts already settled in the conversation instead of asking again.

2. **Ask the scope questions before writing**
   - Ask only what changes the plan, in one round (up to four questions), each with a recommended option first.
     Typical: scope boundary (minimal vs. complete), technology choices still open, how the result is installed or
     shipped, names.
   - Ask which model versions to use when the user hasn't said; default to the latest Haiku, Sonnet and Opus.
   - Confirm the file path; default to `docs/<name>-plan.md` (create `docs/` only if the user agrees).

3. **Design the phases**
   - Order phases so each one ships something a person can use and test on its own; foundation first, UI and polish last.
   - Give every phase a `**Value:**` line (what becomes possible) and a `**Done when:**` line (checks a reviewer can run).
   - Write each task as one bounded change that names files, commands or behaviour. Split anything a single
     sub-session couldn't finish and review in one go.
   - Add an "Out of scope" list for tempting extras the user didn't ask for.

4. **Assign a model to each task**
   - Read `references/model-choice.md`.
   - Pick the cheapest tier that does the task well. Give every large-tier task a one-line reason in "How to use this
     plan"; downgrade any large-tier task whose only reason is size or importance.

5. **Write the plan**
   - Start from `assets/plan.md.template`. Keep the execution rules in "How to use this plan" (sub-session per task on
     its model, never a subagent; batching; coordinator on the mid tier with no model switches; tick boxes in the commit
     that finishes the task) and fill in the project's test command, branch prefix and model names.
   - Fill "Ground rules" with facts detected in step 1, not assumptions.
   - Record the scope answers from step 2 in "Decisions log" with today's date.
   - Never put an unescaped `|` inside a table cell, even in backticks; write `list`, `on` and `off` instead of a piped list.

6. **Check and report**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/check-plan.mjs <plan-file> --models "<small>,<mid>,<large>"`.
   - Fix every entry in `errors` and re-run until `errorCount` is 0.
   - Read every row in `priciestModelRows` and confirm its reason is written in the plan.
   - Report the file path, one line per phase, the task count per model, and the large-tier tasks with their reasons.
     Offer to commit only the plan file; leave other uncommitted changes alone.
