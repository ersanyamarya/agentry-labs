# Skill specification rules

`scripts/validate.mjs` checks the rules marked (checked). Review the rest by reading.

## Structure

- Use a kebab-case root folder, with `name` in the frontmatter matching it exactly. (checked)
- Never add a `README.md` inside a skill folder. Put all instructions in `SKILL.md`. (checked)
- Put scripts in `scripts/`, static reference material in `references/`, and templates or starter files in `assets/`. Reference every bundled file from `SKILL.md`, and never reference a bundled file that does not exist. (checked)
- Add `evals/evals.json` with 2 to 4 realistic prompts and the expected behavior for each: `{ "skill_name", "evals": [{ "id", "prompt", "expected_output", "files" }] }`. (checked)

## Frontmatter

- `description`: say what the skill does, then give trigger phrases ("Use when the user asks to ..."). Keep it within 1024 characters. (checked)
- `argument-hint`: show the expected input for autocomplete, such as `"[issue-number]"` or `"[file] [--detect]"`. (checked)

## Instructions

- Write steps in imperative form ("Read the file"), never second person ("You should read"). (checked)
- Keep `SKILL.md` short, around 150 lines at most. Move static rules, long examples, and templates into `references/` or `assets/`, and state the step at which to read each one. (checked)
- Run bundled scripts through `${CLAUDE_SKILL_DIR}`, such as `node ${CLAUDE_SKILL_DIR}/scripts/scan.mjs`, so the skill works whether it is installed in a project or globally. Never hardcode `.claude/skills/<name>/`. (checked)
- Write Node `.mjs` scripts with standard-library imports only. (checked for file type and syntax)

## Portability (review by reading)

- Keep the skill generic. Remove anything copied from the project it was first written in: framework-specific file names presented as universal, one site's URL, a specific package manager or runtime, "this repo's CLAUDE.md" rules, hardcoded thresholds that belong to one team.
- Detect project facts at run time (package manager from lockfiles, framework from dependencies, standards from `CLAUDE.md` / `AGENTS.md`) instead of assuming them.
- Check required tools before using them, and ask before installing anything.
- Ask before creating files in the user's repo that the user did not request. Write large intermediate output (reports, JSON dumps) to `${TMPDIR:-/tmp}` so it never gets committed.
