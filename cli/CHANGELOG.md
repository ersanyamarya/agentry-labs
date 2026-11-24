# Changelog

## 0.7.1

- Web UI: the "All projects / This project" switch shows only on Skills, the one screen it changes. The Hooks scope column says "All projects" and "This project" like the other screens. MCP and other list tables stay inside their box, so Scope, State and Copilot are no longer hidden. A row Copilot cannot share names its state ("By setup", "Repo wins") instead of "-".
- Terminal UI: the footer hint for Copilot in this repo reads "T stop Copilot" or "T use Copilot", an action instead of a state.
- No command, flag or JSON change.

## 0.7.0

- Copilot sharing: `agentry copilot` shares Claude user skills, agents, rules and MCP servers with GitHub Copilot CLI, one item at a time, for all projects. `status`, `share`, `unshare`, `trust` and `untrust` take `--dry-run`, `--yes`, `--json` and `--kind`. Every write shows a preview first and a backup is kept; `agentry fix --undo` reverts it. Exit codes: 0 done, 1 refused or failed, 2 usage.
- Trust per repo: `agentry copilot trust` (and `untrust`) marks a repo as trusted in Copilot, so Copilot runs that repo's hooks and MCP servers. It changes only Copilot's `trustedFolders`.
- Terminal UI and web UI: when Copilot is signed in, a Copilot column on Skills, MCP, Agents and Rules shares or unshares a row (`C` in the terminal UI, the checkbox on the web), and `T` ("Copilot in this repo") turns trust on or off. The web sidebar has the same switch. Without a signed-in Copilot, none of this shows.
- Status: `agentry status --json` adds `copilot.signedIn` and `copilot.shared`. `agentry copilot status --json` reports `signedIn`, `trusted` and each item's state.
- Doctor: the Copilot fix hints name `agentry copilot share <name>` and `agentry copilot trust`. The finding messages are unchanged.
- Setup: the `copilot` part also wires context-mode for copilot-cli when both CLIs exist. Node 24.15 or newer is required only for context-mode.
- Nothing changes unless you pick it: setup, status and doctor never share or trust anything. No breaking change: existing commands, flags and JSON fields are unchanged, and the new fields are additive.

## 0.6.0

- Words: the terminal UI, the web UI and the command help say the same thing the same way. **Library** (was shelf), **Bundle** (was group, and the catalog's bundle is the same thing), **this project** and **all projects** (was project, global and user scope), **loaded** and **not loaded** for skills (MCP servers, hooks and plugins keep on and off), **added** in the Catalog (plugins stay installed), and "move to the library" and "move out of the library" (was shelve and unshelve). The sidebar section that held Skills, MCP, Hooks, Plugins, Rules and Agents is now **Setup**.
- Keys: each key means one thing on every tab. `*` marks a row and `esc` clears the marks (was `m` and `M`). `m` opens the Skills move menu with only the moves that apply (it replaces `s`, `a`, `o` and the unshelve `u` on Skills). `a` adds on Catalog, Plugins and MCP (Catalog agents and MCP servers ask all projects or this project; it replaces `i` and `o`). `x` removes with a copy kept, `X` deletes with no copy, also on Backups. `u` is named per tab: undo last fix, restore, update. A retired key shows one notice naming the new key. The web UI follows the same keys, and `g` now toggles a library skill for all projects there too.
- Help: `?` shows only the current tab's keys, in the terminal UI and the web UI. A row that cannot be toggled says why in the status line and the details before any key is pressed.
- Messages: all user-facing text of both UIs and the core previews lives in `@agentry/core/messages` (a `terms` glossary and typed messages, English only), and a guard test fails when new hard-coded text appears in the UI packages. This also makes a second language a new file, not a rewrite.
- Compatibility: no command, flag, folder (`~/.claude/skill-shelf`) or JSON change except one added field: `agentry shelf status --json` links carry `bundle` next to `group`. `agentry --help` describes the shelf as a library of bundles.
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
