# agentry: share Claude's skills and MCP servers with Copilot, by choice

GitHub Copilot already loads a repo's Claude files (`.claude/skills`, `.claude/agents`, `.claude/rules`, `CLAUDE.md`,
`.mcp.json` and, once trusted, hooks), but it never sees the user-level ones in `~/.claude` or the user MCP servers in
`~/.claude.json`. This plan lets the user pick, item by item, which Claude user-level skills, agents, rules and MCP
servers Copilot gets, and turn "use Copilot in this repo" (trust) on or off per repo. Nothing happens automatically:
every change is a preview, a confirm, a backup and an `agentry fix --undo` away from being reverted. When every phase
is done, the same choice is available from `agentry copilot ...`, the terminal UI (TUI) and the web UI, and none of
them shows Copilot at all on a machine where Copilot is not set up.

## How to use this plan

- One phase per coordinator session, in order. Tick a task's box (`[ ]` → `[x]`) in the commit that finishes it.
- Branching: work on the current branch, `main`. No new branches or worktrees. Commit phase by phase: one commit per
  task or per batch of rows, conventional messages (`feat(cli): ...`, `docs: ...`), staged by explicit path
  (`git add <file>`, never `git add -A` or `.`), no AI attribution and no `Co-Authored-By`. Never push, never
  `npm publish`; publishing is the user's.
- The first task (Phase 0) commits the pending setup.sh and docs work already in the tree, before any Phase 1 change.
- **Model column:** haiku-5-5 mechanical (docs of shipped behaviour, changelog, version, message text, hint wording),
  sonnet-5-5 normal implementation. opus-5-5 only for:
  - Phase 1, the share engine on the fix path (create and remove links and generated files, manifest and undo). It
    writes into `~/.copilot` and `fix --undo` deletes by manifest; a wrong `realPath` or a followed symlink would
    delete the user's real `~/.claude/skills/<name>` on undo, and a diff review would not show it.
  - Phase 1, the secret-safe MCP translation. It copies servers that hold API keys from `~/.claude.json` into another
    agent's config; a missed literal (env, header, arg or URL) writes a secret into `~/.copilot/mcp-config.json`, and
    the `${VAR}` rules differ per field (expansion was probed in `args`, `env`, `headers`, not in `url`).
- **The coordinator runs on sonnet-5-5 and never switches model** (the prompt cache is per model). sonnet-5-5 rows
  run inline, and so does every question to the user.
- **haiku-5-5 and opus-5-5 rows run as subagents** with the Agent tool's `model` set. The brief must stand alone:
  task row, files, the phase's "Done when" check, the Ground rules and Decisions log rows it builds on and, for
  opus-5-5, its reason above. The coordinator reviews the diff, runs the checks below, then ticks the box.
- **Batch:** consecutive haiku-5-5 rows on nearby files go to one subagent; a lone one-file haiku-5-5 row runs inline.
  Subagents on the same files run one after another.
- A task runs in its own session (`start_session` with `model`, or `claude --model <id>`) only if the user wants to
  steer it.
- **Checks** (every phase ends with all of them green):
  - From `cli/`: `npm run check && npm run typecheck && npm test` (set `AGENTRY_TEST_FRAME_WAIT_MS=4000` while
    iterating TUI tests; one package: `npx vitest run --project core`, or `cli`, `tui`, `web`), and
    `npm run pack:check` at the end of Phases 1, 2 and 5.
  - From the repo root: `node scripts/check-bundles.mjs && node --test scripts/test/*.mjs`,
    `bash scripts/test/setup.test.sh` and `/bin/bash scripts/test/setup.test.sh` (macOS bash 3.2).
- Never run `agentry copilot ...`, `agentry fix` or setup against the real home while executing. Use the test
  fixtures (`AGENTRY_HOME`, `CLAUDE_CONFIG_DIR` and `COPILOT_HOME` in temp dirs). The only exception is a run the user
  asks for in chat after seeing a preview.
- Ask before going beyond a phase's tasks. Log decisions and surprises in "Decisions log".

## Ground rules

