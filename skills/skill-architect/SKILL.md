---
name: skill-architect
description: Evaluates workflows and builds optimized, token-efficient Claude Code skills. Use when the user asks to "create a skill", "generate a skill", "build a meta-skill", or "write a new skill".
---

Analyze the requested workflow to build a highly optimized, agentskills.io-compliant skill. Aggressively outsource logic to external Model Context Protocol (MCP) servers or local `.mjs`/Bash scripts to preserve the LLM context window.

1. **Analyze and Route Workflow Steps:**
   - Break down the requested workflow into discrete steps.
   - Read `references/mcp-router.md` to determine which steps require an MCP, which require a local `.mjs` script, and which require LLM reasoning.

2. **Scaffold the Skill Directory:**
   - Determine a concise, kebab-case name for the new skill, such as `github-pr-reviewer`.
   - Execute `scripts/scaffold.mjs` with the chosen skill name from the directory that should contain the generated skill. Let the script create `SKILL.md`, `scripts/`, `references/`, and `assets/` safely.

3. **Draft Scripts and Assets When Applicable:**
   - Read `assets/script-mjs.template` when the routing analysis identifies a need for a local script.
   - Write the deterministic logic into a new `.mjs` file in the generated skill's `scripts/` directory. Condense output to `stdout`.
   - Write static context, such as brand guidelines, into the generated skill's `references/` directory.

4. **Finalize the Generated `SKILL.md`:**
   - Read `references/agentskills-spec.md` to ensure strict compliance.
   - Read `assets/SKILL.md.template` for the frontmatter structure.
   - Replace the scaffolded placeholders and write the final instructions using imperative form, such as "Read the file..." rather than "You should read...".
   - Implement progressive disclosure: specify when to read reference files or execute scripts instead of loading everything upfront.

5. **Review the Skill:**
   - Validate that code and MCPs perform the heavy lifting.
   - Reserve LLM instructions for decision-making and creative synthesis.
   - Confirm that the generated skill contains no `README.md`.
