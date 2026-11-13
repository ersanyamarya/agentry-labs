# agentry 0.3.0 and the trail/context-mode cleanup

trail and context-mode now wire themselves into `~/.claude`, but repos under `~/ws` still carry leftovers from the
older per-repo setup. These are project hook copies of trail's helper, `mcp__graft`/`mcp__trail` permissions for an MCP
server that no longer exists, and redundant `context-mode` and `context7` MCP entries. This plan teaches `agentry
doctor` to find the leftovers the current rules miss and to fix them through the backup-first fix engine. It then
releases 0.3.0. Last, it cleans every repo with the released tool, one previewed and approved step at a time. When every
phase is done, `agentry scan ~/ws` reports nothing except the findings the user chose to keep, and each change in
another repo has a backup set that `agentry fix --undo` can restore.

## How to use this plan

- One phase per coordinator session, in order. Tick a task's box (`[ ]` → `[x]`) in the commit that finishes it.
- Branching: one branch per phase, `cleanup/phase-<n>`, cut from `main`. When the phase's Done when checks pass, ask the
  user, then squash-merge it into `main` as one commit. Never push or publish. Releasing 0.3.0 means committing the
  version bump and changelog on `main`. The user runs `npm publish` (npm may ask for 2FA in a browser). Commit messages
  carry no AI attribution (no `Co-Authored-By`, no "Generated with").
- **Model column:** haiku-5-5 for mechanical work, sonnet-5-5 for normal implementation. opus-5-5 is used only for this
  row:
  - Phase 1, `dup-hook-scope` rule and fix. Its fix deletes hook entries from git-tracked settings files in seven other
    repos. A wrong match key would silently remove working hooks. The 0.2.0 `graft` → `trail` stale-name rule made
    exactly that mistake: trail still ships `graft-hooks.cjs` and an `mcp__graft__` matcher. A review of the diff alone
    would not catch it.
- **The coordinator runs on sonnet-5-5 and never switches model** (the prompt cache is per model). sonnet-5-5 rows run
  inline, and so does every question to the user.
- **haiku-5-5 and opus-5-5 rows run as subagents**, with the Agent tool's `model` set. The brief must stand alone: the
  task row, the files, the phase's Done when check, the Decisions log rows it builds on and, for opus-5-5, its reason.
  The coordinator reviews the diff, runs `cd cli && npm run check && npm run typecheck && npm test`, then ticks the box.
- **Batch:** consecutive haiku-5-5 rows on nearby files go to one subagent. A lone one-file haiku-5-5 row runs inline.
  Subagents that touch the same files run one after another.
- A task runs in its own session (`start_session` with `model`, or `claude --model <id>`) only if the user wants to
  steer it.
- **Other repos:** nothing under `~/ws` outside this repo is ever committed, pushed or edited by hand. Each change there
  goes through an agentry command that backs up first: `fix`, `scan --fix`, `mcp remove`, `plugin disable`, `shelf
  remove` or `hook remove`. Each one runs with `--dry-run` first. Then the coordinator shows the user the preview, asks,
  and applies only after a clear yes. Each apply is its own question.
- Ask before going beyond a phase's tasks. Log decisions and surprises in "Decisions log".

## Ground rules

- **Runtime:** Node `>=22`, ESM with `.js` import specifiers, and strict TypeScript (no `any` outside test folders).
  Biome/Ultracite runs through `npm run check`, including the package boundary rules. All commands run from `cli/`. That
  folder is the npm workspace root, with `packages/core` (`@agentry/core`), `packages/tui` and `packages/web`. One
  package is published: `@ersanyamarya/agentry-cli`, currently 0.2.0.
- **Where the code goes:**
  - Detection goes in `cli/packages/core/src/doctor-rules.ts`: one `Rule` object per id, added to the `rules` array.
  - Fixes go in `cli/packages/core/src/fix-rules.ts`: one entry in `createFixes`.
  - A fix parses the doctor's own message text, as the existing fixes do. A message wording change and its fix regex
    change in the same commit, and a test covers the pair.
  - Rules only describe. Fixes return `TextFix` or command fixes and never write. The engine in `fix.ts` previews,
    backs up to `~/.claude/backups/agentry/<timestamp>/`, writes atomically, verifies, and supports `agentry fix
    --undo`.
  - JSON edits go through `json-edit.ts` (text edits, so untouched bytes stay identical).