- **Runtime:** Node 22+, strict TypeScript (`nodenext`, `.js` relative specifiers), npm workspaces under `cli/`
  (`packages/core`, `packages/tui` Ink 8, `packages/web` TanStack Start + oRPC), vitest, Biome (Ultracite). One
  published package, `@ersanyamarya/agentry-cli`, now `0.6.0` (npm still has `0.4.0`). Scripts are dependency-free
  Node `.mjs` plus bash that also runs under bash 3.2.
- **Layout (where new code goes):**
  - Core modules, one per job, in `cli/packages/core/src/`: `jsonc-edit.ts` (port), `copilot-share.ts` (engine,
    state, skills, agents, rules), `copilot-mcp.ts` (MCP translation), `copilot-trust.ts`. Facade methods in
    `data.ts` (`createData`), following its `previewX` and `applyX` pairs. Shapes in `types.ts`, paths in `paths.ts`.
  - The CLI command in `cli/src/bin/agentry.ts` (`if (command === "copilot")`, with a `COPILOT_USAGE` like
    `SHELF_USAGE`).
  - TUI: `packages/tui/src/rows.ts` (columns, key hints, why-not text), `components/{skills,inventory,rules,agents}-tab.tsx`,
    a new `copilot-flow.tsx` next to `mcp-flow.tsx`, `components/sidebar.tsx`, `components/help.tsx`, `components/footer.tsx`.
  - Web: `src/contract/copilot.ts` (new) and `src/contract/load.ts`, `src/server/router.ts`,
    `src/components/{skills,mcp,agents,rules}-screen.tsx`, `list-screen.tsx`, `preview-flow.tsx`, `app-sidebar.tsx`,
    `help-dialog.tsx`.
  - Words: a `copilot` section in `packages/core/src/messages/en.ts` (and `web.copilot` for web-only text), new terms
    `shared` and `notShared` in `terms`. TUI and web take every word from `@agentry/core/messages`;
    `src/test/messages-guard.test.ts` must stay green.
- **Boundaries:** core imports no `react`, `ink*` or `@tanstack/*`; tui and web import `@agentry/core/*` only, never
  each other. Core cannot import `scripts/lib/*.mjs` (only `cli/` is packed), so the JSONC editor and the rule to
  instructions mapping are ported into core.
- **Reuse, don't rewrite:**
  - The fix engine: `createFix` in `fix.ts` with an injected `DoctorLike` that returns a synthetic finding plus its
    fixes, exactly as `mcp-edit.ts` (around L236 and L366) and `mcp-toggle.ts` do. That gives masked preview, confirm
    or `--yes`, backup set, verify and `agentry fix --undo` (`fix-undo.ts`). No parallel engine.
  - `mask.ts` (`maskUrl`, `maskMap`, `maskArgs`, `maskHeader`, `looksSecret`, `keepRef`) for every MCP value shown.
  - `scripts/lib/jsonc-edit.mjs` (`parseJsonc`, `addToArray`, `removeFromArray`) and its tests in
    `scripts/test/apply-global-copilot.test.mjs`; `toInstructions` in `scripts/lib/copilot-global.mjs` (`paths:` to
    `applyTo`, `"**"` when there is none); `copilotRunning` (`pgrep -x copilot`) from the same file.
  - `createCopilotReader` (`inventory/copilot.ts`) for what Copilot already loads, `createMcpReader`
    (`inventory/mcp.ts`) for Claude user servers, `subdirs` (`inventory/skills.ts`), `frontmatter` (`agents.ts`),
    `createRules` entries (`rules.ts`), `paths.projectRoot`.
- **Facts (verified in `cli/docs/copilot-config-sources.md`, Copilot CLI 1.0.112; do not re-research):**
  - Copilot home `<ch>` = `$COPILOT_HOME`, else `~/.copilot` (`paths.copilotDir`). User locations: `<ch>/skills/<name>/SKILL.md`,
    `<ch>/agents`, `<ch>/instructions/<name>.instructions.md`, `<ch>/mcp-config.json` (`mcpServers`), `<ch>/config.json`
    (JSONC, `trustedFolders`, rewritten by Copilot itself).
  - Copilot does not read `~/.claude/skills`, `agents`, `rules`, `CLAUDE.md` or `~/.claude.json` servers.
  - MCP entry: local `{ "type": "local", "command", "args", "env", "tools": ["*"] }`, remote
    `{ "type": "http" or "sse", "url", "headers", "tools": ["*"] }`. `${VAR}` expands in `args`, `env` and `headers`
    (probed); not probed in `url`. Copilot needs the variable in its own environment.
  - Same MCP name: workspace `.mcp.json` beats the user file. Skills: repo beats `<ch>`. Agents: precedence
    unconfirmed, so never create a user agent whose name matches a repo agent.
  - Trust: a parent folder trusts its children; write only `<ch>/config.json`, keep the comment header and all keys,
    re-read before writing, write atomically, warn while a `copilot` process runs; prefer the exact repo root.
  - `inventory/copilot.ts` sets `present: existsSync(<ch>)` and nothing more; every Copilot doctor rule gates on it.
  - Setup's `copilot` part (`scripts/lib/copilot-global.mjs`) already writes `<ch>/instructions/<name>.instructions.md`
    for the repo's `rules/*.md` (`context7`, `trail`), the context7 MCP entry and the trail hook, recorded in
    `<config dir>/agentry/install-manifest.json`.
