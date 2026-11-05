# Gap closing plan

**Status: all five phases are merged into `main`.** Remaining items are listed under "Open items" in
`docs/shelf-cli-plan.md`. This file is kept as the record of the scope.

Five clubbed phases, run one after another (each starts from the previous branch, because they all touch `tui/rows.mjs`,
`tui/data.mjs`, `tui/app.mjs`, `bin/agentry.mjs` and the README). Conventions: CLAUDE.md and the existing `lib/` and `tui/`
style (plain `.mjs`, stdlib only, factory functions, tabs, `node:test`). Every change is previewed, confirmed with `y`,
has `c` to copy, a CLI twin with `--dry-run`/`--yes`, tests, and a README/help line. No AI attribution in commits.

| Phase | Branch | Scope |
| --- | --- | --- |
| 1 | `feat/gaps-1-backups` | **Backups manager + cross-project cleanup.** `lib/backups.mjs`: list the fix-engine sets and `removed/` skill copies under `backupsDir`, show size and age, `restore` a removed skill (move it back), `prune --older-than <days>|--all`. New **Backups** tab (7) with `x` delete, `r`-style restore (`u`), prune. A setting/flag `--no-backup` for `shelf remove` and a UI confirm line that says whether a copy is kept (default stays "keep"). Cross-project cleanup: `agentry scan --find-skill <name>` lists every project folder under the scan roots that has `.claude/skills/<name>`, and `agentry scan --remove-skill <name> [--dry-run|--yes]` deletes them (reports which are git-tracked). |
| 2 | `feat/gaps-2-hooks-mcp` | **Hooks off/remove + MCP add/edit.** Hooks tab: `space` turns a hook off (settings key edit through `lib/json-edit.mjs` and the fix engine, per scope file; plugin hooks refused with who manages them), `x` removes it, `agentry hook disable|enable|remove`. MCP: `agentry mcp add <name> --command ... | --url ...` (user/project scope via `claude mcp add-json` / `.mcp.json` edit) and an `a` add form in the UI; `E`dit env/args of a user server. Secrets stay masked everywhere. |
| 3 | `feat/gaps-3-scopes-plugins` | **Skill scope moves + plugin install/uninstall.** `agentry shelf promote <skill>` (project folder → `~/.claude/skills`) and `demote` (global → this project), UI keys `P`/`D` removed in favour of clear labels; plugin `install`/`uninstall` through the `claude plugin` CLI with the same preview/confirm path, Plugins tab keys `i` and `x`. |
| 4 | `feat/gaps-4-catalog-rules` | **Catalog beyond skills + rules view.** Catalog lists agents, rules, claude-md-files and MCP configs from the repo with install targets; shows `outdated` for installed skills whose files differ from the cached clone (use `scripts/skill-drift.mjs` logic) with an update action. New read-only **Rules** rows (`~/.claude/rules`, project `CLAUDE.md`) with `e` open and `x` remove. |
| 5 | `feat/gaps-5-ux` | **UX across tabs.** `/` search/filter on every list, multi-select (`m` mark, bulk `space`/`x`), a total of description tokens loaded in this session (header + per scope), help and README refresh, final doc pass. |

Done for every phase: `npm test` green, new tests for lib and TUI paths, README + help text + `docs/shelf-cli-plan.md` log row.
