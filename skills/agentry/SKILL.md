---
name: agentry
description: Answer "what loads in this project", slow-session, duplicate MCP or skill questions from the agentry CLI (status, doctor, scan --json) instead of reading config files; fixes go through agentry fix.
---

# Agentry setup check

The `agentry` CLI reports what a Claude session loads (skills, MCP servers, hooks, plugins), with token estimates and findings. Run it instead of opening `~/.claude.json`, `settings.json`, `.mcp.json` or plugin folders by hand.

1. **Check it is installed**
   - Run `command -v agentry`. If missing, tell the user to run `cd cli && npm install && npm link` in their agentry-labs checkout, or `scripts/install.sh --global`, and stop.

2. **Pick the command**
   - What loads here, which skills or MCP servers are on, token cost: `agentry status --json`.
   - Slow or bloated session, duplicates, broken references, stale names: `agentry doctor --json` (exit 1 means at least one error finding).
   - Questions about several repos or a workspace: `agentry scan <root> --json`; add `--only-problems` for a short list.
   - Pass a path as the last argument to inspect another folder.

3. **Read the JSON, do not paste it**
   - `status`: `skills.items[]` (`name`, `scope`, `state`, `tokens`), `mcp.servers[]` (`name`, `scope`, `source`), `hooks.items[]`, `plugins.items[]`, `tokens.measured` (skill descriptions only; `tokens.notMeasured` lists what is not counted, such as MCP tool lists).
   - `doctor`: `findings[]` with `id`, `severity`, `message`, `file`, `line`, `fix` (advice text).
   - `scan`: `global` (user-level findings, shown once), `repos[]` (`path`, `counts`, `tokens`, `findings`), `totals`.
   - Answer with counts, the biggest costs and the findings that matter, each with its source file. Never print values from `env` or `headers`; the CLI masks them, keep them masked.

4. **Fixing**
   - Offer `agentry fix` (preview, backup, confirm, write, re-check) or `agentry scan --fix`. Run it only after the user agrees, and let it ask its own confirmation; add `--yes` only if the user asks.
   - `agentry fix --undo` restores the last backup.
   - For findings the CLI reports as having no fix, explain the finding and the `fix` text; do not edit settings JSON by hand to work around it.
   - Turning shelf skills on or off: `agentry shelf on|off <group-or-skill>`.
