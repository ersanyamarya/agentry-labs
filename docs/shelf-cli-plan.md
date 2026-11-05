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
- Ask before going beyond a phase's tasks. Record decisions and surprises in "Decisions log" at the bottom (keep it by topic, not per phase).

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
| [x] | Shelf rules: a global skill that is identical to a shelved copy (the four ffmpeg skills case); a bundle in `bundles.tsv` that installs a skill which lives on the shelf. | Haiku 5.5 |
| [x] | Fixture tests, one per rule, plus a clean fixture that must report nothing. | Sonnet 5.5 |

## Phase 4: Workspace scan

**Value:** see every repo's setup and problems at once instead of repo by repo.
**Done when:** `agentry scan ~/ws` finishes in seconds on the real workspace, lists each git repo with skill, MCP,
hook and plugin counts, token estimate and doctor findings, and `--json` returns the same data.

| Done | Task | Model |
|---|---|---|
| [x] | Repo discovery under one or more roots: git repos and worktrees, skipping `node_modules`, `.git`, build output and the trail map folder (`graft/`); `--depth` limit. | Sonnet 5.5 |
| [x] | `agentry scan [roots...]`: run inventory and doctor per repo, summary table sorted by findings, `--only-problems`, `--json`. Global findings (user config) are reported once, not per repo. | Sonnet 5.5 |
| [x] | Cache per-repo results keyed on config file mtimes so a repeat scan is near-instant. | Sonnet 5.5 |
| [x] | Tests over a fixture workspace with three repos (clean, duplicate MCP, stale name) and a worktree. | Haiku 5.5 |

## Phase 5: Safe fixes

**Value:** apply doctor's suggestions in one step with a preview and a way back, instead of hand-editing JSON in many repos.
**Done when:** every fixable rule from Phase 3 has a fix; `agentry fix --dry-run` shows a diff per file; `agentry fix`
asks before writing, backs up each file and can be undone; JSON files keep their indentation and key order.

| Done | Task | Model |
|---|---|---|
| [x] | Fix engine: plan → preview (unified diff per file) → confirm → backup → write → verify (re-run the rule); `--yes` for scripts, `--dry-run` default when not a TTY. | Opus 5.5 |
| [x] | JSON editing that keeps indentation, key order and trailing newline; refuse files that fail to parse instead of rewriting them. | Sonnet 5.5 |
| [x] | Fixes: remove a duplicate MCP entry, remove an MCP server whose command is missing, swap stale names via the rename map, prune broken symlinks, shelve a global skill that duplicates a shelf copy, uninstall a duplicate plugin scope (via `claude plugin uninstall --scope`, run from the right folder). | Sonnet 5.5 |
| [x] | `agentry fix --undo [timestamp]`: restore the files from a backup set and list what changed. | Haiku 5.5 |
| [x] | `agentry fix` across a scan (`agentry scan ~/ws --fix`): group the plan by repo and confirm per repo; note which changed files are tracked in git. | Sonnet 5.5 |
| [x] | Tests: dry-run output, backup and undo round trip, untouched formatting, refusal on unparsable JSON. | Sonnet 5.5 |

## Phase 6: Terminal UI (Ink)

**Value:** browse and change a project's setup with the keyboard: see what loads, what it costs, what is wrong, and
toggle shelf skills or apply fixes without remembering commands.
**Done when:** `agentry ui` (and `agentry` with no arguments in a TTY) opens the UI; every action calls the same
`lib/` functions as the CLI; component tests pass; `agentry --help` still loads no UI code.