- **Testing:** core tests in `packages/core/src/test/`, CLI spawn tests in `src/test/`, TUI in
  `packages/tui/src/test/` (helper `helpers/tui.tsx`) and `src/test/tui-*.test.ts`, web in `packages/web/src/test/`.
  `src/test/helpers/fixture.ts` sets `AGENTRY_HOME` and `CLAUDE_CONFIG_DIR` to temp dirs and clears `COPILOT_HOME`, so
  `<ch>` is `<tmp home>/.copilot`. Tests never touch the real `~/.claude` or `~/.copilot`. `pgrep` is injected so tests
  do not depend on a running Copilot.
- **Safety:**
  - Nothing is written unless the user picks it (a command, a key or a checkbox) and confirms the preview. Doctor
    findings stay hints. No setup step or load path shares or trusts anything.
  - Every write goes through the fix engine: preview, backup set under `~/.claude/backups/agentry`, verify, undo with
    `agentry fix --undo`. Undo removes a created link with `lstat` checks only and never follows it.
  - agentry never writes into users' repos (`.github/*`, `.claude/*`, `.mcp.json`); only `<ch>` files and its own
    store.
  - No literal secret is ever written to `<ch>/mcp-config.json` or printed; previews use `mask.ts`.
  - agentry removes only what it recorded as its own and what still matches what it wrote.
  - Machine tokens never change: existing commands, flags and JSON fields stay; new JSON fields are additive.
- **UI words:** "Copilot" is shown only when `copilot.present && copilot.signedIn` (see Decisions log). Sharing is
  global, so every share preview and the help text say it applies to every repo ("for all projects", the glossary
  term). Trust text says "Copilot in this repo" and that it lets Copilot run this repo's hooks and MCP servers.

## Decisions to make

These have a default the phases use; the user can change any before its phase starts.

1. **TUI key (Phase 3).** `m` is the Skills move menu only, `c` is copy, `i`, `o` and `s` still show retired-key
   notices on some tabs, `t` is free but reads as "trust". Default: `C` (shift+c) shares or unshares the selected row
   on Skills, MCP, Agents and Rules, and `T` turns "Copilot in this repo" on or off from any of those tabs and the
   sidebar. Alternative: `h` for share and `C` for the repo switch. Web uses the same keys plus a checkbox column.
2. **Setup-owned instructions (Phase 1).** `context7.instructions.md` and `trail.instructions.md` are written and
   recorded by setup's `copilot` part. Default: agentry shows them as Shared with the note "added by setup" and
   refuses to unshare them (the reason names `setup.sh uninstall --only copilot`), so setup's manifest never goes out
   of sync. Alternative: allow unshare and leave setup to report the file as "changed since install".
3. **Which skill is the link target (Phase 1).** Default: the realpath of `~/.claude/skills/<name>` (for a library
   skill linked in, the library folder), so turning the skill off for Claude does not break Copilot's copy; the
   Copilot mark then shows "Shared" independently of "Loaded". Alternative: link to the `~/.claude/skills/<name>` path
   itself, so Claude's off also hides it from Copilot (and leaves a broken link the doctor reports).

## Phase 0: Commit the pending setup work

**Value:** The tree is clean, so every later commit carries only this plan's changes.
**Done when:** `git status --short` is empty; `git log -1 --stat` shows exactly the seven files below;
`node scripts/check-bundles.mjs && node --test scripts/test/*.mjs`, `bash scripts/test/setup.test.sh` and
`/bin/bash scripts/test/setup.test.sh` pass.

