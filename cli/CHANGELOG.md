# Changelog

## 0.5.0

- Status: `agentry status` (and `--json`) gains a Copilot block with what GitHub Copilot loads for the folder: skills, instructions, hooks, MCP servers (secrets masked), agents, whether the folder is trusted, and `includeCoAuthoredBy`. `copilot` is `null` when `~/.copilot` is missing; the rest of the output is unchanged.
- Doctor: Copilot rules, silent without `~/.copilot`: `copilot-broken-skill-link`, `copilot-coauthor` (the Co-authored-by trailer is still on), `copilot-context7-local` (the old `bunx` context7 entry) and `copilot-dup-hook` (a hook the user and a `.github/hooks` file both run) are fixed by `agentry fix`, with a backup. `copilot-mcp-secret`, `copilot-untrusted-hooks` and `copilot-cannot-see` are advice only. No fix ever removes a hook from a `.claude` settings file.
- Doctor: `trail-old-index` (info, advice only) notes an untracked `graft/INDEX.md` that the trail autobuild hook migrates.
- Internal: the test suite caches git answers in the doctor and fix tests, skips the build when `dist` is current, and waits up to 30 seconds for a TUI frame (`AGENTRY_TEST_FRAME_WAIT_MS`); `npm test` uses 5 workers.

## 0.4.0

- Agents: a new Agents section in the terminal UI (key `6`) and the web UI lists the agents installed for you (`~/.claude/agents`) and this project (`.claude/agents`) with model, tools and listing cost, and `agentry agents list [--json]` prints the same. Read-only; add or remove agents from the Catalog. The Catalog, Doctor and Backups sections move to keys `7`, `8` and `9`. Agents that plugins ship are not listed yet.

## 0.3.1

- Catalog: MCP servers now show the `general` bundle instead of `global`. A bundle is a topic, never a scope, and the agentry-labs catalog now has five bundles: `general`, `web`, `flutter`, `flutter-assets` and `mongodb`.

## 0.3.0

- Doctor: `dup-hook-scope` finds a hook that a project or local settings file repeats from your user settings (for example a project copy of trail's graft-hooks.cjs), so it runs twice; `agentry fix` removes the project copy, with a backup.
- Doctor: `stale-mcp-permission` finds `mcp__trail` and `mcp__graft` permissions in project or local settings when no such MCP server is configured (trail is a command now); `agentry fix` removes those entries, with a backup.
- Doctor: `trail-hooks-missing` (info, advice only) says so when `trail` is on PATH but your user settings have none of its hooks; `trail init --agents claude` writes them.

## 0.2.0

- Web UI: `agentry ui` serves a local web app (TanStack Start, shadcn components) on 127.0.0.1 behind a one-time token, with all eight sections (Skills, MCP, Hooks, Plugins, Rules, Catalog, Doctor, Backups). Writes use the same backup-first functions as the terminal UI; previewed changes wait for Apply. `--port` and `--no-open` are options. The package ships the built app (about 3 MB more).
- Web UI Skills: shelf groups show as chips (click to filter, switch to turn a whole group on or off) and in a Group column; rows have checkboxes (`m` marks, `a` marks all, `esc` clears) and a bulk bar for Turn on, Turn off, Shelve and Remove. Bulk removals still keep a backup of each skill.
- Doctor: `graft` is no longer reported as a stale name for `trail`. Current trail still ships files and hook matchers under the old name, so the fix would have broken working hooks. The rename list is empty; `AGENTRY_RENAMES` (JSON) overrides it for tests.
- **Breaking:** `agentry ui` now serves the web UI (127.0.0.1, behind a one-time token; `--port`, `--no-open`). The terminal UI moved to `agentry tui`; a bare `agentry` in a terminal still opens it.
- Internal: the CLI is split into npm workspaces (`packages/core` for the command modules, `packages/tui` for the terminal UI) and bundled with esbuild; `npm run pack:check` installs the packed tarball and runs it. No behaviour change.
- Terminal UI sidebar: the top tabs are replaced by a left rail with three groups (Library, Discover, Health) holding the section counts, the project path, tokens and problems; `tab` moves the keys between the rail and the list (`↑`/`↓` pick a section on the rail), and the `1`-`8` keys follow the new order: Skills, MCP, Hooks, Plugins, Rules, Catalog, Doctor, Backups. The rail is 22 columns from 90, 16 from 70, and a one-line header below that.
- Terminal UI redesign: one header line (path, tokens, problems), tabs as a word and a count with no icons, one state mark per row (the word moves to the details pane and to a `STATE` column under `NO_COLOR`), a footer with only the selected row's keys plus `1-8 tab   ? help`, no colour legend or rules between sections.
- Skills: Project and Global columns hold a single mark; Doctor and Catalog rows carry a kind glyph; Backups has a header row.
- Previews end in `Apply?  y yes   n no` with a "nothing is written" note; a failed apply starts with `✖ <action> failed` under a red notification.
- 80 columns and `NO_COLOR`: bracketed active tab, `Doctor N err`, `↓ N more` instead of a cursor counter, stacked details that pair short lines.
- Tests run on vitest (`npm test`, `npm run test:watch`); the build no longer emits `dist/test`.

## 0.1.0

Initial release.

- Shows what a Claude Code session loads: skills, MCP servers, hooks, plugins, and CLAUDE.md and rule files, with description-token costs (`status`, `doctor`, `rules list`).
- Skill shelf: keep skills off by default and switch groups on or off per project or globally (`shelf on/off/shelve/promote/demote/remove`).
- Toggles and edits MCP servers, hooks and plugins; every file it changes is backed up first, with `undo` and `backups list/restore/prune/delete`.
- `scan` finds a skill across repos and worktrees and can remove it.
- `catalog` installs skills, agents, rules, CLAUDE.md files and MCP servers from the agentry-labs repo, with `update` and `remove`.
- `fix` repairs known config problems from a rename table, with dry-run previews.
- Terminal UI with `agentry ui`, built with Ink.
- Written in strict TypeScript (ESM); needs Node.js 22 or newer.