| Done | Task | Model |
|---|---|---|
| [x] | Add Ink and React (current majors, checked via Context7) plus `ink-testing-library` as dev dependency; lazy-load `tui/` from `bin/agentry.mjs`. | Haiku 5.5 |
| [x] | UI structure and state: project picker (current repo, recent repos, scan roots), tabs Skills / MCP / Hooks / Plugins / Doctor, a details pane, keyboard map with `?` help. | Sonnet 5.5 |
| [x] | Skills tab: per-source lists with token cost; shelf groups expand to skills; space toggles a group or skill on or off for this project or globally. | Sonnet 5.5 |
| [x] | MCP, Hooks and Plugins tabs: read-only lists with source file and masked secrets; open the source file in `$EDITOR`. | Sonnet 5.5 |
| [x] | Doctor tab: findings by severity; Enter previews the fix diff, confirm applies it through the Phase 5 engine; undo of the last fix set. | Sonnet 5.5 |
| [x] | Component tests with `ink-testing-library` for navigation, toggling and the fix confirm flow. | Sonnet 5.5 |
| [x] | README section with a screenshot and the key map. | Haiku 5.5 |

## Phase 7: Rollout

**Value:** the tool installs with the rest of agentry-labs and Claude itself uses it instead of digging through config.
**Done when:** a fresh `install.sh` makes `agentry` available; the moved shelf skills no longer come back through the
`global` bundle; a Claude session asked "what loads here?" answers from `agentry status --json`.

| Done | Task | Model |
|---|---|---|
| [x] | `install.sh`: link the `agentry` bin when installing globally; `--dry-run` shows it. | Sonnet 5.5 |
| [x] | Resolve the `bundles.tsv` conflict: `image-artifact-setup` and `lighthouse-audit` are in the `global` bundle but now live on the shelf (`design`, `web-audit`); move them to a bundle or mark them shelf-only, and drop the README workaround note. | Haiku 5.5 |
| [x] | Add a short rule or skill telling Claude to run `agentry status --json` / `agentry doctor --json` for setup questions; keep its description under 200 characters; it needs a `bundles.tsv` line, must pass `skill-architect`'s `validate.mjs`, and changes the README cover counts. | Sonnet 5.5 |
| [x] | Retire `scripts/shelf.mjs` after one release: print a notice pointing at `agentry shelf`, then remove it and its README mentions. | Haiku 5.5 |
| [x] | Final pass: README, CLAUDE.md tree and Skills Quick Reference match the shipped commands; regenerate the README cover if counts changed. | Haiku 5.5 |

## Phase 8: Manage skills and plugins in the UI

**Value:** from the UI, move personal skills onto the shelf so they can be toggled, switch plugins on and off, and read
the screen at a glance (colour for on/off, severities, cost).
**Done when:** in a fixture home you shelve a personal skill from the Skills tab, toggle it on and off, and toggle a
plugin (preview, `y`, backup, `fix --undo` restores it); `agentry plugin enable|disable` does the same from the CLI;
every row that cannot be toggled says why; `NO_COLOR` renders without colour props; `npm test` passes.

| Done | Task | Model |
|---|---|---|
| [x] | Skills tab: `s` on a personal skill picks a shelf group (↑/↓, or `n` for a new name), previews and on `y` runs `shelf shelve`; `u` on a shelved skill runs `shelf unshelve`; rows that cannot be toggled (personal, project, plugin) say why in the status line and details. | Sonnet 5.5 |
| [x] | `lib/plugin-toggle.mjs` and `agentry plugin enable\|disable <name> [--scope] [--dry-run] [--yes]`: edit `enabledPlugins` through `json-edit` and the fix engine (preview, backup, undo); refuse managed or higher-scope overrides. | Sonnet 5.5 |
| [x] | Plugin toggle in the UI: space on a Plugins row or a plugin-skills group row previews and applies it; note that it applies to new sessions. | Sonnet 5.5 |
| [x] | Colour and layout polish: on/off/partial badges, token cost colours with legend, scope badges, bold headers with rules, severity icons, header summary line, per-tab footer keys, middle-truncated paths, label/value details; `NO_COLOR` respected. | Sonnet 5.5 |
| [x] | Tests: `test/tui-*.test.mjs` (shelve, unshelve, refusals, plugin toggle, NO_COLOR) and `test/plugin-toggle.test.mjs`. | Sonnet 5.5 |
| [x] | README `agentry ui` section (new keys, colour legend, refreshed capture), CLI list, `?` overlay, CLAUDE.md. | Sonnet 5.5 |
| [x] | Layout fixes from pty renders at 80, 100 and 130 columns: fixed-width columns with the name cut in the middle and badges never cut; details under the list below 110 columns and sized to their content; short summary and footer that fit one line; no repeated scope word under a section header; width caps on wide terminals; width assertions on all five tabs. | Sonnet 5.5 |
| [x] | Colour root cause: find why colour can be missing in a real terminal, fix it, and assert real SGR escapes in a pty with colour on and none with `NO_COLOR`. | Sonnet 5.5 |
| [x] | Skills tab: personal, project, plugin and shelf rows together with scope badges; drop the `g` mode; shelf rows show `P` (project) and `G` (global) badges with symbol states (`space` toggles P, `G` toggles global); plugin states `● active` / `○ disabled` everywhere; short "what is this row" explanations. | Sonnet 5.5 |
| [x] | Enable/disable user-scope MCP servers by parking them (UI space on the MCP tab, `agentry mcp enable\|disable\|list-parked`): save the config, `claude mcp remove --scope user`, add it back with `add-json`; backup and undo through the fix engine. | Sonnet 5.5 |