| Done | Task | Model |
|---|---|---|
| [x] | Run the root checks on the current tree; if any fails, stop and tell the user (do not fix it here). Then stage by path only `.github/workflows/scripts.yml`, `CLAUDE.md`, `README.md`, `scripts/README.md`, `scripts/setup.sh`, `scripts/test/fakes/_tool.sh`, `scripts/test/setup.test.sh` and commit them as one commit, e.g. `feat(install): context-mode for Copilot in the copilot part; Node 24 gate only for context-mode` (read the diff to word it; no attribution). Log the commit hash. | haiku-5-5 |

## Phase 1: Core share, unshare and trust (no UI)

**Value:** In-process code can preview and apply sharing a Claude user skill, agent, rule or MCP server with Copilot,
take it back, trust or untrust a repo, and undo any of it with `agentry fix --undo`; status data says whether Copilot
is signed in and what is shared. Tested end to end in temp homes.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck`, `npm test`, `npm run pack:check` pass. New core
tests show: share then `fix --undo` leaves `~/.claude/skills/<name>` (a real folder and a link into the library)
intact and removes only `<ch>/skills/<name>`; unshare refuses an entry agentry did not write or that changed since;
an MCP server with a literal key in env, a header and an arg is written with `${VAR}` placeholders only (the test
greps `<ch>/mcp-config.json` for the fixture's secret and finds nothing) and one with a secret in its URL is refused;
trust keeps `config.json`'s comment header and every other key byte for byte; `messages.test.ts` covers the new
section. `git diff --stat` touches no file under `scripts/`.

| Done | Task | Model |
|---|---|---|
| [x] | Port `scripts/lib/jsonc-edit.mjs` (`parseJsonc`, `addToArray`, `removeFromArray`) to `cli/packages/core/src/jsonc-edit.ts` with strict types, and its JSONC cases from `scripts/test/apply-global-copilot.test.mjs` (comment header, trailing commas, missing key, parent already listed) to `packages/core/src/test/jsonc-edit.test.ts`. Leave the `.mjs` as is (setup still uses it); log the second copy. | sonnet-5-5 |
| [x] | `signedIn`: in `inventory/copilot.ts` read `<ch>/config.json` with the ported `parseJsonc` and set `signedIn` true when `loggedInUsers` is a non-empty array or `lastLoggedInUser` is set; never copy their values. Add the field to `CopilotInventory` in `types.ts` (additive; `present` keeps its meaning). Tests in `packages/core/src/test/copilot.test.ts` for missing file, comments, empty and set. | sonnet-5-5 |
| [x] | Share engine (`copilot-share.ts`): one `share`/`unshare` path for skills, agents and rules on `createFix` with an injected `DoctorLike` (the `mcp-edit.ts` pattern): a synthetic finding per change and fixes that create a symlink or a generated file under `<ch>`, or remove one. Extend `fix.ts` and `fix-undo.ts` minimally so a created link is recorded (`kind: "missing"` plus a written link target) and undo deletes it only when `lstat` shows that same link, never following it; a removed link is restored as a link. Ownership store `<config dir>/agentry/copilot-shares.json` (`{ version: 1, items: { "<kind>:<name>": { path, target or sha256, sharedAt } } }`, atomic write, no secrets). A `shareState(paths, cwd)` read returns, per Claude user item, `shared`, `notShared`, `other` (something not ours is there), `setup` (setup's manifest owns it) or `repoWins` (a repo item of the same name hides it). Tests: undo keeps the Claude original (real folder and library link), conflict on a changed link, `--dry-run` writes nothing. | opus-5-5 |
| [x] | Skills and agents on the engine: share links `<ch>/skills/<name>` to the skill's realpath (Decision 3) and `<ch>/agents/<file>.md` to the agent file; only user-level items (`~/.claude/skills`, `~/.claude/agents`); refuse plugin and project items with a reason ("Copilot already loads this repo's .claude/skills"), refuse when `<ch>` already has that name and it is not ours, refuse an agent whose name matches a repo agent (`.github/agents`, `.claude/agents`), warn when a repo skill of the same name wins. Tests per case in `packages/core/src/test/copilot-share.test.ts`. | sonnet-5-5 |
| [x] | Rules on the engine: share writes `<ch>/instructions/<name>.instructions.md` from `~/.claude/rules/<name>.md` with a TS port of `toInstructions` (`paths:` → `applyTo`, `"**"` when absent, `description` kept); unshare deletes it only when its sha256 still equals what was written; files recorded in setup's install manifest show as `setup` and are refused (Decision 2). Tests with and without frontmatter. | sonnet-5-5 |
| [x] | MCP translation (`copilot-mcp.ts`): Claude user server (top-level `mcpServers` in `paths.claudeJson`) → Copilot entry in `<ch>/mcp-config.json`, through the same engine (strict JSON via `json-edit.ts`, backup, undo). Map stdio or no type to `local`, keep `http` and `sse`, add `"tools": ["*"]`. Every env value that is a literal becomes `${<KEY>}`; a literal header value becomes `${<SERVER>_<HEADER>}` (upper snake, `Bearer ` prefix kept); a secret-looking arg (`looksSecret`) becomes `${<SERVER>_ARG_<n>}`; values already `${VAR}` stay (a `${VAR:-default}` is refused: not probed in Copilot). A secret in the URL (userinfo, query value, token-like path segment) is refused with the reason. The preview lists the variables to export for Copilot (and that GUI-launched VS Code does not read shell rc files) and never shows a value. Refuse when the name exists in `mcp-config.json` and is not ours; warn when the repo's `.mcp.json` has the same name (it wins). Unshare removes the entry only when it still equals what was recorded. Tests: secrets in env, header, arg and URL; already-placeholder; clash; undo. | opus-5-5 |
| [x] | Trust (`copilot-trust.ts`): `trust(dir)` adds `paths.projectRoot(dir)` to `trustedFolders` in `<ch>/config.json` with the ported `addToArray`; `untrust(dir)` removes that exact entry only and says when a parent entry still trusts the repo; both through the fix engine (backup, verify, undo), re-read right before writing, refuse while an injected `isCopilotRunning()` (default `pgrep -x copilot`) is true, refuse when `config.json` is missing ("start Copilot once"). Tests: comment header kept, already trusted, parent trusted, running refused. | sonnet-5-5 |
| [x] | Facade: in `data.ts` add `copilotState(dir)` (signed in, trusted, per-item share state for skills, MCP, agents, rules) and `previewCopilot` / `applyCopilot` (`{ dir, action: "share" or "unshare" or "trust" or "untrust", kind?, name? }`) in the existing `Preview` and `Outcome` shapes; include the state in `load()` only when `copilot.present`. Tests in `packages/core/src/test/`. | sonnet-5-5 |
| [x] | Messages: add a `copilot` section to `packages/core/src/messages/en.ts` (column header, Shared, Not shared, "Copilot in this repo", the global-scope note "Shared with Copilot for all projects", why-not reasons, preview titles, refusal reasons, export-variables note) and `terms.shared`, `terms.notShared`; core modules read their user-facing text from it. Extend `packages/core/src/test/messages.test.ts`. | haiku-5-5 |

## Phase 2: `agentry copilot` command, status and doctor hints

**Value:** A user can run `agentry copilot status`, `share <name>`, `unshare <name>`, `trust [path]` and
`untrust [path]` with `--dry-run`, `--json` and `--yes`, see Copilot's sign-in and share state in `agentry status`, and
the doctor's Copilot hints name these commands.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck`, `npm test`, `npm run pack:check` pass.
`node dist/bin/agentry.js copilot --help` lists the five subcommands and flags; a spawn test shares, lists and
unshares one item of each kind in a fixture home and `agentry fix --undo` reverts a share; without `<ch>` every
subcommand prints "Copilot not found" and exits 1 without writing; `agentry status --json` keeps every existing field
and adds `copilot.signedIn` and `copilot.shared`; `agentry doctor --json` keeps every finding `message` byte for byte.

