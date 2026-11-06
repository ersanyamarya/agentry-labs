# Changelog

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