- **Reuse, don't rewrite:**
  - `hookFile()` in `doctor-rules.ts` resolves a hook command's script (`~`, `$HOME`, `$CLAUDE_PROJECT_DIR`).
  - `hookId()` in `inventory/hooks.ts` is the identity of a raw handler.
  - `removeText` inside `createHookToggle` in `hook-toggle.ts` already removes one hook entry from a settings file.
    Lift it to an exported helper rather than writing a second remover.
  - `list()` in `inventory/common.ts` reads permission arrays.
- **Testing:**
  - vitest via `npm test`, which builds `dist/` first: about 80 s and 542 tests today. The count only grows.
  - In-process rule and fix tests go in `cli/packages/core/src/test/`: `fix-rules.test.ts`, plus a new
    `doctor-rules.test.ts` that calls the exported `rules` with a hand-built `DoctorContext`.
  - Tests that spawn the CLI go in `cli/src/test/`: `doctor.test.ts`, `scan-fix.test.ts` and `fix-undo.test.ts`.
  - Tests never touch the real home. They use `cli/src/test/helpers/fixture.ts` and `paths.ts`, which set
    `AGENTRY_HOME` and `CLAUDE_CONFIG_DIR` to temp dirs. `AGENTRY_RENAMES` stays the only way to stage a rename.
- **Safety:**
  - Reading the real `~/ws` is allowed: `node cli/dist/bin/agentry.js scan --json ~/ws`, and `scan --fix --dry-run`,
    which writes nothing.
  - Writing there happens only in Phase 3, under the "Other repos" rule above.
  - Previews mask secrets (`mask.ts`). The `context7` entries hold API keys, so never print an `.mcp.json` or
    `~/.claude.json` raw. Compare entries in code and print only whether they are equal.
- **Do not touch:**
  - `~/.claude/helpers/graft-hooks.cjs`, and the user-level hooks and `mcp__graft__` matcher that call it. That is
    trail's current wiring.
  - heimstream's `.claude/settings.json` hook `node "${CLAUDE_PROJECT_DIR:-.}/.trail/hook.cjs"`. That is trail's
    repo-level team feature, a different and intentional mechanism.
  - `Bash(trail:*)` permissions. `trail` is a CLI on PATH, not an MCP server.
- **Docs to update** when commands, rules or flags change: `cli/CHANGELOG.md` (a new `## Unreleased` section; 0.2.0
  left none), `cli/README.md`, `cli/CLAUDE.md`, and the root `README.md`/`CLAUDE.md` only if what they say changes.

## Phase 0: Decisions with the user

**Value:** Every cleanup choice that agentry cannot make alone is settled and written down. Phase 3 then only runs
previews and approvals, with no open design questions.
**Done when:** The Decisions log has one dated row per item below, with the user's answer. Re-running the read-only
`node cli/dist/bin/agentry.js scan --json /Users/sanyam.arya/ws` still shows the 13 warnings listed in the 2026-11-13
rows, or a logged reason for any difference.

| Done | Task | Model |
|---|---|---|
| [x] | Regenerate the scan with `node cli/dist/bin/agentry.js scan --json /Users/sanyam.arya/ws` and compare it with the 2026-11-13 Decisions rows. Then, in code that prints only "equal" or "differs", compare each `context7` entry in the project `.mcp.json` of CareerBrainAI, netwrite and beeta/spektrum with the user entry in `~/.claude.json`. List which key differs (`args`, `env` names, `url`), never the values. | sonnet-5-5 |
| [x] | Ask the user, one repo at a time, which `context7` entry to keep for CareerBrainAI, netwrite and beeta/spektrum. Keeping the user entry means removing the project one in Phase 3. Keeping the project entry is fine too; doctor will keep reporting it. Warn that removing the user entry affects every repo. Log each answer. | sonnet-5-5 |
| [x] | Ask the user about four items and log each answer. (1) gm-stack's `enabledPlugins` entry `nx@nx-claude-plugins`, which is not installed: remove the entry, or install the plugin. (2) nisha-portfolio's git-tracked `.claude/skills/humanize-and-unslop`, an older copy that differs from and is shadowed by the user one: remove it with a backup, or keep it. (3) Confirm heimstream's `.trail/hook.cjs` hook stays. (4) The seven repos' project hooks that call a project copy of `graft-hooks.cjs`: remove them once doctor can, or keep any of them. | sonnet-5-5 |