| Done | Task | Model |
|---|---|---|
| [ ] | Router: `if (command === "copilot")` in `cli/src/bin/agentry.ts` with `COPILOT_USAGE`, subcommands `status`, `share <name>`, `unshare <name>`, `trust [path]`, `untrust [path]`, flags `--dry-run`, `--json`, `--yes`, and `--kind skill or agent or rule or mcp` for a name found in more than one kind (ambiguous without it: exit 2 listing the kinds). Calls the Phase 1 modules; `status` prints the per-item table (human) or the facade state (`--json`). The usage text says sharing applies to all projects. Exit codes as `mcp-toggle.ts`: 0 done, previewed, declined or already so; 1 refused or failed; 2 usage. | sonnet-5-5 |
| [ ] | Spawn tests `cli/src/test/copilot.test.ts`: each subcommand and kind, `--dry-run` leaves files byte-identical, `--json` shapes, refusal reasons, no Copilot home, undo through `agentry fix --undo`, the fixture secret never appears in stdout, stderr or `<ch>`. | sonnet-5-5 |
| [ ] | Status: `status.ts` adds `copilot.signedIn` and `copilot.shared` (`{ skills, agents, rules, mcp }` name lists) to the JSON block and one human line ("Shared with Copilot: n skills, ..."; "not signed in" when so). Extend the status assertions in `src/test/inventory.test.ts` and update the web `load.ts` schema only if it parses `copilot` strictly. | sonnet-5-5 |
| [ ] | Doctor hints: change only the `fix` field (never `message`, which `fix-rules.ts` parses) of `copilot-cannot-see` (skills: `agentry copilot share <name>`, rules: the same, user CLAUDE.md text unchanged) and `copilot-untrusted-hooks` (`agentry copilot trust`), in `doctor-rules.ts`; update the matching expectations in `src/test/doctor.test.ts` and `packages/core/src/test/doctor-rules.test.ts`. | haiku-5-5 |

