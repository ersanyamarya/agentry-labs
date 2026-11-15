# agentry and GitHub Copilot

GitHub Copilot (CLI and VS Code) becomes a second agent next to Claude Code, and the Claude files in this repo stay the
single source of truth. Setup gets a global `copilot` part. Like the `config` part, it is previewed, idempotent and
backup-first, it never overwrites a value the user set, and uninstall removes only what it recorded and what is still
unchanged. `agentry status` then shows what Copilot loads. `agentry doctor` finds the Copilot problems it can see and
fixes them through the existing fix engine. When every phase is done, one `setup.sh install --all` wires both agents,
`agentry status` shows both inventories, and `setup.sh uninstall --all` takes back exactly what setup added.

## How to use this plan

- One phase per coordinator session, in order. Tick a task's box (`[ ]` → `[x]`) in the working tree once its Done
  when check passes.
- Branching: work on the current branch (`main`) and create no branches. Never commit, push or publish unless the user
  asks in chat. When the user asks for a commit, the message carries no AI attribution (no `Co-Authored-By`, no
  "Generated with").
- **Model column:** haiku-5-5 for mechanical work, sonnet-5-5 for normal implementation. opus-5-5 is used only for
  these rows:
  - Phase 1, the Copilot config spec. Every later task builds on its file shapes, precedence and env-var rules. A wrong
    fact (such as where `trustedFolders` is read from, or whether `${VAR}` expands in MCP headers) would spread into
    setup, the readers and the doctor rules without any test failing.
  - Phase 1, the Copilot target and part-aware removal in `apply-global.mjs`. This code writes and deletes files under
    `~/.copilot`. A wrong "unchanged" check deletes values the user edited, and a review of the diff alone would not
    show it.
  - Phase 2, the trusted-folder writer. `~/.copilot/config.json` is JSONC that Copilot itself rewrites ("managed
    automatically"). A careless edit loses comments or the user's login state, or Copilot overwrites it.
  - Phase 4, the `copilot-dup-hook` rule and fix. Copilot also reads repo `.claude/settings.json` hooks. A fix that
    removes the "repo copy" from that file breaks Claude. The 0.3.0 `dup-hook-scope` work needed opus for the same
    matching risk.
- **The coordinator runs on sonnet-5-5 and never switches model** (the prompt cache is per model). sonnet-5-5 rows run
  inline, and so does every question to the user.
- **haiku-5-5 and opus-5-5 rows run as subagents**, with the Agent tool's `model` set. The brief must stand alone: the
  task row, the files, the phase's Done when check, the Ground rules and Decisions log rows it builds on and, for
  opus-5-5, its reason. The coordinator reviews the diff, runs the tests below, then ticks the box.
- **Batch:** consecutive haiku-5-5 rows on nearby files go to one subagent. A lone one-file haiku-5-5 row runs inline.
  Subagents that touch the same files run one after another.
- A task runs in its own session (`start_session` with `model`, or `claude --model <id>`) only if the user wants to
  steer it.
- **Tests** (all from the repo root unless noted):
  - `cd cli && npm run check && npm run typecheck && npm test`
  - `node --test scripts/test/`
  - `bash scripts/test/setup.test.sh` and `/bin/bash scripts/test/setup.test.sh` (macOS bash 3.2)
  - `sh scripts/test/trail-autobuild.test.sh`
  - `node scripts/check-bundles.mjs`
  - `shellcheck scripts/setup.sh scripts/utils.sh scripts/test/*.sh` (CI runs it)
- Never run setup, `apply-global.mjs --write` or `agentry fix` against the real home while executing. Use `--home
  <tmp>`, `AGENTRY_HOME` and the test fixtures. The only exception is a run the user asks for in chat, after they see a
  preview.
- Ask before going beyond a phase's tasks. Log decisions and surprises in "Decisions log".

## Ground rules

- **Verified facts (Copilot CLI 1.0.112; do not re-research, write them into the spec):**
  - Copilot reads these per repo: project `CLAUDE.md`, `.claude/rules/*.md` (honors `paths:` frontmatter),
    `.claude/agents`, `.claude/skills`, `.mcp.json` (`mcpServers`), and hooks in repo `.claude/settings.json`. It does
    **not** read `~/.claude/skills`, `~/.claude/rules`, `~/.claude/CLAUDE.md` or `~/.claude/settings.json`.
  - User locations: `~/.copilot/skills`, `~/.agents/skills`, `~/.copilot/copilot-instructions.md`,
    `~/.copilot/instructions/*.instructions.md`, `~/.copilot/agents`, `~/.copilot/hooks/*.json`,
    `~/.copilot/settings.json` (inline hooks, `disabledMcpServers`, `includeCoAuthoredBy`) and
    `~/.copilot/mcp-config.json`.
  - Repo locations: `.github/skills`, `.github/instructions/*.instructions.md` (`applyTo`),
    `.github/copilot-instructions.md`, `.github/hooks/*.json`, `.github/agents`, `.github/copilot/settings.json` and
    `.github/copilot/settings.local.json`.
  - Repo hooks run only in trusted folders: `trustedFolders` in `~/.copilot/config.json`, or `COPILOT_ALLOW_ALL=true`.
    Setup never sets `COPILOT_ALLOW_ALL`.
  - Hook files take PascalCase event names. The stdin payload is snake_case and includes `cwd`.
  - Copilot combines hooks from every source, so the same hook at user and repo level runs twice.
  - SessionStart `additionalContext` is not injected.
  - A command PreToolUse hook that errors blocks the tool (fails closed).
  - `includeCoAuthoredBy` (default `true`) in `~/.copilot/settings.json` controls the Co-authored-by trailer. On the
    user's machine it is already `false`. The Claude equivalent is the `attribution` key that
    `global/settings.fragment.json` installs.
  - VS Code has three harnesses: Copilot, Local and Claude. Local is deprecated and honors `chat.*` location settings:
    `chat.agentSkillsLocations`, `chat.useClaudeHooks`, `chat.useClaudeMdFile` and `chat.instructionsFilesLocations`.
    No VS Code equivalent of the attribution setting has been found yet.
  - `global/helpers/trail-autobuild.sh` handles Claude (`$CLAUDE_PROJECT_DIR`) and Copilot (`cwd` in stdin JSON), and
    it migrates trail's old untracked `graft/` index. `scripts/test/trail-autobuild.test.sh` tests it, but CI and the
    docs do not run it yet.
  - The Copilot hook file the user already has is `~/.copilot/hooks/trail-autobuild.json`, containing
    `{"version":1,"hooks":{"SessionStart":[{"type":"command","command":"sh \"$HOME/.claude/helpers/trail-autobuild.sh\"","timeout":5}]}}`.
    `setup.sh` does not install it yet.
  - `trail init --agents copilot` writes only `.github/copilot-instructions.md` and `.trail/`.
  - context-mode stays Claude-only. Plan no Copilot context-mode wiring.
- **Facts found on this machine while planning (shape only, values not read):**
  - `~/.copilot/config.json` starts with `// User settings belong in settings.json.` and `// This file is managed
    automatically.` It is JSONC, so `JSON.parse` fails on it. It has no `trustedFolders` key today. Its top-level keys
    are `firstLaunchAt`, `host`, `installedPlugins`, `kind`, `lastLoggedInUser`, `loggedInUsers`, `login` and
    `reasoningSummariesCleanupDone`.
  - `~/.copilot/mcp-config.json` is `{"mcpServers":{"context7":{"type":"local","command":"bunx","args":[...],"tools":["*"]}}}`.
    This shape differs from `global/mcp.json`, which uses `type: "http"` with a `${CONTEXT7_API_KEY}` header.
  - `~/.copilot/settings.json` is strict JSON (`enabledPlugins`, `extraKnownMarketplaces`, `includeCoAuthoredBy`).
  - Copilot keeps writer locks next to its files (`settings.json.lock`, `.mcp-writer.lock`, `mcp-config.json.copilot-mcp.lock`).
  - Existing `~/.copilot/instructions/*.instructions.md` files use frontmatter of the form `applyTo: "**/*.sh"` plus
    `description: "..."`.
  - `rules/context7.md` and `rules/trail.md` have no frontmatter.
- **Runtime:** setup is POSIX-ish bash that also runs under macOS bash 3.2: no `mapfile`, no `${x,,}`, no associative
  arrays. Script logic is Node ESM `.mjs` with no dependencies. The CLI is Node `>=22`, strict TypeScript, ESM `.js`
  specifiers, Biome via `npm run check`, and npm workspaces under `cli/` (`packages/core`, `packages/tui`,
  `packages/web`). The published package is `@ersanyamarya/agentry-cli` at 0.4.0.
- **Where the code goes:**
  - Copilot fragment sources go in a new `global/copilot/` folder: `settings.fragment.json`, `mcp-config.json` and
    `hooks/trail-autobuild.json`.
  - Mirrored rules are generated from `rules/*.md`, the one source. There is no second copy in git.
  - Apply and remove logic goes in `scripts/apply-global.mjs`. Reuse its `stable`, `sha256`, backup and report helpers.
    If the file gets hard to read, move shared helpers to `scripts/lib/global-common.mjs`; do not write a parallel
    script.
  - Manifest logic goes in `scripts/setup-manifest.mjs`, as a new part `copilot`.
  - The setup step goes in `scripts/setup.sh`: `step_apply_copilot`, `step_remove_copilot` and the `part_status` case.
  - The CLI reader goes in `cli/packages/core/src/inventory/copilot.ts`, with shapes in `types.ts` and paths in
    `paths.ts`.
  - Rules go in `doctor-rules.ts` (one `Rule` per id in `rules`). Fixes go in `fix-rules.ts` (`createFixes`). Each fix
    parses its finding's message, so the message wording and the fix regex change together, with a test.
  - The spec goes in `cli/docs/copilot-config-sources.md`, next to `claude-config-sources.md`.
- **Reuse, don't rewrite:**
  - `mask.ts` (`maskUrl`, `maskMap`, `maskArgs`, `looksSecret`) for any MCP value.
  - `readJson`, `isObject` and `list` from `inventory/common.ts`, and `hookId` from `inventory/hooks.ts`.
  - `hookRunKey()` and `hookFile()` from `doctor-rules.ts`.
  - `frontmatter()` from `agents.ts`.
  - The skill-dir walk in `inventory/skills.ts` (export `subdirs` rather than copy it).
  - The existing `brokenSkillLink` fix maker, by keeping the same message format.
  - `json-edit.ts` for strict-JSON edits. It rejects comments, so it is **not** usable on `~/.copilot/config.json`.
- **Testing:**
  - Script tests use `--home <tmp>` and fakes in `scripts/test/fakes/` (add a fake `copilot` binary there).
  - CLI tests use `src/test/helpers/fixture.ts` with `AGENTRY_HOME` and `CLAUDE_CONFIG_DIR` set to temp dirs.
  - The Copilot dir is `<home>/.copilot`, derived from `--home` or `AGENTRY_HOME`. Assume no `COPILOT_HOME`-style
    variable unless the spec confirms that Copilot honors one. Tests never read the real `~/.copilot` or `~/.claude`.
- **Safety:**
  - Every write is previewed first and applied only with `--write` or after a yes. Existing files are backed up before
    they change.
  - A value already present is left as is and reported, never replaced. `includeCoAuthoredBy` is added only when
    absent.
  - Uninstall removes an entry only when it still equals what was recorded. For generated instruction files, that
    means the sha256 of the file as written, not of `rules/*.md`.
  - Secrets are never printed. A literal key found in an existing entry gets a warning that names the server, never the
    value.
  - No fix deletes a hook from a file Claude also reads (`.claude/settings.json`, `.claude/settings.local.json`).
- **Library facts:** for Copilot CLI or VS Code settings beyond the verified list, use Context7 (`resolve-library-id`,
  then `query-docs`) or the installed `copilot --help`, then write what you found into the spec with its source.

## Phase 1: Copilot settings, hook, MCP and instructions in setup

**Value:** `setup.sh install --only copilot` (and `--all`) wires Copilot for the whole machine. It sets
`includeCoAuthoredBy: false`, installs the trail autobuild hook, adds the context7 MCP entry and mirrors the
context7 and trail rules into `~/.copilot/instructions/`. Each item is recorded in the manifest, `setup.sh status`
reports the part, and `setup.sh uninstall --only copilot` removes only the unchanged items. The part is skipped with a
clear reason when Copilot is not there.
**Done when:**
- `node --test scripts/test/` passes, with new cases for each of these:
  - preview writes nothing
  - `--write` adds each item
  - a second run says "Nothing to add."
  - an unedited local `bunx` context7 entry is replaced by the http one, after a backup; an edited one is left as is
    with a warning
  - a present `includeCoAuthoredBy` or http `context7` entry is left as is with a warning (a literal key is named, never
    printed)
  - `--remove <manifest> --part copilot` deletes unchanged items, keeps edited ones, and backs up first
  - `--part config` still behaves exactly as before
- `bash scripts/test/setup.test.sh` and `/bin/bash scripts/test/setup.test.sh` pass, with cases for these:
  - install with a fake `copilot` on PATH and a `<home>/.copilot` dir
  - skip without them
  - status
  - uninstall
- `sh scripts/test/trail-autobuild.test.sh` passes, and `.github/workflows/scripts.yml` runs it.

| Done | Task | Model |
|---|---|---|
| [x] | Write `cli/docs/copilot-config-sources.md`, modeled on `claude-config-sources.md`. Put the verified facts and the machine facts from Ground rules into it with their source. It must answer each of these open questions, with a source and how it was checked: <br>(a) where 1.0.112 reads `trustedFolders` from (`config.json` vs `settings.json`), whether a parent folder trusts its children, and whether Copilot rewrites `config.json` while running or on exit <br>(b) the `mcp-config.json` entry shape for an http server and whether `${VAR}` expands in its headers, args or env <br>(c) whether a `COPILOT_HOME`-style override exists <br>(d) whether `.github/copilot/settings.json` overrides `includeCoAuthoredBy` <br>(e) the `*.instructions.md` frontmatter (`applyTo`, `description`) and how `.claude/rules` `paths:` maps to it <br>(f) user/repo precedence for skills, agents and MCP names, and how `disabledMcpServers` applies <br>(g) the VS Code attribution setting, if any. <br>Log each answer as a row in Decisions log. | opus-5-5 |
| [x] | Add `global/copilot/settings.fragment.json` (`{"includeCoAuthoredBy": false}`) and `global/copilot/hooks/trail-autobuild.json` (byte-identical to the user's file in Ground rules). Also add `global/copilot/mcp-config.json` with the context7 entry in the shape the spec settled; if the spec says env vars do not expand, leave the entry out and log it. Never write a literal key. | haiku-5-5 |
| [x] | In `scripts/apply-global.mjs`, add a `--copilot` target. It reads `<home>/.copilot` and is skipped with the message "Copilot not found" when that dir is absent. It writes these: <br>- `settings.json` keys only when absent <br>- `mcp-config.json` servers when absent, or when the existing context7 entry is the unedited old `bunx` one (replaced after the backup) (otherwise the existing "differs, left as is" warning, with the literal-key check) <br>- `hooks/trail-autobuild.json` as a copy <br>- one `instructions/<name>.instructions.md` per `rules/*.md` (not README.md), generated with frontmatter `applyTo: "**"` plus a `description`, or `paths:` translated when a rule has it <br>The `--report` JSON is `{copilotDir, settings:[{key,value}], mcp:[name], files:[{path,sha256}]}`, where each sha256 is of the content written. Back up before any write, exactly as the Claude target does. | opus-5-5 |
| [x] | Make `--remove <manifest>` take `--part <config or copilot>` (default `config`, so today's calls are unchanged). The copilot part removes from `<home>/.copilot`: settings keys and MCP servers still equal to what was recorded, and files whose sha256 still matches. It leaves `settings.json` and `mcp-config.json` in place even when they end up `{}`, because Copilot owns those files. It backs up to `<config>/backups/agentry-setup/<stamp>/`. Same opus-5-5 subagent as the row above. | opus-5-5 |
| [x] | Tests in `scripts/test/apply-global-copilot.test.mjs`, following `apply-global.test.mjs` and `apply-global-remove.test.mjs`: every Done when case for the script, in a temp `--home`. | sonnet-5-5 |
| [x] | In `scripts/setup-manifest.mjs`, accept part `copilot` in `record` and `forget`. Make `config-status` take an optional part argument (`config-status copilot`) that reports the recorded copilot entries as present, missing or changed. Add cases to `scripts/test/setup-manifest.test.mjs`. | sonnet-5-5 |
| [x] | In `scripts/setup.sh`, add part `copilot`: <br>- `ALL_PARTS`, `usage`, `valid_part` and the menu <br>- `step_apply_copilot`, which calls `apply-global.mjs --copilot` with `--report`, and is skipped with the reason "Copilot not found" unless `command -v copilot` succeeds and `$HOME/.copilot` exists <br>- `step_manifest` records it <br>- `part_status`: `copilot)` uses `mf config-status copilot` <br>- uninstall: `step_remove_copilot` uses `--remove ... --part copilot` and then `mf forget copilot` <br>Keep it bash 3.2 safe. Add `scripts/test/fakes/copilot` and the setup cases to `scripts/test/setup.test.sh`. | sonnet-5-5 |
| [x] | Wire `sh scripts/test/trail-autobuild.test.sh` into `.github/workflows/scripts.yml` (after the setup test) and into the Tests line of `scripts/README.md`. Fix any shellcheck findings in it. | haiku-5-5 |

## Phase 2: Trusted folders for Copilot repo hooks

**Value:** setup can add the folders the user names to Copilot's trusted folders, so repo hooks (`.github/hooks`,
`.claude/settings.json`) run in Copilot. This happens without `COPILOT_ALLOW_ALL`, without losing the comments or login
state in `config.json`, and uninstall removes only the folders setup added.
**Done when:**
- `node --test scripts/test/` covers these cases:
  - a JSONC `config.json` with the two leading comments keeps every byte outside the edited array
  - an existing `trustedFolders` entry is not duplicated
  - remove deletes only recorded folders that are still present
  - a folder with a space in its path works
- `setup.test.sh` (both bashes) covers these cases:
  - `--trust "<dir with space>"` adds it
  - `--yes` without `--trust` adds nothing
  - the menu answer from `SETUP_TTY` adds the typed folders
  - uninstall takes them back
- `grep -rn COPILOT_ALLOW_ALL scripts global` finds only a comment saying setup never sets it.

| Done | Task | Model |
|---|---|---|
| [x] | In `scripts/apply-global.mjs`, add `--trust-file <file>` (one absolute folder per line) to the `--copilot` target. It edits `trustedFolders` in the file the spec named, as a text edit that keeps comments and every other byte, and appends only missing folders. It refuses with a clear message if the file does not parse after the comments are stripped. It warns "quit Copilot first" if the spec says Copilot rewrites the file while running. Report `trustedFolders: [path]`. The `--remove --part copilot` path drops only recorded folders still present, as a text edit, with a backup. | opus-5-5 |
| [x] | Tests for the writer in `scripts/test/apply-global-copilot.test.mjs`: every Done when case for the script, with fixtures copied from the JSONC shape in Ground rules (fake values). | sonnet-5-5 |
| [x] | In `scripts/setup.sh`, add a repeatable `--trust <dir>`, stored newline-separated (not in `SEL`) and written to a temp file for `--trust-file`. In the interactive menu, when `copilot` is selected, ask for folders one per line through the existing `/dev/tty` and `SETUP_TTY` path (empty line ends; default none). Add nothing under `--yes` without `--trust`. Add `--trust` to `usage`. Add the setup cases to `scripts/test/setup.test.sh`. | sonnet-5-5 |

## Phase 3: `agentry status` shows what Copilot loads

**Value:** `agentry status [path]` and `--json` list Copilot's view of a folder: the skills, instructions, hooks, MCP
servers and agents it loads, whether the folder is trusted, and `includeCoAuthoredBy`, all next to the Claude
inventory. This makes the gap between the two agents visible.
**Done when:**
- `cd cli && npm run check && npm run typecheck && npm test` passes.
- New tests in `packages/core/src/test/copilot.test.ts` read a fixture home with `.copilot/`, `.agents/skills` and a
  repo with `.github/` and `.claude/`. They cover:
  - each source
  - a broken skill link
  - a JSONC `config.json`
  - an MCP URL with a key that shows only `<masked>`
- `agentry status --json` in a fixture without `.copilot/` gives `copilot: null` and the same Claude output as
  before.
- `packages/web` contract tests still pass.

| Done | Task | Model |
|---|---|---|
| [x] | In `packages/core/src/paths.ts`, add `copilotDir` (`<home>/.copilot`, honoring an override only if the spec found one) and `agentsSkillsDir` (`<home>/.agents/skills`). In `inventory/common.ts`, add a read-only `readJsonc` that strips `//` and `/* */` comments outside strings before `JSON.parse`. Add tests. | sonnet-5-5 |
| [x] | Add `packages/core/src/inventory/copilot.ts` (`createCopilotReader(paths)`) and the `Copilot*` types in `types.ts`. It reads every user and repo source in the spec's reader contract and returns: <br>- `present` <br>- skills (scope, source, state, broken target) <br>- instructions (file, `applyTo`) <br>- hooks (source file, event, masked command, via `hookId`) <br>- MCP servers (masked with `mask.ts`, `disabledMcpServers` applied) <br>- agents (via `frontmatter()`) <br>- `includeCoAuthoredBy` <br>- `trusted` <br>- `errors` <br>Reuse `subdirs` from `inventory/skills.ts` (export it). Add `packages/core/src/test/copilot.test.ts` with the Done when cases. | sonnet-5-5 |
| [x] | In `packages/core/src/status.ts`, add `copilot: CopilotStatus or null` to `StatusData` (null when `copilotDir` is absent), and add a "Copilot" block to the text output with counts and names, as the Claude blocks do. Keep `version: 1` (additive). Check that `packages/web/src/contract/load.ts` `statusSchema` accepts the extra field (add `copilot: z.unknown().nullable().optional()` if it is strict). Add `src/test/` CLI cases for `agentry status` with and without Copilot. | sonnet-5-5 |
| [x] | Add the reader contract section to `cli/docs/copilot-config-sources.md` (what each field means, what is masked), mirroring "Reader contract" in `claude-config-sources.md`. | haiku-5-5 |

## Phase 4: Doctor rules for Copilot

**Value:** `agentry doctor` (and `scan`) report the Copilot problems below, and `agentry fix` repairs the safe ones
with a backup and `--undo`:
- broken Copilot skill links
- a hook that runs twice
- secrets in Copilot MCP entries (masked)
- trail's old `graft/` index
- the Co-authored-by trailer still on
- hooks that will not run because a folder is untrusted
- Claude user files Copilot cannot see

**Done when:**
- `cd cli && npm run check && npm run typecheck && npm test` passes.
- Each rule has a firing case and a quiet case in `packages/core/src/test/doctor-rules.test.ts`, and each fixable rule
  has a `fix-rules.test.ts` pair (message to fix).
- `src/test/fix.test.ts` applies and undoes `copilot-coauthor` and `copilot-broken-skill-link` byte for byte.
- A test asserts that the raw secret appears in neither `agentry doctor` text nor `--json` output.
- Without a `.copilot/` dir, no Copilot rule fires (the existing doctor tests are unchanged).

| Done | Task | Model |
|---|---|---|
| [x] | In `doctor.ts`, add `copilot` (the Phase 3 reader result) to `DoctorContext` and build it once per run. Every Copilot rule returns `[]` when `copilot.present` is false. In `scan.ts`, report user-level Copilot findings once, not per repo, as scan already does for user-level fixes. | sonnet-5-5 |
| [x] | Add rule `copilot-broken-skill-link` (warning) for links in `~/.copilot/skills`, `~/.agents/skills` and `.github/skills`. It uses the same message and `fix:` text as `broken-skill-link`, so register the existing `brokenSkillLink` fix maker under the new id in `createFixes`. | sonnet-5-5 |
| [x] | Add rule `copilot-dup-hook` (warning) and its fix. It finds the same hook, by `hookRunKey()`, at user level (`~/.copilot/hooks/*.json`, `~/.copilot/settings.json`) and repo level (`.github/hooks/*.json`, `.claude/settings.json`), because Copilot runs it twice. The fix removes only a copy in `.github/hooks/*.json` (a file Claude never reads). When the repo copy is in `.claude/settings.json`, the finding is advice only (Claude needs it there), and it explains the choice: keep the user-level Copilot hook, or drop it and rely on the repo hooks. | opus-5-5 |
| [x] | Add rule `copilot-mcp-secret` (error, advice only). It flags a literal secret (`looksSecret`) in the URL, headers, args or env of any MCP server Copilot loads (`~/.copilot/mcp-config.json`, `.mcp.json`). The message names the server and file and shows only the masked value. The fix text says to move the value to an env var in the spec's syntax. | sonnet-5-5 |
| [x] | Add rule `copilot-coauthor` (warning) and its fix. It fires when `includeCoAuthoredBy` is `true` or absent (the default is true) in `~/.copilot/settings.json`, and also checks repo `.github/copilot/settings.json` if the spec says that overrides it. The fix is a `TextFix` through `json-edit.ts` that sets `false`, with a backup. | sonnet-5-5 |
| [x] | Add rule `copilot-context7-local` (warning) and its fix. It fires when `~/.copilot/mcp-config.json` has a `context7` entry of the old local shape (`type: local`, `command` `bunx` or `npx`, package `@upstash/context7-mcp`). The fix goes through the backup-first engine: it replaces that entry with the `global/copilot/mcp-config.json` http entry and never prints or writes a literal key. An edited entry gets advice only. Add tests with a fixture holding the bunx entry. | sonnet-5-5 |
| [x] | Add rule `copilot-untrusted-hooks` (warning, advice only). It fires when the repo has hooks Copilot would run (`.github/hooks/*.json` or `.claude/settings.json` hooks) and the root is not covered by `trustedFolders`. The fix text is `bash scripts/setup.sh install --only copilot --trust "<root>"`; it never suggests `COPILOT_ALLOW_ALL`. | sonnet-5-5 |
| [x] | Add rule `trail-old-index` (info, advice only; not Copilot-specific). It fires when the repo root has an untracked `graft/INDEX.md` and no `.trail/cache`. The message says the trail autobuild hook migrates it at the next session start. Check `src/test/scan-trail-leftovers.test.ts` first so no existing finding duplicates it. | sonnet-5-5 |
| [x] | Add rule `copilot-cannot-see` (info, advice only). It emits one finding per kind, listing names. The kinds are: user `~/.claude/rules/*.md` with no `~/.copilot/instructions/<name>.instructions.md`, user `~/.claude/skills/<name>` with no twin in `~/.copilot/skills` or `~/.agents/skills`, and `~/.claude/CLAUDE.md` with no `~/.copilot/copilot-instructions.md`. For rules, the fix text points to `setup.sh install --only copilot`. For skills, it follows the decision on skill mirroring. | sonnet-5-5 |

## Phase 5: Docs and release 0.5.0

**Value:** a user reading the README, `setup.sh --help` or the CLI docs learns that setup and agentry cover Copilot,
and the 0.5.0 package is ready for the user to publish.
**Done when:**
- Every test command in "How to use this plan" passes.
- `node scripts/check-bundles.mjs` passes (`global/copilot/` is config, not a component, so `bundles.tsv` needs no new
  line; confirm).
- `grep -n copilot README.md CLAUDE.md cli/README.md cli/CLAUDE.md scripts/README.md rules/README.md` shows the new
  sections.
- `cli/package.json` and `cli/package-lock.json` say 0.5.0.
- Nothing is committed unless the user asks.

| Done | Task | Model |
|---|---|---|
| [x] | Root `CLAUDE.md`: in Architecture, `global/` gains `copilot/` and `rules/` notes the Copilot mirror. In Common Commands, add `--only copilot` and `--trust`, plus `sh scripts/test/trail-autobuild.test.sh`. Mention the Copilot side of the trail hook in MCP Configuration. | haiku-5-5 |
| [x] | `README.md`: add the `copilot` part and `--trust` to "Install on any machine", plus a short "GitHub Copilot" subsection covering what setup writes and what Copilot reads per repo. `rules/README.md`: say each rule is mirrored to `~/.copilot/instructions/`. `scripts/README.md`: update the `apply-global.mjs` row (`--copilot`, `--part`, `--trust-file`). | haiku-5-5 |
| [x] | `cli/README.md`: Copilot in `status`, and the new doctor rule ids with which ones `fix` repairs. `cli/CLAUDE.md`: `inventory/copilot.ts`, `docs/copilot-config-sources.md`, and add `.copilot` to the tests-never-touch-the-real-home rule. `cli/CHANGELOG.md`: a 0.5.0 entry in the existing style. Bump the version in `cli/package.json` and `cli/package-lock.json` (`npm version 0.5.0 --no-git-tag-version` from `cli/`). | haiku-5-5 |
| [x] | Run every test command, then preview the real machine for the user, read-only. The commands are `node scripts/apply-global.mjs --copilot`, `agentry status --json` (Copilot block) and `agentry doctor`. Show the user the output and ask before any `--write`, commit or publish. The user runs `npm publish`. | sonnet-5-5 |

## Decisions to make while executing

These are open choices. The default applies unless the user says otherwise. Ask the user at the start of the phase
that needs the answer, and log the answer below.

- **Mirror rules into Copilot (Phase 1):** default yes. Generate `~/.copilot/instructions/<name>.instructions.md` from
  `rules/*.md` with `applyTo: "**"`; no second copy in git. The alternative is to append the rules to
  `~/.copilot/copilot-instructions.md`. Rejected, because that file belongs to the user and would have to be edited in
  place.
- **context7 for Copilot (Phase 1):** use the http entry with an env-var header if the spec shows that `${VAR}`
  expands. Otherwise write no entry and tell the user, because a literal key is never written. The local `bunx`
  context7 entry (the old way Copilot ran it) is replaced, not kept: setup backs up `mcp-config.json`, removes that
  entry only when it matches the known bunx shape (`type: local`, `command: bunx` or `npx`, package
  `@upstash/context7-mcp`), then writes the http entry. An edited or different entry is left as is with a warning.
  Doctor flags the bunx entry (rule `copilot-context7-local`) and its fix does the same replacement.
- **When the part runs (Phase 1):** the brief says skip unless the `copilot` CLI is on PATH and `~/.copilot` exists.
  Ask whether a VS Code-only user, with `~/.copilot` but no CLI, should still get the files.
- **Pre-existing identical files (Phase 1):** the user's `~/.copilot/hooks/trail-autobuild.json` already matches.
  Today's `config` behaviour leaves identical files unrecorded, so uninstall leaves them alone. Keep that behaviour
  unless the user wants setup to adopt them.
- **Trusted-folder UX (Phase 2):** by default, ask in the menu and take `--trust <dir>` on the command line, with no
  default folders and nothing under `--yes`. Whether a parent folder such as `~/ws` covers its repos depends on the
  spec's answer (a). If Copilot rewrites `config.json` while running, setup tells the user to quit Copilot first.
- **VS Code attribution (Phase 1 spec):** if the spec finds a setting, ask whether setup should write VS Code user
  settings at all. The default is no; document the setting instead.
- **VS Code `chat.*` locations:** should setup point `chat.agentSkillsLocations` and `chat.instructionsFilesLocations`
  at `~/.claude/skills` and `~/.claude/rules`? Default no: the Local harness is deprecated. Record it as advice in the
  README.
- **User skills Copilot cannot see (Phase 4):** default advice only. The alternative is a fix that links each
  `~/.claude/skills/<name>` into `~/.agents/skills/` (one source, no copies), which would need a symlink-creating fix
  kind in `fix.ts`. Ask before building it.

## Out of scope

- A per-repo `agentry copilot on/off` command. The user chose a global setup.
- Copilot wiring for context-mode.
- Copilot views in the terminal UI and web UI (Copilot sections, rows and screens). The JSON field is enough for now.
- Writing `.github/*` files into the user's repos, and any change in other repos under `~/ws`.
- Setting `COPILOT_ALLOW_ALL`, and editing VS Code `settings.json`, unless a logged decision says so.
- Copilot plugins and marketplaces (`enabledPlugins`, `extraKnownMarketplaces` in `~/.copilot/settings.json`).
- A Copilot twin of the `agentry shelf` command.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-14 | Global setup only, the same way Claude is set up: a `copilot` part in `setup.sh`. There is no per-repo Copilot command. |
| 2026-11-14 | Claude files stay the source of truth. Copilot files are generated or copied from `global/copilot/` and `rules/`, and nothing is edited by hand twice. |
| 2026-11-14 | The `copilot` part follows the `config` model: preview by default, add only what is missing, back up first, and record everything in the install manifest. Uninstall removes only unchanged entries. |
| 2026-11-14 | `includeCoAuthoredBy: false` is added only when the key is absent. The Claude side is the `attribution` key that `global/settings.fragment.json` already installs (uncommitted on `main` when this plan was written). |
| 2026-11-14 | Trusted folders: setup adds only folders the user names, never `COPILOT_ALLOW_ALL`. Edits to `config.json` keep its JSONC comments. |
| 2026-11-14 | context-mode stays Claude-only, as the user chose. |
| 2026-11-14 | Work on the current branch (`main`), no new branches, no commits unless the user asks, no AI attribution in commit text. |
| 2026-11-14 | There are five opus-5-5 rows covering four reasons (the apply and remove rows in Phase 1 share one subagent and one reason), each listed in "How to use this plan". Everything else is sonnet-5-5 or haiku-5-5. |
| 2026-11-14 | Spec written (`cli/docs/copilot-config-sources.md`). (a) `trustedFolders` only in `<ch>/config.json`; a parent trusts its children; whether a running session rewrites it is unconfirmed. (b) http entry `{type,url,headers,tools}`; `${VAR}` expands in headers, args and env, so context7 ships as the http entry. (c) `COPILOT_HOME` exists (default `~/.copilot`). (d) repo `.github/copilot/settings.json` overrides `includeCoAuthoredBy`. (e) `applyTo` string or array; `paths:` maps to it; no frontmatter gets `"**"`. (f) MCP: later source wins, workspace beats user; skills `.github` > `.claude` > `~/.copilot` > `~/.agents`. (g) VS Code `git.addAICoAuthor` (`off` default). |
| 2026-11-15 | The ia-website `bunx` cleanup was dropped from this plan at the user's request: work stays on agentry and agentry-related files. Phases 1 to 5 are otherwise done; nothing is committed. |
