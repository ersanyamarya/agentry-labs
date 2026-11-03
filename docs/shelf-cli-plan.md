# agentry CLI plan

`scripts/shelf.mjs` grows into `agentry`, a command that shows and manages everything a Claude Code session loads:
skills, shelf groups, MCP servers, hooks and plugins, for one project or every repo under `~/ws`. It starts as a CLI
with JSON output and ends with an Ink terminal UI built on the same functions.

## How to use this plan

- Work one phase per session, in order. Each phase ships something usable and testable on its own.
- Start a branch per phase (`agentry/phase-<n>`), tick a task's box (`[ ]` → `[x]`) in this file in the same commit
  that finishes it, and merge when the phase's "Done when" checks pass.
- The **Model** column names the cheapest Claude model that does the task well: Haiku 5.5 for mechanical work,
  Sonnet 5.5 for normal implementation, Opus 5.5 only for the three tasks where a mistake is costly and hard to
  spot: the config-sources spec (facts must be verified, everything builds on it), the MCP reader (parent-folder and
  desktop-app sources, secret masking) and the fix engine (writes across many repos).
- **Run each task in its own sub-session on that model, never in a subagent.** The session running a phase is the
  coordinator: for each task it starts a separate Claude Code session (in the desktop app, `start_session` with
  `model` set to the task's model, on the phase branch) with a brief naming the task row, files and "Done when"
  check. It does not use the Agent tool for tasks, because a subagent can't be steered or reviewed on its own and
  doesn't reliably run on the chosen model. The coordinator reviews each sub-session's diff, runs `npm test`, and
  only then ticks the box. Tasks in one phase that touch the same files run one after another, not in parallel.
- **Batch small tasks.** Consecutive tasks with the same model that touch nearby files go into one sub-session (for
  example Phase 0's Haiku rows, or Phase 1's `off --all`, `--dry-run` and README rows). A sub-session's startup and
  orientation cost more than a one-file task, so never start one per tiny row.
- **The coordinator runs on Sonnet 5.5 and never switches model.** It only writes briefs, reviews diffs and runs
  tests. The prompt cache is per model: switching a session's model re-sends its whole history uncached on the new
  one, so models change by starting a sub-session, not by switching inside a session. Starting same-model
  sub-sessions back to back also gives the shared setup prefix the best chance of a cache hit.
- Ask before going beyond a phase's tasks. Record decisions and surprises in "Decisions log" at the bottom.

## Ground rules

- **Runtime:** Node from mise (26.x here). CLI phases use only the standard library: `node:util` `parseArgs` for
  arguments, `node:test` and `node:assert` for tests. Ink (and React) arrive in Phase 6 and are imported lazily, so
  `agentry --help` never loads them.
- **Layout:** `bin/agentry.mjs` (entry and command router) → `lib/*.mjs` (one module per concern: `paths`, `shelf`,
  `inventory`, `doctor`, `scan`, `fix`, `tokens`, `output`) → `tui/` (Phase 6). Factory functions, no classes, tabs,
  dependency-free plain `.mjs` like the existing scripts.
- **Testable paths:** every path resolves through `lib/paths.mjs`, which honours `CLAUDE_CONFIG_DIR` and an
  `AGENTRY_HOME` override. Tests build fixture trees in a temp dir and never touch the real `~/.claude`.
- **Output:** human tables by default, `--json` on every read command with a stable shape, exit code `1` when
  `doctor` finds errors.
- **Safety:** read-only until Phase 5. Every write previews first, backs the file up under
  `~/.claude/backups/agentry/<timestamp>/`, and never prints secrets (API keys in MCP headers or env are masked).
- **Config facts change:** before implementing a reader for a Claude Code config file, confirm its current shape and
  precedence with Context7 (Claude Code docs) and note the source in the Decisions log.

## Phase 0: Foundation

**Value:** `agentry` runs from any folder and does everything `shelf.mjs` does today, with real help.
**Done when:** `agentry --help`, `agentry shelf list`, `agentry shelf on|off <group>` work from another repo;
`npm test` passes; `node scripts/shelf.mjs list` still works.

| Done | Task | Model |
|---|---|---|
| [x] | Add a root `package.json`: `"type": "module"`, `"bin": { "agentry": "bin/agentry.mjs" }`, `engines.node`, `"test": "node --test"`, no dependencies. | Haiku 5.5 |
| [x] | Create `bin/agentry.mjs`: `parseArgs` router with subcommands, `help`/`--help`/`-h`/no arguments print usage with examples, unknown commands print an error plus usage and exit `2`, `--version` reads `package.json`. | Sonnet 5.5 |
| [x] | Create `lib/paths.mjs` (config dir, shelf dir, project root via `git rev-parse --show-toplevel`, `CLAUDE_CONFIG_DIR` and `AGENTRY_HOME` overrides). | Sonnet 5.5 |
| [x] | Move `shelf.mjs` logic into `lib/shelf.mjs` unchanged in behaviour; expose it as `agentry shelf list`, `on` and `off`. | Sonnet 5.5 |
| [x] | Turn `scripts/shelf.mjs` into a three-line wrapper that calls `lib/shelf.mjs`, so the documented command keeps working. | Haiku 5.5 |
| [x] | Add a test helper that builds a fixture `~/.claude` and git repo in a temp dir; cover today's `list`, `on`, `off` behaviour. | Sonnet 5.5 |
| [x] | Document setup in the README (`npm link` from the checkout, or `npm install -g <path>`), add `bin/`, `lib/`, `docs/` to "Project layout" and the CLAUDE.md tree. | Haiku 5.5 |

## Phase 1: Shelf that fits daily use

**Value:** turn on exactly the skills a task needs, in any repo including worktrees, and move skills on and off the
shelf without hand-moving folders.
**Done when:** every command below works against a fixture and against the real shelf (audit, design, dev-tools,
flutter-assets, video, web-audit) without changing which groups are on; tests cover each command and the worktree case.

| Done | Task | Model |
|---|---|---|
| [x] | Fix the worktree bug: resolve the exclude file with `git rev-parse --git-path info/exclude` (in a worktree `.git` is a file). Add a test that runs `shelf on` inside a real temporary worktree. | Sonnet 5.5 |
| [x] | Accept several targets per call, each a group (`video`), `group/skill` (`video/ffmpeg-install`) or a bare skill name when unique across groups; ambiguous names list the matches and exit `2`. | Sonnet 5.5 |
| [x] | `agentry shelf status`: what is on in this project and globally, per skill, plus broken links (shelved skill moved or deleted). `--json`. | Sonnet 5.5 |
| [x] | `agentry shelf off --all [--global]`: remove every shelf link in the target and clean `.git/info/exclude`. | Haiku 5.5 |
| [x] | `agentry shelf shelve <skill> <group>` and `unshelve <skill>`: move a folder between `~/.claude/skills` and the shelf; refuse to overwrite; refuse while the skill is linked anywhere `status` can see. | Sonnet 5.5 |
| [x] | Create `lib/tokens.mjs` (read `SKILL.md` frontmatter `description`, estimate tokens as characters ÷ 4) and show the per-group cost in `shelf list`. | Haiku 5.5 |
| [x] | `--dry-run` on every shelf write command, printing the links and exclude lines it would change. | Haiku 5.5 |
| [x] | Update the README "Skill shelf" section with the new commands and examples. | Haiku 5.5 |

## Phase 2: Inventory of what a session loads

**Value:** one command answers "what does Claude load in this project, from where, and what does it cost", which
took a whole session of manual digging before this tool existed.
**Done when:** `agentry status` in `~/ws/immich-photo-cleaner` lists the same skills, MCP servers, hooks and plugins a
fresh Claude Code session there reports, each with its source file; `--json` validates against a test schema;
fixtures cover every source below.

| Done | Task | Model |
|---|---|---|
| [x] | Write `docs/claude-config-sources.md`: every file Claude Code reads for skills, MCP servers, hooks, plugins, settings and env, their scopes and precedence, verified against current Claude Code docs via Context7. This is the spec for the readers below. | Opus 5.5 |
| [x] | Skills reader: project `.claude/skills`, `~/.claude/skills` (skip `synced/`, managed by claude.ai, but report it), shelf links, and plugin `skills/` folders; mark each as file, symlink or broken. | Sonnet 5.5 |
| [x] | MCP reader: user and per-project entries in `~/.claude.json`, `.mcp.json` in the project **and every parent folder up to `~`** (a stray `~/.mcp.json` applies everywhere), plugin-provided servers, and on macOS the desktop app's `claude_desktop_config.json` plus installed extensions. Mask secret values. | Opus 5.5 |
| [x] | Hooks reader: user, project and local `settings*.json` plus each enabled plugin's `hooks/hooks.json`; report event, matcher, command and owning plugin or file. | Sonnet 5.5 |
| [x] | Plugins reader: `installed_plugins.json` (scope, `projectPath` for local installs, version), `enabledPlugins` at each settings scope, marketplaces. | Sonnet 5.5 |
| [x] | `agentry status [path]`: grouped human output (Skills, MCP, Hooks, Plugins) with source file and token estimate where measurable; anything not measurable offline (MCP tool lists, hook output) is shown as "not measured", never guessed. `--json`. | Sonnet 5.5 |
| [x] | Fixture tests for each reader, including a parent-folder `.mcp.json`, a local-scope plugin install for another project, and a broken skill symlink. | Sonnet 5.5 |

## Phase 3: Doctor

**Value:** finds the problems fixed by hand on 2026-11-02/03 automatically, each with the file to change and the fix.
**Done when:** fixtures reproducing each case below are reported with severity, file (and line where possible) and a
suggested command; `agentry doctor` on the cleaned-up machine reports no errors; exit code is `1` only on errors.

| Done | Task | Model |
|---|---|---|
| [x] | Define the finding shape (`id`, `severity`, `message`, `file`, `line?`, `fix?`) and the rule registry in `lib/doctor.mjs`; human and `--json` output. | Sonnet 5.5 |
| [x] | Duplicate rules: same plugin installed at two scopes; same skill name in two places a session loads; same MCP server in several scopes; an MCP server that duplicates a plugin (e.g. `context-mode` in a repo `.mcp.json` while the plugin is enabled). | Sonnet 5.5 |
| [x] | Broken-reference rules: MCP `command` not on `PATH` (the `graft` case), hook command file missing, broken skill symlink, `enabledPlugins` entry for a plugin that isn't installed. | Sonnet 5.5 |
| [x] | Placeholder rule: `${VAR}` in an MCP header or env that is unset for GUI-launched apps on macOS (the Context7 key case); explain the `launchctl` or literal-value choices without printing the value. | Sonnet 5.5 |
| [x] | Stale-name rule driven by a small rename map in `lib/renames.json` (start with `graft` → `trail`): flags permission entries, MCP server names and commands, and hook commands that still use the old name. | Sonnet 5.5 |
| [ ] | Shelf rules: a global skill that is identical to a shelved copy (the four ffmpeg skills case); a bundle in `bundles.tsv` that installs a skill which lives on the shelf. | Haiku 5.5 |
| [x] | Fixture tests, one per rule, plus a clean fixture that must report nothing. | Sonnet 5.5 |

## Phase 4: Workspace scan

**Value:** see every repo's setup and problems at once instead of repo by repo.
**Done when:** `agentry scan ~/ws` finishes in seconds on the real workspace, lists each git repo with skill, MCP,
hook and plugin counts, token estimate and doctor findings, and `--json` returns the same data.

| Done | Task | Model |
|---|---|---|
| [ ] | Repo discovery under one or more roots: git repos and worktrees, skipping `node_modules`, `.git`, build output and the trail map folder (`graft/`); `--depth` limit. | Sonnet 5.5 |
| [ ] | `agentry scan [roots...]`: run inventory and doctor per repo, summary table sorted by findings, `--only-problems`, `--json`. Global findings (user config) are reported once, not per repo. | Sonnet 5.5 |
| [ ] | Cache per-repo results keyed on config file mtimes so a repeat scan is near-instant. | Sonnet 5.5 |
| [ ] | Tests over a fixture workspace with three repos (clean, duplicate MCP, stale name) and a worktree. | Haiku 5.5 |

## Phase 5: Safe fixes

**Value:** apply doctor's suggestions in one step with a preview and a way back, instead of hand-editing JSON in many repos.
**Done when:** every fixable rule from Phase 3 has a fix; `agentry fix --dry-run` shows a diff per file; `agentry fix`
asks before writing, backs up each file and can be undone; JSON files keep their indentation and key order.

| Done | Task | Model |
|---|---|---|
| [ ] | Fix engine: plan → preview (unified diff per file) → confirm → backup → write → verify (re-run the rule); `--yes` for scripts, `--dry-run` default when not a TTY. | Opus 5.5 |
| [ ] | JSON editing that keeps indentation, key order and trailing newline; refuse files that fail to parse instead of rewriting them. | Sonnet 5.5 |
| [ ] | Fixes: remove a duplicate MCP entry, remove an MCP server whose command is missing, swap stale names via the rename map, prune broken symlinks, shelve a global skill that duplicates a shelf copy, uninstall a duplicate plugin scope (via `claude plugin uninstall --scope`, run from the right folder). | Sonnet 5.5 |
| [ ] | `agentry fix --undo [timestamp]`: restore the files from a backup set and list what changed. | Haiku 5.5 |
| [ ] | `agentry fix` across a scan (`agentry scan ~/ws --fix`): group the plan by repo and confirm per repo; note which changed files are tracked in git. | Sonnet 5.5 |
| [ ] | Tests: dry-run output, backup and undo round trip, untouched formatting, refusal on unparsable JSON. | Sonnet 5.5 |

## Phase 6: Terminal UI (Ink)

**Value:** browse and change a project's setup with the keyboard: see what loads, what it costs, what is wrong, and
toggle shelf skills or apply fixes without remembering commands.
**Done when:** `agentry ui` (and `agentry` with no arguments in a TTY) opens the UI; every action calls the same
`lib/` functions as the CLI; component tests pass; `agentry --help` still loads no UI code.

| Done | Task | Model |
|---|---|---|
| [ ] | Add Ink and React (current majors, checked via Context7) plus `ink-testing-library` as dev dependency; lazy-load `tui/` from `bin/agentry.mjs`. | Haiku 5.5 |
| [ ] | UI structure and state: project picker (current repo, recent repos, scan roots), tabs Skills / MCP / Hooks / Plugins / Doctor, a details pane, keyboard map with `?` help. | Sonnet 5.5 |
| [ ] | Skills tab: per-source lists with token cost; shelf groups expand to skills; space toggles a group or skill on or off for this project or globally. | Sonnet 5.5 |
| [ ] | MCP, Hooks and Plugins tabs: read-only lists with source file and masked secrets; open the source file in `$EDITOR`. | Sonnet 5.5 |
| [ ] | Doctor tab: findings by severity; Enter previews the fix diff, confirm applies it through the Phase 5 engine; undo of the last fix set. | Sonnet 5.5 |
| [ ] | Component tests with `ink-testing-library` for navigation, toggling and the fix confirm flow. | Sonnet 5.5 |
| [ ] | README section with a screenshot and the key map. | Haiku 5.5 |

## Phase 7: Rollout

**Value:** the tool installs with the rest of agentry-labs and Claude itself uses it instead of digging through config.
**Done when:** a fresh `install.sh` makes `agentry` available; the moved shelf skills no longer come back through the
`global` bundle; a Claude session asked "what loads here?" answers from `agentry status --json`.

| Done | Task | Model |
|---|---|---|
| [ ] | `install.sh`: link the `agentry` bin when installing globally; `--dry-run` shows it. | Sonnet 5.5 |
| [ ] | Resolve the `bundles.tsv` conflict: `image-artifact-setup` and `lighthouse-audit` are in the `global` bundle but now live on the shelf (`design`, `web-audit`); move them to a bundle or mark them shelf-only, and drop the README workaround note. | Haiku 5.5 |
| [ ] | Add a short rule or skill telling Claude to run `agentry status --json` / `agentry doctor --json` for setup questions; keep its description under 200 characters; it needs a `bundles.tsv` line, must pass `skill-architect`'s `validate.mjs`, and changes the README cover counts. | Sonnet 5.5 |
| [ ] | Retire `scripts/shelf.mjs` after one release: print a notice pointing at `agentry shelf`, then remove it and its README mentions. | Haiku 5.5 |
| [ ] | Final pass: README, CLAUDE.md tree and Skills Quick Reference match the shipped commands; regenerate the README cover if counts changed. | Haiku 5.5 |

## Out of scope

- Editing skills' content, writing new skills (that is `skill-architect`).
- Managing claude.ai synced skills (`~/.claude/skills/synced/`) or Claude Docs/Stitch connectors.
- Measuring live token use from running sessions (the context-mode plugin's `ctx_stats` does that).
- Windows support beyond what Node's path and symlink APIs give for free.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-03 | Scope is the full setup manager, not shelf-only. Command name `agentry`. Distributed as a `package.json` bin, linked from the checkout. Terminal UI uses Ink on Node (OpenTUI needs Bun or Node's `--experimental-ffi`). CLI first, UI last on the same `lib/` functions. |
| 2026-11-03 | `AGENTRY_HOME` replaces the home directory (default `os.homedir()`); `CLAUDE_CONFIG_DIR` replaces `<home>/.claude` and wins over it. `lib/shelf.mjs` exports `createShelf(paths, {out, err, warn})` returning `{list, on, off}`, each giving an exit code; `createPaths({env, cwd})` takes the cwd so `projectRoot()` runs git there. Tests spawn the real CLI with both env vars set. Note: `node --test` also runs `test/helpers/*.mjs` as (empty) test files; harmless. `git init` seeds `.git/info/exclude` with comment lines, so tests filter comments. |
| 2026-11-03 | Phase 1 rows 1, 2, 3, 5. `paths.excludeFile(root)` runs `git rev-parse --git-path info/exclude` (shared across worktrees, so one worktree's links go into the common exclude file). `on`/`off` take an array of targets; all are resolved first, so one bad target changes nothing (exit 1 unknown, 2 ambiguous). A name that is both a group and a skill resolves to the group. `status` treats a symlink as a shelf link when its target lies under the shelf; a missing target is `broken`. `status` JSON keys: `shelf`, `groups[{name,state}]`, `project`/`global` `{base,links[{group,kind,name,link}],broken[{kind,name,link,target}]}`. `unshelve` refuses while a working or broken link to that skill exists; `shelve` refuses while any shelf link of that name exists (it would shadow the moved folder). Neither removes an emptied group folder. `linkTarget` now resolves relative symlinks against the link's folder. |
| 2026-11-03 | Phase 1 rows 4, 6, 7, 8. Token cost is the frontmatter `description` of a group's skills (`SKILL.md`) and agents (`.md`), counted as ceil(characters / 4); agents count too because their descriptions also load. `off --all` takes every link in the scope that points into the shelf, broken ones included. `--dry-run` runs the same checks and warnings as a real run and prints the link and exclude lines instead of writing. |
| 2026-11-03 | Phase 2 row 1: `docs/claude-config-sources.md`, checked against Context7 (`/pjbrito/claude-code-docs`) and probes with Claude Code 2.1.316 in throwaway folders and a throwaway `CLAUDE_CONFIG_DIR`. Surprises the docs don't state: `.mcp.json` is read from `<cwd>` and **every** parent up to `/` (not just up to `~` or the git root), nearest wins a name clash, child folders are ignored; the local-scope key in `.claude.json` is the **main** repo root (a worktree uses the main checkout's entry, a subfolder key is ignored); with `CLAUDE_CONFIG_DIR` set, `.claude.json` lives inside it; `enabledMcpjsonServers` only counts in a trusted folder; desktop extensions load in Code-tab sessions but not in the CLI; `installed_plugins.json` has an undocumented `enabledPlugins` key (ignored). Docs vs probe conflicts are recorded in the spec, not resolved. |
| 2026-11-03 | Phase 2 row 3: `lib/inventory/mcp.mjs` exports `createMcpReader(paths, {platform})` → `read({cwd})` → `{servers, errors}`; every entry is reported with a `state` (`active`, `shadowed` + `shadowedBy`, `pending-approval`, `rejected`, `disabled`) instead of being filtered, and `loadsIn` (`cli`, `desktop`). `paths` gained `claudeJson`, `pluginsDir` (`CLAUDE_CODE_PLUGIN_CACHE_DIR`), `desktopDir`, `repoKey(dir)` (parent of `--git-common-dir`) and `projectRoot(dir)` now takes an optional folder. Masking lives in `lib/mask.mjs` and runs at read time: env and header literals always masked (also harmless ones), `${VAR}` names kept, `:-default` masked, URL userinfo/query values/token-shaped path segments, secret-named flags, `K=V`, `Authorization:` args and token-shaped args masked. Parse errors say only "invalid JSON" because Node's message quotes the file. The plugin "installed and enabled" check inside the MCP reader is minimal on purpose; the Plugins reader should replace it. Not read: managed MCP/policy, claude.ai connectors and app built-ins (no file). Probed after the first commit: an unapproved or rejected `.mcp.json` entry doesn't shadow a user entry of the same name (an approved one does), and a bare-map project `.mcp.json` is ignored; the reader follows both. |
| 2026-11-03 | Phase 2 rows 2, 4, 5, 6, 7. New: `lib/inventory/{common,plugins,skills,hooks}.mjs` and `lib/status.mjs`; the MCP reader now calls the Plugins reader (the old minimal check is gone) and shares `readJson`/`isObject`/`list` from `common.mjs`. Plugins reader: an install applies here when it is `user`-scope or its `projectPath` equals the repo key, the working-tree root or the start folder; a project/local install beats a user one; `enabledPlugins` local > project > user, else `defaultEnabled` (assumed true); states `active`, `disabled`, `not-here` (installed only for other projects, so no components are read), `not-installed` (named in settings only). Skills reader reads `~/.claude/skills` (reports `synced/` as skipped with its entry count), `.claude/skills` in the working-tree root and the start folder, and plugin `skills/` plus manifest `skills` paths, named `<plugin>:<skill>`; kinds `file`, `symlink` (with `shelfGroup` when the target is under the shelf) and `broken` (missing target or no `SKILL.md`). Hooks reader: events from the three settings files and each applicable plugin (`hooks/hooks.json`, manifest `hooks`); empty matcher shows as `*`; state `untrusted` for project/local hooks in an untrusted folder, `disabled` for a disabled plugin or `disableAllHooks`. Commands are masked word by word with the new `maskShell` (a hook command is a whole shell line, `maskCommand` masks one executable). `agentry status [path] [--json]` JSON keys: `version`, `project`, `skills`, `mcp`, `hooks`, `plugins`, `tokens`, `errors`; tokens are the skill-description estimate only, `tokens: null` on MCP servers and hooks, `tokens.notMeasured` names MCP tool lists and hook output. Human output collapses a plugin's skills into one line. Still unverified, not probed against a fresh Claude Code session: `projectPath` matching for worktrees and subfolders, which project folders count for hooks, `enabledPlugins` and skills, `defaultEnabled`'s default, bare-map plugin `.mcp.json`, and whether hooks of a disabled plugin are really skipped. |
| 2026-11-03 | Phase 3 rows 1 to 5, 7 (shelf rules row left to the Haiku session). `lib/doctor.mjs` exports `createDoctor(paths, {out, err, platform, env, rules, renames, launchctlGetenv})` → `{collect, run}`; rules live in `lib/doctor-rules.mjs` as `{id, run(ctx)}` in the exported `rules` array, so a new rule is one more entry. `ctx` carries the readers' output (`skills.items`, `mcp.servers`, `hooks.items`, `plugins.items`), `layers` (settings files), `which`, `launchctlGetenv`, `line(file, needle)`, `renames`. No reader was extended. Finding ids: `dup-plugin-scope`, `dup-skill-name`, `dup-mcp-scope`, `dup-mcp-plugin`, `missing-mcp-command` (error), `missing-hook-file` (error), `broken-skill-link`, `plugin-not-installed`, `unset-placeholder`, `stale-name` (all others warning). `--json` keys: `version`, `project`, `findings`, `summary{error,warning,info}`, `errors`. Exit 0 or 1 (errors only); a missing folder exits 2. `line` is a best-effort first line containing the key text. `unset-placeholder` runs on macOS only and asks `launchctl getenv NAME` for set-or-not (the value is never kept); it covers `env` and `headers`, skips `${VAR:-default}`, `HOME`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR`. `dup-skill-name` compares active personal and project skills (plugin skills are namespaced) and points `file` at the project copy, which personal beats. `dup-mcp-plugin` matches a standalone server named like the plugin or its inner server name, or the one the reader found at the plugin server's endpoint. `stale-name` matches the old name as a whole token (not next to `/ . @ -` or letters), so the `graft/` map folder is not flagged; `lib/renames.json` is `{ "old": "new" }`; plugin-owned servers and hooks are skipped (not editable). Hook files are checked only when the command's first word, or the first argument after an interpreter, is a path (`/`, `~`, `./`, `$HOME`, `$CLAUDE_PROJECT_DIR`). Unverified: that the desktop app's GUI environment really lacks the shell profile for Code-tab MCP servers (assumed from the Context7 incident). |
| 2026-11-03 | `dup-mcp-scope` points `file`/`line` at the entry that wins (the repo's `.mcp.json` or local entry), not at the shadowed broader copy: the winner is always the narrower scope, and the broader copy (user scope, shared by other repos) is the one to keep. Phase 5's "remove a duplicate MCP entry" must act on `file`. The message says when the two entries differ is left to the user ("if both do the same thing"). Desktop-config entries are never marked shadowed by the MCP reader, so a server in both `claude_desktop_config.json` and `~/.claude.json` is not reported. |
| 2026-11-03 | `stale-name` fix after review: the old name is now also matched inside file names (`graft-hooks.cjs`, preceded by `/` or followed by `-` or `.`) and in hook matchers and `statusLine` commands; it is still not matched before `/` or next to letters, so the `graft/` map folder stays unflagged. Line numbers follow the matched word, so repeated hits land on their own lines. |