## Phase 3: Copilot in the terminal UI

**Value:** In `agentry`, when Copilot is present and signed in, Skills, MCP, Agents and Rules rows show a Copilot
column (Shared, Not shared, or a why-not), one key shares or unshares the selected row through the usual preview and
`y` confirm, and a "Copilot in this repo" switch trusts or untrusts the repo. Without Copilot nothing changes on screen.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck`, `npm test` pass. New TUI tests show: no Copilot
column, key hint or help line when `<ch>` is missing or not signed in; the share key on a user skill opens a preview
naming "all projects" and `y` writes the link; on a repo or plugin row it shows the why-not notice and writes nothing;
the switch toggles trust with a preview; `?` on each of the four tabs lists the new keys and every help line fits 80
columns; `tui-widths.test.ts` and `tui-layout.test.ts` pass at their narrowest widths.

| Done | Task | Model |
|---|---|---|
| [ ] | Resolve Decision 1 and log it. Rows: in `packages/tui/src/rows.ts` add the Copilot cell to the skills, MCP, agents and rules row builders and their details (state word from `messages().copilot`, why-not for project-only, plugin, library-only and `setup`/`other`/`repoWins` rows), shown only when the load result carries Copilot state; add the key to `skillKeys`, `mcpKeys`, `agentKeys`, `ruleKeys` and the per-tab help map in `components/help.tsx`. | sonnet-5-5 |
| [ ] | Flow: `packages/tui/src/copilot-flow.tsx` (on `use-flow.ts`, like `mcp-flow.tsx`) that calls `previewCopilot`, shows the preview with the all-projects note, confirms with `y` and calls `applyCopilot`; wire the share key in `components/{skills,inventory,agents,rules}-tab.tsx` (MCP rows only in `inventory-tab.tsx`, not hooks or plugins) and refresh the rows after. | sonnet-5-5 |
| [ ] | "Copilot in this repo": a line in `components/sidebar.tsx` (On or Off, from the trust state) and the repo-switch key from the four tabs, through the same flow with `trust` or `untrust`; footer short forms in `components/footer.tsx`. | sonnet-5-5 |
| [ ] | Tests: `packages/tui/src/test/tui-copilot.test.ts` (in process, fixture with and without `<ch>`, signed in or not) for column, keys, why-not, preview and write, switch; update `tui-widths.test.ts` and `tui-layout.test.ts` expectations only where the new column changes them. | sonnet-5-5 |

## Phase 4: Copilot in the web UI

**Value:** In `agentry ui`, the same four screens get a Copilot checkbox column and the sidebar a "Copilot in this
repo" switch, each opening the existing preview and confirm dialog; hidden without Copilot.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck`, `npm test` pass. Web tests show: no Copilot column or
switch without Copilot or sign-in; ticking a skill's checkbox shows the preview with the all-projects note and confirm
writes; a repo row's checkbox is disabled with its why-not as the tooltip; the switch trusts and untrusts; the help
dialog lists the new keys on each screen; `src/test/web-serve.test.ts` still passes (token, Host and Origin checks
cover the new procedures).

