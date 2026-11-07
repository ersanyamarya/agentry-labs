---
name: phased-plan
description: Write a phased implementation plan as a Markdown file in the project. An Opus subagent designs it. Every phase delivers testable value, each phase has a task table (checkbox, task, model), each task names the cheapest Claude model that does it, and the plan says how to run it (Sonnet inline, Haiku and Opus as subagents). Use when the user asks to "make a plan in phases", "write an implementation plan", "plan this so I can execute it from another session", "break this into phases with models", or wants work split across Haiku, Sonnet and Opus.
argument-hint: "[what to build] [--file docs/<name>-plan.md]"
---

# Phased plan

The session (any model) asks the questions; an Opus subagent designs and writes the plan file; the session checks it.
A subagent cannot ask the user anything, so all questions happen first, in the session.

1. **Orient lightly**
   - Read `CLAUDE.md` / `AGENTS.md`, the README, the package manifest and the top-level layout for the runtime, test
     command, conventions and where docs live. Leave deep code reading to the subagent.
   - Reuse facts already settled in the conversation; do not re-ask them.

2. **Ask once, before delegating**
   - One round, up to four questions, recommended option first, only what changes the plan: scope boundary, open
     technology choices, how the result ships, names.
   - Also ask, unless already answered:
     - Model versions (default: latest Haiku, Sonnet, Opus).
     - Branching: one branch per phase (recommended; squash-merged into the default branch when its checks pass), one
       branch for the whole plan, or the current branch.
     - File path (default `docs/<name>-plan.md`; create `docs/` only with consent).
   - Never create a branch or worktree without that answer.

3. **Delegate the plan to Opus**
   - A plan of one or two phases may be written inline instead; skip the subagent then.
   - Start one `general-purpose` subagent with `model: opus` (it has all tools, MCP included). Its brief must stand
     alone, since it sees none of this conversation. Include:
     - The user's goal in their words, the step 2 answers, and the facts from step 1 (test command, conventions).
     - The file path and model names.
     - "Follow `${CLAUDE_SKILL_DIR}/references/planner-steps.md`, using `${CLAUDE_SKILL_DIR}/references/model-choice.md`
       and `${CLAUDE_SKILL_DIR}/assets/plan.md.template`." Pass the resolved absolute paths, not the variable.
   - The subagent writes the file and returns only the path and a one-line summary per phase.

4. **Check and report**
   - Run `node ${CLAUDE_SKILL_DIR}/scripts/check-plan.mjs <plan-file> --models "<small>,<mid>,<large>"`. On errors,
     send them back to the subagent (SendMessage) or fix them inline; repeat until `errorCount` is 0.
   - Confirm each row in `priciestModelRows` has its reason in the plan.
   - Report the path, one line per phase, task count per model, and large-tier tasks with reasons. Offer to commit
     only the plan file.
