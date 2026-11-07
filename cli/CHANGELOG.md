# Changelog

## Unreleased

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
