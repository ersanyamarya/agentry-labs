---
name: agentry
description: Answer "what loads in this project", slow-session, duplicate MCP or skill questions from the agentry CLI (status, doctor, scan --json) instead of reading config files; fixes go through agentry fix.
---

# Agentry setup check

The `agentry` CLI reports what a Claude session loads (skills, MCP servers, hooks, plugins), with token estimates and findings. Run it instead of opening `~/.claude.json`, `settings.json`, `.mcp.json` or plugin folders by hand.

1. **Check it is installed**
   - Run `command -v agentry`. If missing, tell the user to run `curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh | bash -s -- install --only agentry --yes`, and stop.

2. **Pick the command**
   - What loads here, which skills or MCP servers are on, token cost: `agentry status --json`.
   - Slow or bloated session, duplicates, broken references, stale names: `agentry doctor --json` (exit 1 means at least one error finding).
   - Questions about several repos or a workspace: `agentry scan <root> --json`; add `--only-problems` for a short list.
   - Questions about GitHub Copilot (is it signed in, what it loads, what is shared, is this repo trusted): `agentry copilot status --json`.
   - Pass a path as the last argument to inspect another folder.

3. **Read the JSON, do not paste it**
   - `status`: `skills.items[]` (`name`, `scope`, `state`, `tokens`), `mcp.servers[]` (`name`, `scope`, `source`), `hooks.items[]`, `plugins.items[]`, `tokens.measured` (skill descriptions only; `tokens.notMeasured` lists what is not counted, such as MCP tool lists).
   - `doctor`: `findings[]` with `id`, `severity`, `message`, `file`, `line`, `fix` (advice text).
   - `scan`: `global` (user-level findings, shown once), `repos[]` (`path`, `counts`, `tokens`, `findings`), `totals`.
   - `status`: `copilot` is `null` when Copilot is not installed; otherwise `copilot.signedIn`, `copilot.shared` (names agentry shared with Copilot, per kind) and what Copilot loads.
   - `copilot status --json`: `signedIn`, `trusted`, `items[]` (each with its `state`: `shared`, `notShared`, `other`, `setup` or `repoWins`).
   - Answer with counts, the biggest costs and the findings that matter, each with its source file. Never print values from `env` or `headers`; the CLI masks them, keep them masked.

4. **Fixing**
   - Offer `agentry fix` (preview, backup, confirm, write, re-check) or `agentry scan --fix`. Run it only after the user agrees, and let it ask its own confirmation; add `--yes` only if the user asks.
   - `agentry fix --undo` restores the last backup.
   - Copilot sharing is a choice: `agentry copilot share|unshare <name>` (all projects) and `agentry copilot trust|untrust` (this repo) only after the user agrees to that item. Preview first with `--dry-run`, show the user the output, and add `--yes` only if the user asks.
   - For findings the CLI reports as having no fix, explain the finding and the `fix` text; do not edit settings JSON by hand to work around it.
   - Loading library skills: `agentry shelf on|off <bundle-or-skill>`.
