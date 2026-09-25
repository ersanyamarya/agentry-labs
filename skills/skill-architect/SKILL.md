---
name: skill-architect
description: Create, improve, or review Claude Code skills so they are portable, token-efficient, and spec-compliant, with scripts doing the exact work and the model doing the judgment. Use when the user asks to "create a skill", "build a skill", "write a new skill", "improve this skill", "review/analyze this skill", "make this skill generic", or wants to turn a repeated workflow into a skill.
argument-hint: "[workflow-or-skill-path] [--local|--global|--target <dir>]"
---

# Skill architect

Build or improve a skill in three passes: route each step to code or the model, write the skill, then prove it works on a realistic sample. `scripts/validate.mjs` checks the mechanical spec rules; the model checks portability and design.

1. **Pick the mode**
   - **Create**: the request describes a workflow with no existing skill.
   - **Improve**: the request names an existing skill folder. Skip scaffolding.
   - **Review only**: the request says to analyze or not change anything. Run steps 2 and 6, report findings ranked by impact with time estimates, and stop.

2. **Understand and route the workflow**
   - For Improve or Review, read the skill's `SKILL.md` and every bundled file, and run `node ${CLAUDE_SKILL_DIR}/scripts/validate.mjs <skill-dir>`.
   - Break the workflow into discrete steps. Read `references/mcp-router.md` and assign each step to an MCP, a `.mjs` script, or the model.
   - Script only precise checks. Leave anything a pattern match would get noisy or incomplete to the model.

3. **Resolve the destination (Create only)**
   - Use `--target <dir>` when the current repo is a skills catalog (a top-level `skills/` folder whose subfolders contain `SKILL.md`), and recommend `--target skills`.
   - Otherwise treat "local" or "project" as local scope (`<project>/.claude/skills/`) and "global" or "user" as global scope (`~/.claude/skills/`). Ask when unclear, recommending local.
   - State the destination, then execute `node ${CLAUDE_SKILL_DIR}/scripts/scaffold.mjs <skill-name> [--local|--global|--target <dir>]`.

4. **Write scripts and references**
   - Read `assets/script-mjs.template` before writing a script. Use standard-library imports only, and cap the output.
   - Run each script on real input and check its output before relying on it.
   - Put static material (rule lists, templates, examples, per-framework notes) in `references/` or `assets/`.

5. **Write `SKILL.md`**
   - Read `references/agentskills-spec.md` and `assets/SKILL.md.template`.
   - Write imperative steps, invoke scripts through `${CLAUDE_SKILL_DIR}`, and state the step at which to read each reference.
   - Remove anything specific to the project the workflow came from (framework files, URLs, runtimes, one team's thresholds), and detect those facts at run time instead.

6. **Validate**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/validate.mjs <skill-dir>` and fix every FAIL. Fix each WARN or state why it stays.
   - Read the skill once more against the portability section of `references/agentskills-spec.md`, which the script cannot check.

7. **Test on a realistic sample (Create and Improve)**
   - Build one or two inputs that resemble real use, and run the skill's workflow on them step by step.
   - Record what the scripts missed or flagged wrongly and fix it, then re-run until the output is right. Show the user the before and after.
   - Write the tested prompts and expected behavior to `evals/evals.json`.

8. **Report**
   - List what changed, the validator result, what the test showed, and anything left unverified.
   - Confirm the skill folder has no `README.md` and is in the stated destination.