| Done | Task | Model |
|---|---|---|
| [ ] | Contract and server: `packages/web/src/contract/copilot.ts` (`state`, `preview`, `apply` procedures with zod input `{ action, kind?, name? }`), the typed Copilot state in `contract/load.ts` replacing `z.unknown()` with an additive schema, register in `contract/index.ts`, implement over `createData` in `src/server/router.ts`. | sonnet-5-5 |
| [ ] | Screens: a Copilot column (checkbox, disabled with the why-not as title) in `list-screen.tsx` used by `skills-screen.tsx`, `mcp-screen.tsx`, `agents-screen.tsx`, `rules-screen.tsx`, opening `preview-flow.tsx`; the switch in `app-sidebar.tsx`; the share and repo keys from Decision 1 in the screens' shortcuts and `help-dialog.tsx`; all text from `messages()` (`copilot`, `web.copilot`). | sonnet-5-5 |
| [ ] | Tests in `packages/web/src/test/` (`screens.test.tsx` and a new `copilot.test.tsx`): hidden without Copilot, checkbox preview and apply, disabled rows, switch, help dialog keys. | sonnet-5-5 |

## Phase 5: Docs, changelog, 0.7.0 and full verification

**Value:** The READMEs, guidance files, the agentry skill and the Copilot spec describe sharing and trust as shipped,
and the CLI is versioned 0.7.0, ready for the user to publish.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck`, `npm test`, `npm run pack:check` pass and
`node dist/bin/agentry.js --version` prints `0.7.0`. From the repo root: `node scripts/check-bundles.mjs && node --test
scripts/test/*.mjs`, `bash scripts/test/setup.test.sh`, `/bin/bash scripts/test/setup.test.sh` and
`node skills/skill-architect/scripts/validate.mjs skills/*/` pass. A manual pass of `agentry` and `agentry ui` in a temp
home with and without `<ch>` matches the docs. Nothing is published.

| Done | Task | Model |
|---|---|---|
| [ ] | `cli/README.md` (an `agentry copilot` section with the five subcommands, flags and exit codes; the new keys in the Skills, MCP, Agents and Rules key tables; the web column and switch; status JSON `copilot.signedIn` and `copilot.shared`) and `cli/CLAUDE.md` (the new core modules, the ported `jsonc-edit.ts`, the `copilot-shares.json` store next to the parked stores). | haiku-5-5 |
| [ ] | Root `README.md` and `CLAUDE.md` (agentry can share Claude user items with Copilot, by choice), `skills/agentry/SKILL.md` (Copilot questions: `agentry copilot status --json`; share, unshare, trust only after the user agrees), and `cli/docs/copilot-config-sources.md` (the `signedIn` field in the reader contract, any fact found while building, with its mark). No README cover change: no skill, agent, rule or guidance file is added. | haiku-5-5 |
| [ ] | `cli/CHANGELOG.md`: `## 0.7.0` above 0.6.0 (Copilot sharing for skills, agents, rules and MCP servers; trust per repo; TUI and web column and switch; status fields; doctor hints; "nothing changes unless you pick it"; no breaking change). Bump `"version"` to `0.7.0` in `cli/package.json` and the root entry of `cli/package-lock.json`. | haiku-5-5 |
| [ ] | Full run: every check in this phase's "Done when" and the manual pass, then log the result and the test count in the Decisions log. | sonnet-5-5 |

## Out of scope

- Anything automatic: no setup step, load path, doctor `fix` or background task shares, unshares, trusts or untrusts.
- Writing into users' repos (`.github/*`, `.claude/*`, `.mcp.json`) or other repos under `~/ws`.
- Sharing the user `CLAUDE.md` as `<ch>/copilot-instructions.md` (doctor keeps its hint), hooks, plugins and library
  skills that are not in `~/.claude/skills` (load them for all projects first).
