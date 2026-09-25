---
name: run-fallow
description: Run the `fallow` CLI on any JavaScript/TypeScript project to find dead code, unused dependencies, duplication, complexity hotspots, and security candidates, then report condensed, verified findings. Also keeps the project's fallow config (entry points, ignorePatterns, thresholds) accurate when findings are noise from a missing or stale config. Use before refactoring or opening a PR, or when the user asks to "check for dead code", "find unused exports/deps", "find duplication", "check complexity/hotspots", "audit changed files", "run fallow", wants a codebase health report, or suspects a fallow finding is a false positive.
argument-hint: "[dead-code|dupes|health|audit|security] [path or git ref]"
---

# Run Fallow

Analyze a JS/TS codebase with `fallow` (docs: https://www.fallow.tools/docs/). Fallow is read-only unless `fallow fix` runs. Scripts live in this skill's directory (`${CLAUDE_SKILL_DIR}`); they condense fallow's large JSON so raw output never enters context.

1. **Check the project**
   - Execute `node ${CLAUDE_SKILL_DIR}/scripts/preflight.mjs [project-root]`.
   - Stop and tell the user if `fallowVersion` is null. Offer `npx fallow` or a global install; do not install without asking.
   - Relay every entry in `warnings`. A missing `node_modules` makes dependency and framework-plugin findings unreliable; offer to run the install before continuing.
   - Treat `statedStandards` as the project's own bar (for example a max cyclomatic complexity). When it is empty, use fallow's defaults and say so. Never invent a standard.

2. **Pick the command**
   - Map the argument or request to a command. Read `references/command-map.md` when the intent goes beyond a full sweep, `dead-code`, `dupes`, `health`, or `audit --base <ref>`.
   - Scope small edits with `--changed-since <ref>` or `fallow inspect --file <path>` instead of a full-repo sweep.
   - Pass `--max-cyclomatic <N>` to `health` when `statedStandards` gives a limit.

3. **Run and condense**
   - Write JSON to a temp file, then summarize it:
     ```bash
     out="${TMPDIR:-/tmp}/fallow-$$.json"
     fallow <command> --format json > "$out" 2>/dev/null
     node ${CLAUDE_SKILL_DIR}/scripts/summarize.mjs "$out" --top 10
     ```
   - Use the summary's `totals` and `findings[*].top` for reasoning. Query the raw file with `jq` only for a specific item the summary truncated.
   - Note that `fallow audit` exits 1 on a fail verdict. Read the verdict from the output rather than treating the exit code as a crash.

4. **Verify before reporting**
   - Read `references/false-positives-and-config.md` when an unused-file or unused-export finding looks wrong, or when `diagnostics` mentions missing entry points or config.
   - Prove deletions with `fallow dead-code --trace <file>:<export>` or `--trace-dependency <name>` before recommending them.
   - Treat `fallow security` output as unverified candidates. Read the source for each one before calling it a vulnerability.

5. **Fix config drift when needed**
   - Follow the editing steps in `references/false-positives-and-config.md`. Ask before creating a new config file; edit an existing tracked config like any other source file.
   - Re-run the command after editing and confirm only the false positive disappeared.

6. **Report**
   - Lead with counts per category, then the highest-severity findings with `file:line`.
   - Separate verified findings from suspected false positives, and state which thresholds applied (project-stated or fallow default).
   - For a refactor or PR check, run `fallow guard <files>` before editing and `fallow audit --base <base-branch> --format json` after, to confirm the change adds no regressions.

## Don't

- Run `fallow fix` without explicit user confirmation. It mutates files.
- Paste raw fallow JSON into a response or plan.
- Claim a project standard or config exists without seeing it in `preflight.mjs` output.
