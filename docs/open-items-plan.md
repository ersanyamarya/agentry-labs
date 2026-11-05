# Open items plan

Closes the "Open items" left in `docs/shelf-cli-plan.md` in one phase: the two cleanup gaps in `scan` and `backups`, the
catalog gaps (remove an agent, update CLAUDE.md and MCP items, restore the `updated/` copies), the MDM check in the
plugin toggle, and a probe of the behaviours that were only assumed. When it is done, "Open items" in the shelf plan is
empty or lists only what was checked and found impossible.

## How to use this plan

- Work one phase per coordinator session. This plan has a single phase, so it ships as one branch.
- Start a branch `feat/open-items`, tick a task's box (`[ ]` → `[x]`) in this file in the same commit that finishes it,
  and merge when the phase's "Done when" checks pass.
- The **Model** column names the cheapest model that does the task well: Haiku 5.5 for mechanical work, Sonnet 5.5 for
  normal implementation. No task needs Opus 5.5: every write goes through the existing fix engine, which previews,
  backs up and can undo, so a mistake is caught in review.
- **Run each task in its own sub-session on that model, never in a subagent.** The coordinator starts a separate
  Claude Code session per task (in the desktop app, `start_session` with `model` set; in a terminal,
  `claude --model <id>` in a new tab) on the phase branch, with a brief naming the task row, files and "Done when"
  check. A subagent can't be steered or reviewed on its own and doesn't reliably run on the chosen model. The
  coordinator reviews each sub-session's diff, runs `npm test`, and only then ticks the box. Tasks that touch the same
  files run one after another, not in parallel.
- **Batch small tasks.** Consecutive tasks with the same model that touch nearby files go into one sub-session. A
  sub-session's startup and orientation cost more than a one-file task, so never start one per tiny row.
- **The coordinator runs on Sonnet 5.5 and never switches model.** It only writes briefs, reviews diffs and runs tests.
  The prompt cache is per model: switching a session's model re-sends its whole history uncached on the new one, so
  models change by starting a sub-session, not by switching inside a session.
- Ask before going beyond a phase's tasks. Record decisions and surprises in "Decisions log" at the bottom.

## Ground rules

- **Runtime:** Node 22+ from mise, plain `.mjs`, standard library plus Ink/React for `tui/` only, factory functions,
  tabs. Follow CLAUDE.md "Implementation principles": reuse `lib/` before writing anything new.
- **Layout:** logic in `lib/*.mjs`, CLI routing in `bin/agentry.mjs`, UI in `tui/` (calls `lib/` only through
  `tui/data.mjs`). A new key shows in the footer only on rows it works on, and is added to `tui/components/help.mjs`.
- **Testing:** `npm test` (`node --test`). Fixtures build a temp home and repo with `AGENTRY_HOME` and
  `CLAUDE_CONFIG_DIR`; tests never touch the real `~/.claude`. `claude` is faked with `test/helpers/fake-claude.mjs`.
  `test/tui-widths.test.mjs` must stay green at 80, 100 and 130 columns.
- **Safety:** every write previews, asks for `y` (or `--yes`), backs up through `lib/backups.mjs` or the fix engine, and
  has `--dry-run` and a UI preview. Secrets stay masked in every preview and never appear in a backup manifest.
- **Docs:** each shipped command gets a README line and help text; the README cover is regenerated only if a skill,
  agent, rule or CLAUDE.md file is added or removed (none is planned here).
- **Facts to verify:** how macOS MDM and server-managed settings are exposed to Claude Code, and the unverified
  behaviours in "Open items", are checked against the Claude Code docs through Context7 and a probe, and recorded in
  `docs/claude-config-sources.md`.

## Phase 1: Close the open items