## Phase 1: Doctor rules and fixes for trail leftovers

**Value:** `agentry doctor`, `fix` and `scan` report the trail leftovers the scan missed, and fix the safe ones with a
previewed diff, a backup, and `agentry fix --undo`.
**Done when:**
- `cd cli && npm run check && npm run typecheck && npm test` passes with more than 542 tests.
- On the real workspace, read-only, `node cli/dist/bin/agentry.js scan --json /Users/sanyam.arya/ws` reports:
  - `dup-hook-scope` in exactly nisha-portfolio, netwrite, slop-auditor-toolkit, gm-stack, router_radar,
    CareerBrainAI and commit-gpt (the nested `CareerBrainAI/scripts/bun-scripts` repo may repeat CareerBrainAI's, as it does for the other rules), and none in heimstream;
  - `stale-mcp-permission` in exactly the three `settings.local.json` files named in the 2026-11-13 rows;
  - no `trail-hooks-missing`.
- `node cli/dist/bin/agentry.js scan /Users/sanyam.arya/ws --fix --dry-run` previews those edits and writes nothing:
  `git status` is unchanged in every repo, and no new folder appears in `~/.claude/backups/agentry`.

| Done | Task | Model |
|---|---|---|
| [ ] | Add an `## Unreleased` section at the top of `cli/CHANGELOG.md`, and update the header comment of `fix-rules.ts` that lists the advice-only rules. Do this in the same commit as the first rule. Every later row in this phase adds its CHANGELOG line. | haiku-5-5 |
| [ ] | Rule and fix `dup-hook-scope`, per the 2026-11-13 "dup-hook-scope spec" rows. (1) Export the hook-entry remover from `hook-toggle.ts` without changing `hook remove` behaviour; its existing tests stay green. (2) Add the rule to `doctor-rules.ts` and `rules`, reusing `hookFile()` and `hookId()`. (3) Add the fix to `createFixes`: it removes the project or local handler, then the matcher group and event if they become empty. (4) Write in-process tests in `doctor-rules.test.ts` and `fix-rules.test.ts`. They must cover: the real shape (project `node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs" post-edit` against user `node "<home>/.claude/helpers/graft-hooks.cjs" post-edit` plus an `exit 0` fallback, with matchers that differ) gives one finding per handler; byte-identical handlers give none; heimstream's `.trail/hook.cjs` gives none; plugin hooks give none; a user-only hook with matcher `mcp__graft__` gives none; and the fix leaves `statusLine`, the other events and the other keys byte-identical. Reason: see "How to use this plan". | opus-5-5 |
| [ ] | Rule and fix `stale-mcp-permission`, per the 2026-11-13 spec row. The rule reads `permissions.allow`, `deny` and `ask` in project and local layers only. It flags entries `mcp__graft` or `mcp__trail` (bare or followed by `__`) when no MCP server of that name is configured at any scope. The fix removes those array entries with `json-edit`. In-process tests: user-layer permissions give none; `Bash(trail:*)` and `Bash(graft:*)` give none; a configured server named `trail` gives none; hook matchers are never read; and removing one entry leaves the rest of the array and file unchanged. | sonnet-5-5 |
| [ ] | Rule `trail-hooks-missing`, advice only, with no `createFixes` entry. It is reported when `which("trail")` is true and no user-layer hook runs a script named `graft-hooks.cjs` or `trail-hooks.cjs` (found with `hookFile()`). The finding's file is the user settings path. The fix text names the command from `trail init --help`. In-process tests use a fake `which` and cover both outcomes, plus "trail not on PATH gives none". | sonnet-5-5 |
| [ ] | CLI tests in `cli/src/test/` on fixture homes only. `doctor.test.ts`: each new id shows with its file and line, and `--json` carries it. `scan-fix.test.ts`: a temp root with a repo holding a project `graft-hooks.cjs` hook copy and a `settings.local.json` with `mcp__trail`. `scan --fix --dry-run` previews both diffs and writes nothing; `--yes` applies them and leaves a backup set; `fix --undo --yes` restores the bytes exactly. A heimstream-shaped repo in the same root stays untouched. | sonnet-5-5 |
| [ ] | Build, then run the read-only real-workspace checks from Done when. Log the finding counts per repo in the Decisions log. Any repo that differs from the expected list is a stop: report it to the user before merging. | sonnet-5-5 |

## Phase 2: Release 0.3.0 prep

**Value:** `main` holds a releasable 0.3.0 with current docs, ready for the user to `npm publish`.
**Done when:**
- `cd cli && npm run check && npm run typecheck && npm test && npm run pack:check` passes.
- `node cli/dist/bin/agentry.js --version` prints `0.3.0`.
- `cli/package.json` and both `@ersanyamarya/agentry-cli` version fields in `cli/package-lock.json` (the root
  `version` and `packages[""].version`) read `0.3.0`.
- `cli/CHANGELOG.md` has `## 0.3.0` and no `## Unreleased`.
- The release commit is on `main`, not pushed. The user has been told to run `npm publish` from `cli/`.

| Done | Task | Model |
|---|---|---|
| [ ] | Bump the version to `0.3.0` in `cli/package.json` and in `cli/package-lock.json` (root `version` and `packages[""].version`; leave workspace package versions alone). Rename `## Unreleased` to `## 0.3.0` in `cli/CHANGELOG.md`, and add a line for the release. | haiku-5-5 |
| [ ] | Update the docs for the new rules: the doctor and fix sections of `cli/README.md` (rule ids, which are advice-only, and `fix --undo`), and `cli/CLAUDE.md` only where conventions or layout changed (for example, the exported hook remover). Touch the root `README.md` and `CLAUDE.md` only if a sentence there is now wrong. | haiku-5-5 |
| [ ] | Run the release checks from Done when. Ask the user, squash-merge `cleanup/phase-2` into `main` as `chore(cli): release 0.3.0` (no attribution), and stop. Tell the user to run `npm publish` from `cli/` and then `npm i -g @ersanyamarya/agentry-cli@0.3.0`. Never run publish or push. | sonnet-5-5 |

## Phase 3: Clean the workspace with the released 0.3.0

**Value:** Every repo under `~/ws` loads one copy of trail's hooks, context-mode only from its plugin, and the MCP
servers the user chose. Each change has an agentry backup set.
**Done when:**
- The globally installed `agentry --version` prints `0.3.0`. This is the start condition: if it prints anything else,
  stop and ask.
- `agentry scan /Users/sanyam.arya/ws --json` shows no warnings except those the user chose to keep in Phase 0, each
  named in the Decisions log.
- `agentry fix --undo --list` shows one backup set per applied step.
- No commit or push was made in any repo except this one. This phase's branch commits only plan ticks and Decisions log
  rows.

| Done | Task | Model |
|---|---|---|
| [ ] | Check the start condition (`agentry --version` is `0.3.0`, from the npm install, not `npm link`). Then run `agentry scan /Users/sanyam.arya/ws --json` and compare it with the Phase 1 counts in the Decisions log. Stop and report any difference. | sonnet-5-5 |
| [ ] | User-level fix: run `agentry fix /Users/sanyam.arya/ws/aryantriki/gm-stack --dry-run` and show the user the `dup-plugin-scope` step (`claude plugin uninstall diagram-design@diagram-design --scope local`, run from gm-stack). Ask, then apply that repo's fixes with `--yes`. | sonnet-5-5 |
| [ ] | For each repo with automatic fixes, one repo per question: run `agentry fix <repo> --dry-run` and show the diff. Ask, then run `agentry fix <repo> --yes`. The repos are CareerBrainAI, netwrite, heimstream, photo-moto and pranjal/iqon-age-2 (`dup-mcp-plugin`); the seven `dup-hook-scope` repos, minus any the user chose to keep in Phase 0; and the three `stale-mcp-permission` files. Skip a repo the user declines and log it. Afterwards, show `git status --short` in each touched repo so the user sees what to commit there. | sonnet-5-5 |
| [ ] | Apply the Phase 0 `context7` choices, one repo at a time. To keep the user entry, run `agentry mcp remove context7 --dry-run` from the repo. Confirm the preview edits that repo's `.mcp.json` and not `~/.claude.json`; if it targets the user file, stop and ask. Ask, then apply. To keep the project entry, change nothing and log it. | sonnet-5-5 |
| [ ] | Apply the other Phase 0 choices, each previewed and asked. For gm-stack, run `agentry plugin disable nx@nx-claude-plugins --scope project --dry-run` (or install the plugin, if that was the answer); if agentry refuses a not-installed plugin, stop and ask. For nisha-portfolio, run `agentry shelf remove humanize-and-unslop --project`; it keeps a copy under `~/.claude/backups/agentry/removed/`. Tell the user the deletion shows in that repo's `git status`. heimstream stays as it is. | sonnet-5-5 |
| [ ] | Run the final `agentry scan /Users/sanyam.arya/ws --json`. Log the remaining findings, each with the user's reason for keeping it, and the backup set ids from `agentry fix --undo --list`. Commit the plan ticks and log on `cleanup/phase-3`, ask, then squash-merge it into `main`. | sonnet-5-5 |

## Out of scope

- A context-mode "second install" rule. The 2026-11-13 check found no on-disk shape for it that `dup-mcp-plugin` and
  `dup-plugin-scope` don't already cover. Add one only when a real second copy shows up.
- A fix that runs `trail init`, `context-mode setup` or any other installer. `trail-hooks-missing` is advice only.
- Deleting the project copies of `.claude/helpers/graft-hooks.cjs` and `graft-statusline.cjs`. Each repo's `statusLine`
  still runs `graft-statusline.cjs`, and the user has no user-level status line. Unused `graft-hooks.cjs` copies are
  harmless.
- `Bash(graft:*)`, `Bash(npx graft:*)` and `Bash(graft-dev:*)` permissions in `settings.local.json` files (`graft` is
  not on PATH). They are dead but harmless, and nobody asked for them.
- Re-adding any `graft` → `trail` entry to `renames.json`, or a generic "unknown MCP server in permissions" rule. The
  generic rule would flag claude.ai connectors and servers from other places.
- Committing, pushing or opening PRs in any repo other than agentry-labs, and running `npm publish`.
- The empty, untracked `cli/packages/core/src/graft/.cache` folder.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-13 | Branching: one branch per phase (`cleanup/phase-<n>`), squash-merged into `main` when its checks pass. Never push or publish; the user runs `npm publish`. No AI attribution in commits or PRs. |
| 2026-11-13 | Order: decisions, then code, then release, then cleanup with the released 0.3.0. 0.2.0 could already fix the `dup-mcp-plugin` and `dup-plugin-scope` findings, but one pass with 0.3.0 is the point: the fixes come from the tool, and every repo is touched once. |
| 2026-11-13 | **Hook dedup (verified, Context7 `/websites/code_claude`, https://code.claude.com/docs/en/hooks, "Hook handler fields"):** "If you define the same handler in more than one settings file, it runs once. A plugin's or skill's copy of the same handler stays separate." Hooks merge across user, project and local settings. The docs don't say whether the matcher is part of a handler's identity, so agentry treats "identical" as the same `hookId()` (event + matcher + raw handler). Those are harmless and get no finding. The real rule is "the same script and arguments at two scopes with different command strings". Both handlers run. |
| 2026-11-13 | **What the seven repos hold (read on disk):** nisha-portfolio, netwrite, slop-auditor-toolkit, gm-stack, router_radar, CareerBrainAI and commit-gpt have project `.claude/settings.json` hooks running `node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs" <sub>` for post-edit, tool-savings, session-start, stop and prompt (plus session-end in nisha-portfolio and CareerBrainAI). The user settings run `node "~/.claude/helpers/graft-hooks.cjs" <sub>` plus an `exit 0` fallback for the same subcommands. In every case the command string and the resolved file differ (the project copy is an older `graft-hooks.cjs`: tracked in gm-stack and router_radar, untracked in the other five), and the matchers differ slightly. No pair is byte-identical. So every trail hook runs twice in those repos today. Each repo's `statusLine` runs a project `graft-statusline.cjs`; the user has no `statusLine`. All seven `settings.json` files are git-tracked. |
| 2026-11-13 | **dup-hook-scope spec.** Check every non-plugin, non-disabled hook with a command in project or local scope against the user-scope hooks of the same event. The key is the script's file name (the basename of `hookFile()`'s path) plus the words after the script up to the first shell operator (double pipe, `&&`, `;`, single pipe), with quotes stripped. The matcher is ignored on purpose (the user tool-savings matcher also lists Skill and the project one does not; they still overlap). A match whose `hookId()` equals the user hook's gives no finding (Claude Code runs it once). Otherwise the finding is a warning on the project or local file: `<event> hook (<id>) in <scope> settings runs <script> <args>, which a user-level hook also runs; both run`, with the line of the written path. The fix finds the handler by `<id>` and `<scope>` and removes it through the exported `hook-toggle.ts` remover; it drops a matcher group and an event that become empty. Doc comments carry this. |
| 2026-11-13 | **stale-mcp-permission spec.** A small constant list of retired MCP server names, `["graft", "trail"]`, with a comment: the trail MCP server was removed and agents now call the `trail` CLI. Flag a permission entry in a project or local layer that equals `mcp__<name>` or starts with `mcp__<name>__`, when no MCP server named `<name>` is configured at any scope. Never read hook matchers or user-layer permissions: trail's own user hook matcher contains `mcp__graft__`. Message: `Permission <kind> entry "<entry>" is for MCP server "<name>", which is not configured`. The fix removes the entry. Real hits on 2026-11-13: `~/ws/beeta/spectroplast-webshop/.claude/settings.local.json` (`mcp__graft__graft_repo_map`), `~/ws/arya-folio/.claude/settings.local.json` (`mcp__trail`) and `~/ws/mqtizer/mqtizer5/mqtizermqtt_client/.claude/settings.local.json` (`mcp__trail__trail_find_code`, `mcp__trail__trail_repo_map`). All three are untracked. The project-hook matchers with `mcp__graft__` go away with the `dup-hook-scope` fix. |
| 2026-11-13 | **trail-hooks-missing:** kept because the user asked for it, but advice only. It matches nothing today: `trail` 0.29.0 is on PATH, and the user settings have its hooks. **context-mode second copy: dropped.** On disk there is one plugin install (`context-mode@context-mode`, user scope, 2.1.10), no `context-mode` in user `mcpServers`, and five project `.mcp.json` entries, which `dup-mcp-plugin` already reports and fixes. The npm CLI under mise is the tool that registered the plugin, not a second copy. |
| 2026-11-13 | **The 13 scan warnings** (scan of `/Users/sanyam.arya/ws`). `dup-mcp-plugin` (`context-mode`) in the `.mcp.json` of CareerBrainAI (reported twice, because the nested repo `CareerBrainAI/scripts/bun-scripts` resolves to the same file), netwrite, heimstream, photo-moto and pranjal/iqon-age-2; the files are tracked in netwrite, heimstream and iqon-age-2. `dup-mcp-scope` (`context7`, entries differ, no automatic fix) in CareerBrainAI (twice, same nesting), netwrite and beeta/spektrum: so three files, not four. `dup-skill-name` for `humanize-and-unslop`: nisha-portfolio's project copy is git-tracked and differs from the user one, which is a link into `~/.claude/skill-shelf/general/`. `plugin-not-installed` for `nx@nx-claude-plugins` in gm-stack's tracked `.claude/settings.json`. `dup-plugin-scope` for `diagram-design@diagram-design` (user and local). |
| 2026-11-13 | "Done only through agentry's fix engine" also covers agentry's other backup-first commands that run through the same engine and undo (`mcp remove`, `plugin disable`, `hook remove`) and `shelf remove --project`, which keeps a copy under `backups/agentry/removed`. `dup-mcp-scope` with differing entries, `dup-skill-name` and `plugin-not-installed` have no automatic fix, by design. The user's choice decides which command runs. |
| 2026-11-13 | `settings.local.json` files that mention trail or graft only as `Bash(trail:*)`, `Bash(graft:*)` or similar (gm-stack, agentry-labs, heimstream, gentlemans-stack, immich-photo-cleaner, spectroplast-webshop/webapp) are left alone. They name CLIs, not MCP servers. DeskMate's `settings.local.json` holds no such entry. |
| 2026-11-13 | **Phase 0 rescan:** the scan still shows the 13 warnings (dup-mcp-plugin 5, dup-mcp-scope 3 files, dup-skill-name 1, plugin-not-installed 1; dup-plugin-scope for diagram-design is global). The `context7` project entries in CareerBrainAI, netwrite and beeta/spektrum differ from the user entry in every field: the user entry is `type http` with a `CONTEXT7_API_KEY` header, the project ones are local stdio commands (`context7-mcp`, or `npx` in spektrum). |
| 2026-11-13 | **User decisions (Phase 0).** context7: keep the user entry, so Phase 3 removes the three project entries; one question covered all three repos because the situation is identical. gm-stack: remove the `nx@nx-claude-plugins` entry. nisha-portfolio: remove the project copy of `humanize-and-unslop` with a backup. Project hooks: remove the duplicates in all seven repos once doctor can; heimstream's `.trail/hook.cjs` stays. |