- Copying from Copilot back to Claude, or syncing edits between the two.
- Setting `COPILOT_ALLOW_ALL`, `disabledMcpServers`, `disabledSkills`, or editing VS Code settings.
- Changing setup's `copilot` part or its manifest; a Copilot twin of `agentry shelf`.
- Publishing to npm or pushing to the remote.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-16 | Goal fixed with the user: agentry lets Copilot use Claude's user skills, agents, rules and MCP servers, but nothing happens automatically; the user picks per item and per repo, from the CLI, the TUI and the web UI. |
| 2026-11-16 | Reversed from `docs/agentry-copilot-plan.md` "Out of scope": "a per-repo `agentry copilot on/off` command" (now `agentry copilot trust` and `untrust`) and "Copilot views in the terminal UI and web UI" (now a column and a switch) are in scope. The pending Phase 0 work also reverses "Copilot wiring for context-mode" (setup's `copilot` part runs `context-mode setup --agents copilot-cli`). |
| 2026-11-16 | Two kinds of choice: per repo "Copilot in this repo" = the repo root in `trustedFolders` of `<ch>/config.json`; global "share with Copilot" = a link (skills, agents), a generated `.instructions.md` (rules) or a `${VAR}`-only entry in `<ch>/mcp-config.json` (MCP). Sharing applies to every repo and the UI says so. |
| 2026-11-16 | The brief says Copilot is "present" when `~/.copilot` exists and the CLI is signed in, but `present` in `inventory/copilot.ts` is only `existsSync(<ch>)` and all Copilot doctor rules gate on it. Kept `present` as is and added an additive `signedIn` (from `loggedInUsers` or `lastLoggedInUser` in `config.json`, values never copied); the UIs and `agentry copilot` show Copilot only when both are true. Ask the user if a signed-out Copilot should still see the CLI commands. |
| 2026-11-16 | All writes go through the existing fix engine (`createFix` with an injected `DoctorLike`, the `mcp-edit.ts` pattern), so preview, backup, verify and `agentry fix --undo` come for free; the only engine change is recording and undoing a created link without following it. Ownership lives in `<config dir>/agentry/copilot-shares.json` so unshare touches only what agentry wrote. |
| 2026-11-16 | The JSONC editor and the rule to instructions mapping are ported into core TS (`jsonc-edit.ts`, inside `copilot-share.ts`) because only `cli/` is packed; `scripts/lib/*.mjs` stays for setup. Two copies, both tested. |
| 2026-11-16 | `agentry doctor` keeps every finding message (fix-rules parse them); only the `fix` hints of `copilot-cannot-see` and `copilot-untrusted-hooks` change to name `agentry copilot share` and `trust`. |
| 2026-11-16 | Branching: `main`, phase by phase commits, staged by path, no attribution; Phase 0 commits the pending setup.sh and docs work first. Version 0.7.0; publishing is the user's. Models: haiku-5-5, sonnet-5-5, opus-5-5 (opus only for the share engine with undo and the MCP translation). |
| 2026-11-16 | `signedIn` reuses the inventory's existing `readJsonc` of `<ch>/config.json` instead of the ported `parseJsonc` (one read, no duplicate error). `jsonc-edit.ts` is used first by the trust module. |
| 2026-11-16 | Engine built (`copilot-share.ts`, additive `fix.ts`/`fix-undo.ts`): any link under `<ch>` goes through `run({ op: "link" or "unlink" })`, never a text fix (a text snapshot follows links); generated files use `write`/`delete`. `terms.shared`/`notShared` are lowercase like other terms; UI capitalises. A shared item hidden by a repo item stays `shared` with `repoWins: true`. Agent and rule names are top-level `.md` file names. Known limit: undoing an older share by explicit timestamp with `--force` after a later share can drop the later store record. |
| 2026-11-16 | MCP translation: a secret-looking arg becomes a whole-arg `${SERVER_ARG_n}` (so `--api-key=X` exports the flag too; the preview says so), `${VAR}` in `command`/`url` and any non-plain `${NAME}` are refused, only `type/command/args/env` (local) or `type/url/headers` (remote) are copied, setup ownership comes only from setup's `copilot` manifest part. `shareState` includes MCP items itself, so the facade must not pass them as `extra`. The user keeps secrets in `~/.zshenv`, so env placeholders resolve in terminal-launched Copilot. |