## Out of scope

- Editing skills' content, writing new skills (that is `skill-architect`).
- Managing claude.ai synced skills (`~/.claude/skills/synced/`) or Claude Docs/Stitch connectors.
- Measuring live token use from running sessions (the context-mode plugin's `ctx_stats` does that).
- Windows support beyond what Node's path and symlink APIs give for free.

## Decisions log

Consolidated 2026-11-05 from the per-phase entries (2026-11-03 to 2026-11-04). Per-file detail lives in the code and
`docs/claude-config-sources.md`; this keeps what you need to change the code safely.

### Status

Phases 0 to 8 and all five gaps-plan phases are merged into `main` (425 tests pass). What is left is under "Open items".

### Scope and layout

- Full setup manager, command `agentry`, `package.json` bin linked from the checkout (`npm link`). Ink on Node for the
  UI (OpenTUI needs Bun). CLI first, UI on the same `lib/` functions.
- `AGENTRY_HOME` replaces the home directory; `CLAUDE_CONFIG_DIR` replaces `<home>/.claude` and wins. Factories take
  `paths` (`createPaths({env, cwd, memoize})`); tests spawn the real CLI with both overrides set.
- Ink 8 + React 19 in `dependencies`, `ink-testing-library` dev only, no JSX (`React.createElement`), `engines.node >=22`.
  `tui/` loads lazily, so `--help` never imports Ink. Only `tui/data.mjs` calls `lib/`.
- Config facts (what Claude Code reads, precedence) are in `docs/claude-config-sources.md`, verified with Context7 and
  probes on Claude Code 2.1.316. Surprises worth remembering: `.mcp.json` is read from the cwd and every parent up to
  `/` (nearest wins); the local-scope key in `.claude.json` is the main repo root; an unapproved `.mcp.json` entry does
  not shadow a user entry; `~/.claude.json` is rewritten by live sessions, so edits to it can race.

### Readers (`lib/inventory/`, `lib/status.mjs`)

- `status --json` keys: `version`, `project`, `skills`, `mcp`, `hooks`, `plugins`, `tokens`, `errors`. Tokens are the
  description estimate (ceil(chars / 4), agents count too); MCP tool lists and hook output are "not measured".
- MCP entries carry a `state` (`active`, `shadowed`, `pending-approval`, `rejected`, `disabled`) and are never filtered.
  Secrets are masked at read time (`lib/mask.mjs`: env/header literals, URL userinfo and tokens, secret-named flags,
  `maskShell` for hook lines). Parse errors say only "invalid JSON".
- Plugins: an install applies when user-scope or its `projectPath` matches the repo; `enabledPlugins` local > project >
  user. Skills: `file`, `symlink` (with `shelfGroup`) or `broken`; `synced/` is reported, not managed. Hooks: id is an
  8-hex hash of event, matcher and entry; `untrusted` and `disabled` states.
- Not read: managed/MDM and server-managed settings, claude.ai connectors, app built-ins.

### Shelf

- `on`/`off` take several targets (group, `group/skill`, unique bare name), resolve all first (one bad target changes
  nothing; exit 1 unknown, 2 ambiguous). Exclude file comes from `git rev-parse --git-path info/exclude` (worktree safe).
- `shelve`/`unshelve` refuse to overwrite or to move a linked skill. `promote`/`demote` move a skill between the project
  and `~/.claude/skills` (no backup, rename, `EXDEV` falls back to copy + delete). `remove` keeps a copy under
  `backups/agentry/removed/<time>/` with `meta.json`; `--no-backup` keeps none. `--dry-run` runs the same checks.

### Doctor (`lib/doctor.mjs`, `lib/doctor-rules.mjs`)

- Rule = `{id, run(ctx)}`; finding = `{id, severity, message, file, line?, fix?}`; exit 1 only on errors, 2 for a missing
  folder. Ids: `dup-plugin-scope`, `dup-skill-name`, `dup-mcp-scope`, `dup-mcp-plugin`, `missing-mcp-command` and
  `missing-hook-file` (errors), `broken-skill-link`, `plugin-not-installed`, `unset-placeholder` (macOS, asks
  `launchctl getenv`, never keeps the value), `stale-name`, `shelf-duplicate`, `bundle-shelf-skill`.
- `stale-name` uses `lib/renames.json` and matches whole tokens and file names, never the `graft/` map folder.
- `dup-mcp-scope` points at the winning (narrower) entry, not the shadowed broader one.

### Scan (`lib/discover.mjs`, `lib/scan.mjs`, `lib/scan-cache.mjs`)

- Repos and worktrees under the roots (default depth 4); skips build/vendor folders and `graft`. Global findings are
  reported once. JSON keys: `roots`, `depth`, `global`, `repos`, `totals`, `cache`.
- Cache: one file per repo in `~/.claude/cache/agentry/`, stamped with mtime:size of every dependency and the `lib/`
  mtime. `PATH` and `launchctl` changes are not tracked (`--no-cache`). Memoized `git rev-parse` took a cold scan from
  16 s to about 2 s. `--find-skill` / `--remove-skill` sweep `.claude/skills/<name>` in every repo (global folder not
  included).

### Fix engine (`lib/fix.mjs`, `lib/fix-rules.mjs`, `lib/json-edit.mjs`)

- Flow: plan → masked preview → confirm → re-check files (mtime + sha256, re-plan at most 3 times) → backup set +
  manifest → atomic write → commands → verify with a fresh doctor. Backups: `<config>/backups/agentry/<ISO time>/`,
  `fix --undo` restores them (files, missing files, symlinks). `--dry-run` is the default without a TTY.
- A fix is `{ruleId, file, describe(), apply(text)}`; `apply` returns new text or `{command: [argv], cwd}`; a registry
  entry may return `{unfixable: "why"}`. Findings match across runs by id + file + message (not line), so verify cannot
  tell apart two findings differing only by line; fix every instance of a rule in a file at once.
- `json-edit` splices the original text (indent, key order, CRLF, trailing newline kept); typed errors `EJSONPARSE`,
  `EJSONDUP`, `EJSONPATH`, `EJSONROOT`. It refuses files that are not strict JSON.
- Deviations: `dup-mcp-scope` fixes only when both entries are deep-equal; `shelf-duplicate` removes the global folder
  (shelve would refuse); `stale-name` rewrites hook/MCP commands only when every touched word resolves; plugin uninstall
  undo restores `installed_plugins.json` but not cache folders. No fix by design: `missing-hook-file`,
  `plugin-not-installed`, `unset-placeholder`, `dup-skill-name`, `bundle-shelf-skill`.
- `scan --fix` plans user-level findings once, then per repo with confirm per repo.

### Toggles built on the engine (stand-in doctor + one-entry fix)

- Plugins (`lib/plugin-toggle.mjs`): edit `enabledPlugins` through json-edit, not `claude plugin enable|disable`. Scope
  is `--scope`, else the deciding layer, else the install scope. Refused: not installed here, managed settings, a higher
  scope overriding. `plugin install|uninstall` (`lib/plugin-install.mjs`) runs `claude plugin ... --scope` as a command
  step; undo restores only the scope's settings file.
- User-scope MCP (`lib/mcp-toggle.mjs`) and hooks (`lib/hook-toggle.mjs`) have no off switch in Claude Code, so "off"
  parks the entry: removed from the config and saved raw in `<config>/agentry/parked-mcp.json` / `parked-hooks.json`
  (0600, never printed). "On" puts it back. Plugin, project, local and desktop entries are refused with who manages them.
  `mcp add`/`set` (`lib/mcp-edit.mjs`): user via `claude mcp add-json`, project via `.mcp.json`; never overwrites a name.
- Limits: `add-json` exposes secrets in the process list for a moment; `fix --undo` restores the whole `~/.claude.json`,
  losing anything Claude Code wrote since; the real `claude` mutating commands were only ever run against a fake
  (`test/helpers/fake-claude.mjs`), their `--help` was read.

### Catalog, rules, backups

- `catalog` lists skills, agents, rules, CLAUDE.md files and MCP servers (`kind/name` ids; bare name when unique).
  Outdated = a catalog file missing or different locally. `catalog update` saves the current copy under
  `backups/agentry/updated/<time>/` and previews overwrite/add/keep. `refresh` uses `fetch --depth 1` + `reset --hard`
  (`pull --ff-only` fails on a depth-1 clone).
- `rules list|remove` covers user and project CLAUDE.md and rules files; removal keeps a copy under `removed/`.
- `lib/backups.mjs`: ids are `fix/<set>` or `removed/<time>/<label>`; `restore` moves back and never overwrites; `prune`
  and `delete` preview and need `y` or `--yes`.

### Terminal UI (`tui/`)

- Eight tabs (Skills, MCP, Hooks, Plugins, Doctor, Backups, Catalog, Rules). Every change is previewed in the details
  pane and applied with `y`; while a prompt is open `lock` blocks tab, quit and refresh keys. Flows: `use-flow.mjs`,
  `mcp-flow`, `hook-flow`, `move-flow`, `bulk-flow`. `/` filters and `m` marks (`use-list.mjs`); bulk runs each row's own
  dry-run preview under one `y`.
- Layout: `tui/layout.mjs`; details sit under the list below 110 columns, beside it from 110; tests assert no line over
  the width at 80, 100 and 130 on every tab. Eight tabs tighten the tab bar and drop counts by priority.
- Colour: Ink 8 / chalk decides the level once at load and gets 0 when `TERM` is unset, so `bin/agentry.mjs` sets
  `FORCE_COLOR=1` on a TTY unless the user opted out (`NO_COLOR`, `FORCE_COLOR`, `TERM=dumb`). `NO_COLOR` strips colour
  props only; every badge is also a word. `tui/theme.mjs` holds all colour choices. Pty tests: `test/tui-pty.test.mjs`.
- Testing gotchas: keys sent in the first ~50 ms are lost (wait for `ui.ready()`); a Ctrl-C within ~3 s of a real start
  kills the process; `ink-testing-library` frames carry no ANSI (set `FORCE_COLOR=1` before Ink loads to test colour).

### Install and rollout

- `install.sh --global` runs `npm install` + `npm link` in the checkout (`--source`, else the script's own checkout, else
  a clone in `~/.agentry-labs`); failures only warn; `--dry-run` prints one line. `skills/agentry` is in the `global`
  bundle (description under 200 characters). `image-artifact-setup` and `lighthouse-audit` are shelf-only.
- Needs `mise` on `PATH` for the mise npm wrapper, or the link shows a false "Could not link" warning.

### Open items

- Server-managed settings cannot be read offline, so the plugin toggle ignores them (documented in
  `docs/claude-config-sources.md`, "Managed sources"). The macOS MDM check is done.
- Not probable without a logged-in session: whether hooks of a disabled plugin are skipped; that the desktop app's GUI
  environment lacks the shell profile (assumed from the Context7 key incident). Probe results for `projectPath`,
  `defaultEnabled` and bare-map plugin `.mcp.json` are in `docs/claude-config-sources.md`.
- `unset-placeholder`, curl | bash clone path of `install.sh` and Windows were never exercised.