**Value:** the remaining "can't do that yet" cases from the shelf plan work: a skill can be removed from every place it
lives, an installed catalog agent can be removed, any catalog item can be updated, `updated/` copies can be restored,
and the plugin toggle refuses plugins forced by MDM.
**Done when:** `npm test` passes; in a fixture home `agentry scan --find-skill <name> --global` lists the global copy and
`--remove-skill` deletes it after `y`; `agentry backups prune --older-than 30 --kind removed` leaves fix sets alone;
`agentry catalog remove agent/<name>` removes an installed agent with a restorable copy; `agentry catalog update` works
for a CLAUDE.md file and an MCP server and shows a diff; `agentry backups restore updated/<time>/<label>` puts the old
copy back; `agentry plugin disable` on a plugin named by a fixture MDM plist exits 1 and names the source; the shelf
plan's "Open items" lists only what the probe could not settle.

| Done | Task | Model |
|---|---|---|
| [x] | `scan --find-skill` and `--remove-skill` also cover `~/.claude/skills/<name>` when `--global` is passed (reuse the git-tracked and shelf-link checks, global copies are removed with a copy kept under `removed/` unless `--no-backup`); extend `test/scan-*.test.mjs`. | Sonnet 5.5 |
| [x] | `backups prune --kind fix` / `removed` / `updated` filter in `lib/backups.mjs` and `bin/agentry.mjs`, combined with `--older-than`; the Backups tab `d` key keeps its 30-day default over all kinds; tests for each kind. | Sonnet 5.5 |
| [x] | List `updated/<time>/<label>` copies in `lib/backups.mjs` (id, size, age, original path in `meta.json`) and make `restore` and `delete` handle them like `removed/` entries; extend `lib/catalog.mjs` `update` to write that `meta.json`; tests for the round trip. | Sonnet 5.5 |
| [ ] | `catalog remove agent/<name>` (user `~/.claude/agents` or `--project`): keeps a copy under `removed/`, previews, `y`; Catalog tab `x` works on installed agents and rules (today skills only); tests and a TUI test. | Sonnet 5.5 |
| [ ] | `catalog update` for CLAUDE.md files and MCP servers: CLAUDE.md compares the project copy with the catalog copy and saves the old one under `updated/`; MCP compares the catalog entry with the user or project entry through `createMcpEdit().set` so masking, backup and undo stay; Catalog tab `u` shows them as outdated; tests. | Sonnet 5.5 |
| [ ] | Read macOS MDM managed settings (`com.anthropic.claudecode` through `defaults read`, injectable `readDefaults`) in `lib/plugin-toggle.mjs` next to the managed-settings files, and refuse the toggle naming the source; first confirm the key names and precedence with Context7 and record them in `docs/claude-config-sources.md`; fixture test with a fake `defaults`. Server-managed settings stay documented as unreadable offline. | Sonnet 5.5 |
| [ ] | Probe the unverified behaviours with throwaway folders and a throwaway `CLAUDE_CONFIG_DIR` (worktree and subfolder `projectPath` matching, `defaultEnabled` default, hooks of a disabled plugin, bare-map plugin `.mcp.json`); write each result into `docs/claude-config-sources.md`; fix a reader only where the probe disagrees with it, with a test. Nothing is run against the real home. | Sonnet 5.5 |
| [ ] | Docs: README command list and `agentry ui` keys, `tui/components/help.mjs` `KEYS` matched to the README table, CLAUDE.md tree if a file was added, empty the shelf plan's "Open items" down to what remains, one "Decisions log" row here per surprise. | Haiku 5.5 |

## Out of scope

- Reading server-managed settings (no local file or offline source).
- Windows support and the `curl \| bash` clone path of `install.sh`.
- Editing the content of catalog items, or a per-item merge for `catalog update` (it overwrites after a preview, as today).
- New tabs, new skills, agents or rules.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-05 | One phase for all remaining gaps, on request. Tasks are the code items from "Open items" in `docs/shelf-cli-plan.md` plus a probe of the assumed behaviours. No Opus tasks: all writes use the existing fix engine and backup paths. |
