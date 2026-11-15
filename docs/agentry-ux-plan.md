# agentry UX plan: clear words and one meaning per key

The terminal UI (TUI), web UI and CLI help use words that confuse people (shelf, group, global, project, turn on,
installed) and keys that mean different things per tab (`a`, `s`, `o`, `u`, `i`, `x`). This plan first moves every
user-facing string of both UIs into one shared messages module, then renames the words in that module, then redesigns
the keys, help and hints, and last updates the docs and ships 0.6.0. When it is done, a user reads the same small set of
words everywhere (Library, Bundle, This project, All projects, Loaded, Added), each key does one thing on every tab, and
`?` shows only the current tab's keys.

## How to use this plan

- One phase per coordinator session, in order. Tick a task's box (`[ ]` → `[x]`) in the commit that finishes it.
- Branching: work on the current branch, `main`. No new branches or worktrees. One commit per task (or per batch of
  rows), conventional message (`feat(cli): ...`, `refactor(cli): ...`, `docs: ...`), no AI attribution or
  `Co-Authored-By`. Never push unless the user asks. Never `npm publish`.
- **Uncommitted Copilot work is in the tree** (see `git status`: `cli/packages/core/src/doctor*.ts`, `fix-rules.ts`,
  `inventory/*`, `paths.ts`, `scan.ts`, `status.ts`, `types.ts`, `version.ts`, `cli/packages/tui/src/test/helpers/tui.tsx`,
  `cli/packages/web/src/contract/load.ts`, `cli/src/test/{doctor,fix,fix-undo,inventory,scan,scan-fix}.test.ts`,
  `cli/src/test/helpers/*`, `cli/CHANGELOG.md`, `cli/package.json`, `cli/README.md`, `cli/CLAUDE.md`, root `README.md`,
  `CLAUDE.md`, `scripts/*`, `global/*` and the untracked files). Never stash, checkout, restore, reset or revert it.
  Stage by explicit path only (`git add <file>`, never `git add -A` or `.`). If a task has to edit a file that already
  carries Copilot changes, stop and ask the user first (they may commit the Copilot work before you continue), because
  a path-level `git add` would commit their hunks too.
- **Model column:** haiku-5-5 mechanical (docs of shipped behaviour, changelog, version bump), sonnet-5-5 normal
  implementation. No opus-5-5 rows: the module shape, glossary and keymap are fixed in this plan, so no task carries a
  costly hard-to-review spec decision.
- **The coordinator runs on sonnet-5-5 and never switches model** (the prompt cache is per model). sonnet-5-5 rows run
  inline.
- **haiku-5-5 rows run as subagents** with the Agent tool's `model` set. The brief must stand alone: task row, files,
  the phase's "Done when" checks and the glossary table. The coordinator reviews the diff, runs the checks below, then
  ticks the box.
- **Batch:** consecutive haiku-5-5 rows on nearby files go to one subagent; a lone one-file haiku-5-5 row runs inline.
  Subagents on the same files run one after another.
- A task runs in its own session (`start_session` with `model`, or `claude --model <id>`) only if the user wants to
  steer it.
- **Checks after every task** (from `cli/`): `npm run check && npm run typecheck && npm test`. One package while
  iterating: `npx vitest run --project tui` (or `cli`, `core`, `web`). Every phase ends with all three green.
- Ask before going beyond a phase's tasks. Log decisions and surprises in "Decisions log".

## Ground rules

- Runtime: Node 22, TypeScript strict (`nodenext`, `.js` relative specifiers), Ink 8 TUI, TanStack Start + React web UI,
  vitest, Biome (Ultracite). Workspace root is `cli/`; one `npm install` there.
- Layout: the messages module lives in core so both UIs can import it: `cli/packages/core/src/messages.ts` (types,
  `messages(locale)`) and `cli/packages/core/src/messages/en.ts` (the English object). Core's `exports` is `"./*":
  "./src/*.ts"`, so it is importable as `@agentry/core/messages` with no package.json change. Core stays React- and
  Ink-free; tui and web import `@agentry/core/*` only (Biome `noRestrictedImports` in `cli/biome.jsonc`).
- Where the words live today:
  - TUI: `packages/tui/src/rows.ts` (row labels, column headers, details, `skillKeys` L81-120, `catalogKeys` L353-381,
    `ruleKeys`, `agentKeys`, `backupKeys`, `mcpKeys` L694-714, `hookKeys` L717-729, `pluginKeys` L879-886,
    `DOCTOR_KEYS` L932-936, `whyFixed` L146-156, `catalogToggle` L390-409, `MCP_WHY`, `HOOK_WHY`),
    `packages/tui/src/theme.ts` (`SCOPE_NAMES` maps `user` to "global"), `components/help.tsx` (`KEYS`, one list of
    150-char sentences, truncated), `components/footer.tsx`, `components/sidebar.tsx` (section labels LIBRARY,
    DISCOVER, HEALTH), `components/{skills,catalog,inventory,backups,rules,doctor,agents}-tab.tsx` (`notify(...)` text,
    key handlers), `move-flow.tsx`, `mcp-flow.tsx`, `plugin-flow.tsx`, `remove-flow.tsx`, `bulk-flow.ts`, `hook-flow.tsx`.
  - Web: `packages/web/src/components/help-dialog.tsx` (`KEYS`), `app-sidebar.tsx` (scope switcher "Global / This
    project", groups Library/Discover/Health), `skills-screen.tsx` (hint line L397, shortcuts L206-233: `s` shelve,
    `x`, `m` mark, `a` mark all), `catalog-screen.tsx` ("Installed"), `agents-screen.tsx`, `rules-screen.tsx`,
    `mcp-screen.tsx`, `hooks-screen.tsx`, `plugins-screen.tsx`, `backups-screen.tsx` (each has a `hint=` line),
    `lib/skill-rows.ts` (status labels "Global + project", "Global", "This project", "Shelf"; filters).
  - Core text the UIs show: `packages/core/src/shelf.ts` (dry-run and move previews, errors such as `No group ...`),
    `catalog.ts` (add/update/remove previews), `mcp-edit.ts`, `mcp-toggle.ts`, `hook-toggle.ts`, `plugin-*.ts`.
  - CLI help: `cli/src/bin/agentry.ts` (usage text L39-197, `SHELF_USAGE` L199).
- Keep unchanged (no breaking change): the folder `~/.claude/skill-shelf/<group>/`, the `agentry shelf` command and its
  subcommands (`on`, `off`, `shelve`, `unshelve`, `promote`, `demote`, `remove`), positional args, flags (`--global`,
  `--group`, `--project`, `--scope user|project|local`), JSON field names (`group`, `global`, `scope: "user"`) in
  `shelf list --json`, `status --json` and the web oRPC contract (`packages/web/src/contract/*`), internal identifiers
  (`kind: "group"`, `shelved`, `Scope = "global" | "project"` in `lib/scope.tsx`). Unrelated "group" uses stay: shadcn
  `components/ui/sidebar.tsx`, `core/hook-toggle.ts`, sidebar section groups.
- Testing: tests never touch the real home; `src/test/helpers/fixture.ts` and `fake-claude.ts` build temp `HOME`,
  `AGENTRY_HOME` and `CLAUDE_CONFIG_DIR`. TUI tests run in process (`packages/tui/src/test/`, helper `helpers/tui.tsx`)
  or spawn the built CLI (`src/test/tui-*.test.ts`, `tui-pty.test.ts`); `npm test` builds `dist/` first.
- Safety: this plan changes text and key bindings only. No write path, backup path or file format changes. Every write
  keeps its preview and `y` confirm.
- Facts to check before coding: Ink `useInput` reports `*` as `input === "*"`; the web `KeyboardEvent.key` for `*` is
  `"*"` (shift is fine, `use-shortcuts.ts` only drops meta, ctrl and alt). Verify both with a test, not memory.

## Glossary (user-visible text only)

| Old word | New word | Notes |
|---|---|---|
| Shelf, the shelf, shelf group | Library | UI only. Folder `~/.claude/skill-shelf` and command `agentry shelf` keep their names; CLI help descriptions may say "library". |
| group (shelf folder) | Bundle | One word for the shelf folder and the `bundles.tsv` topic. JSON `group` fields and `--group` stay. |
| shelve (move onto the shelf) | Move to library | |
| unshelve | Move out of library (to all projects) | |
| Global, global, User (scope) | All projects | Skills, MCP, Hooks, Plugins, Rules, Agents. Flag values `--scope user` stay. |
| Project (scope), project | This project | |
| on / off, turn on / turn off (skills only) | Loaded / Not loaded | Skills say what happens. MCP, hooks and plugins keep on/off and the ● ○ marks. |
| project on/off, global on/off (keys) | load here, load everywhere | footer and help |
| installed (catalog) | Added | "installed" stays for Claude Code plugins. |
| not installed (catalog) | Not added | |
| add to shelf (catalog skill) | Add to library | |
| add (all projects) / add to this project (agent, MCP) | Add to all projects / Add to this project | |
| add (rule, CLAUDE.md) | Add to all projects (~/.claude/rules) / Add as this project's CLAUDE.md | rules and CLAUDE.md say where they go |

## Keymap (Phase 3 target)

| Key | Meaning on every tab | Footer text per tab |
|---|---|---|
| `a` | add or install | MCP "add server", Catalog "add" (agent and MCP open a two-choice menu: all projects, this project), Plugins "install plugin" |
| `x` | remove, a copy is kept in the backups | "remove (copy kept)"; Plugins "uninstall"; MCP and Hooks "remove (undo: fix --undo)" |
| `X` | remove, no copy kept | "delete (no copy)"; Backups delete moves here from `x` |
| `u` | undo, restore or update, named per tab | Doctor "undo last fix", Backups "restore", Catalog "update" |
| `m` | move (opens a short menu) | Skills only: "move" with All projects, This project only, Library (the options that apply to the row); replaces `s`, `a`, `o` and unshelve `u` |
| `*` | mark or unmark the row (was `m`) | marks are drawn as `*` already; `esc` clears marks (was `M`) when no search is active |
| `space` | load or unload (skills), on or off (MCP, hooks, plugins) | Skills "load here", MCP and Hooks "turn off" or "turn on" |
| `g` | Skills: load in all projects | "load everywhere" |
| `s` | MCP only: edit env and args | "edit env/args" |
| `d` | Backups only: delete backups 30+ days old | unchanged |
| `e`, `f`, `/`, `r`, `p`, `?`, `q`, `tab`, `y`, `n`, `c` | unchanged | |

`i` and `o` are freed. Pressing a removed key (`s`, `o`, `i` outside MCP) shows a one-line notice naming the new key for
one release, then the notice can go.

## Decisions to make

These have a default the phases use; the user can change any before its phase starts.

1. **`m` clash (Phase 3).** Default: `m` opens the move menu and marking moves to `*` (matches the mark glyph), with
   `esc` clearing marks. Alternative: keep `m`/`M` for marks and put the move menu on `v`. Web follows the same choice;
   its "mark all" key (`a`, clashes with add) goes away and the header checkbox stays for select-all.
2. **Sidebar heading "Library" collides with Shelf → Library (Phase 2).** The TUI rail group `LIBRARY` and the web
   sidebar group `Library` hold Skills, MCP, Hooks, Plugins, Rules, Agents. Default: rename that heading to `Setup`
   (`SETUP` in the TUI), so "Library" means only the opt-in skill folder. Alternative: `Config`.
3. **`bundle` alias in JSON and flags (Phase 2).** Default: add a `bundle` field next to `group` in `shelf list --json`
   only (one line in `core/shelf.ts`), no change to the web contract, and no `--bundle` flag (the `--group` description
   says "bundle"). Alternative: also accept `--bundle` as an alias of `--group` in `catalog add` and `shelf shelve`.
4. **Skills state column width (Phase 2).** "This project" and "All projects" are 12 characters; the Skills state cells
   are 9 wide (`skillCells` in `rows.ts`). Default: widen both to 12 if `tui-widths.test.ts` and `tui-layout.test.ts`
   still fit at their narrowest width; otherwise headers "Here" and "Everywhere" with the full words in the details.

## Phase 1: Shared messages module

**Value:** Every label, key hint, help line, column and filter name, status line and preview or confirm text of both
UIs comes from one typed module, so a later rename or a second language is one file edit. Nothing a user sees changes
yet. About half a day.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck` and `npm test` pass with no existing test file
changed; `git diff --stat -- cli/src/test cli/packages/*/src/test` is empty and `git status` shows only two new test
files there, `packages/core/src/test/messages.test.ts` and `src/test/messages-guard.test.ts`; the guard test fails
when a new string literal is added to a JSX text node or a `KeyHint` tuple in tui or web (try it, then revert);
`grep -rn '"[A-Za-z][^"]* [a-z]' cli/packages/tui/src/rows.ts` shows only allow-listed literals.

| Done | Task | Model |
|---|---|---|
| [x] | Baseline: from `cli/` run `npm run check`, `npm run typecheck`, `npm test` on the current tree (with the Copilot work) and record pass/fail in the Decisions log. If anything is red, stop and tell the user; do not fix Copilot code. | sonnet-5-5 |
| [x] | Create `cli/packages/core/src/messages/en.ts` and `cli/packages/core/src/messages.ts`. `en.ts` exports `en` as a plain object: `terms` first (library, bundle, thisProject, allProjects, loaded, notLoaded, added, notAdded, and today's words as their values, e.g. `library: "shelf"`, `allProjects: "global"`), then sections per area (`keys`, `help`, `skills`, `catalog`, `mcp`, `hooks`, `plugins`, `rules`, `agents`, `backups`, `doctor`, `sidebar`, `flows`, `core`). Every other string is built from `terms` by template, and any message with a value is a function (`removeCopyKept(name)`, `skillsCount(n)`). `messages.ts` exports `type Messages = typeof en`, `const locales = { en } satisfies Record<string, Messages>`, `type Locale = keyof typeof locales` and `messages(locale: Locale = "en"): Messages`. Header comment lists the caveats: plurals are per-message functions (no plural rules yet), word order lives inside each function (never concatenate translated parts), and TUI column widths are fixed so a longer word needs a width check. No i18n library, no React or Ink import. Add `packages/core/src/test/messages.test.ts`: every leaf is a string or function returning a string, and no value is empty. | sonnet-5-5 |
| [x] | Migrate TUI key hints and help: `skillKeys`, `catalogKeys`, `ruleKeys`, `agentKeys`, `BACKUPS_KEYS`, `backupKeys`, `mcpKeys`, `hookKeys`, `pluginKeys`, `DOCTOR_KEYS` in `packages/tui/src/rows.ts`, `KEYS` and the legend lines in `components/help.tsx`, `TABS`/`HELP` in `components/footer.tsx`. Same English, byte for byte. | sonnet-5-5 |
| [x] | Migrate TUI row text in `packages/tui/src/rows.ts` (section headers, column headers, details lines, `whyFixed`, `catalogToggle`, `MCP_WHY`, `HOOK_WHY`, `PLUGIN_NOTE`, empty-state rows, token total) and `SCOPE_NAMES` in `theme.ts`, plus sidebar labels in `components/sidebar.tsx`. Same English. | sonnet-5-5 |
| [x] | Migrate TUI notices and flow text: every `notify(...)`, `title`, `intro`, `done` and option label in `components/{skills,catalog,inventory,backups,rules,doctor,agents}-tab.tsx`, `move-flow.tsx`, `mcp-flow.tsx`, `plugin-flow.tsx`, `remove-flow.tsx`, `hook-flow.tsx`, `bulk-flow.ts`, `use-flow.ts`, `components/picker.tsx`. Same English. | sonnet-5-5 |
| [x] | Migrate web text: `help-dialog.tsx` `KEYS` and dialog copy, every `hint=` line and filter/segment label in `{skills,catalog,agents,rules,mcp,hooks,plugins,backups,doctor}-screen.tsx`, `app-sidebar.tsx` (scope switcher, group labels), `lib/skill-rows.ts` status labels, preview and confirm titles (`preview-flow.tsx`, screens' `title:`), button labels ("Turn on", "Add back", "Installed"). Leave `components/ui/*` alone. Same English. | sonnet-5-5 |
| [x] | Migrate the core text the UIs show: user-facing preview, done and error strings in `packages/core/src/shelf.ts`, `catalog.ts`, `mcp-edit.ts`, `mcp-toggle.ts`, `hook-toggle.ts`, `plugin-install.ts`, `plugin-toggle.ts`, `backups.ts` (read the `messages().core` section). Skip files carrying Copilot changes (`doctor*.ts`, `fix-rules.ts`, `scan.ts`, `status.ts`) and skip debug or internal errors. Same English. | sonnet-5-5 |
| [x] | Guard against new literals: one file, `cli/src/test/messages-guard.test.ts` (cli project, so no package.json or lockfile change), reads the non-test `.ts`/`.tsx` files of `packages/tui/src` and `packages/web/src` with `node:fs` and line-based regexes (no compiler import: the repo's `typescript` is 7.x and root-only) and fails on JSX text containing a letter, and on a string literal of two or more words in a `KeyHint` tuple, `notify(...)`, or a `title`/`intro`/`done`/`label`/`hint`/`details` property or prop, except entries in a short allow list at the top of the test (paths, glyphs, key names such as `"space"`). Skip `components/ui/`. | sonnet-5-5 |

## Phase 2: Words and labels

**Value:** Users read Library, Bundle, This project, All projects, Loaded and Added in the TUI, the web UI and CLI help,
the same word for the same thing everywhere. Keys are unchanged.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck`, `npm test` pass. `node dist/bin/agentry.js --help`
says "library" and "bundle" in descriptions and still lists `shelf` and `--group`. `node dist/bin/agentry.js shelf list
--json` keeps its `group` field. `grep -rn -i -E 'shelf|global' cli/packages/core/src/messages/en.ts` matches only paths
(`skill-shelf`, `~/.claude`) and command names. A manual run of `agentry` and `agentry ui` in a temp project
shows no "Shelf", "Global", "group" or "installed" (except Plugins) on Skills, Catalog, MCP, Plugins, Rules and Agents.

Test files that assert these words, by area (update their literals or import `messages()` where the text is a message):

- CLI commands (`cli/src/test/`): `shelf.test.ts`, `shelf-scope.test.ts`, `catalog.test.ts`, `catalog-kinds.test.ts`,
  `backups.test.ts`, `plugin-install.test.ts`, `mcp-toggle.test.ts`, `hook-toggle.test.ts`, `web-serve.test.ts`,
  `doctor.test.ts` (Copilot-modified: ask before editing).
- TUI spawned (`cli/src/test/`): `tui-shelve.test.ts`, `tui-scope-move.test.ts`, `tui-layout.test.ts`,
  `tui-widths.test.ts`, `tui-mcp.test.ts`, `tui-mcp-edit.test.ts`, `tui-hooks.test.ts`, `tui-catalog.test.ts`,
  `tui-catalog-kinds.test.ts`, `tui-plugin-install.test.ts`, `tui-copy.test.ts`, `tui-icons.test.ts`,
  `tui-backups.test.ts`.
- TUI in process (`cli/packages/tui/src/test/`): `tui-app.test.ts`, `tui-search-bulk.test.ts`, `tui-sidebar.test.ts`,
  `tui-plugins.test.ts`, `tui-colour.test.ts`.
- Web (`cli/packages/web/src/test/`): `skills.test.tsx`, `shell.test.tsx`, `router.test.ts`, `screens.test.tsx`.

| Done | Task | Model |
|---|---|---|
| [ ] | Apply the glossary in `cli/packages/core/src/messages/en.ts`: set `terms` to the new words and fix every message whose sentence no longer reads well (articles, "on the shelf" → "in the library", "unshelve" → "move out of library"). Resolve Decisions 2 and 4 first (sidebar heading, column width) and log them. | sonnet-5-5 |
| [ ] | TUI Skills tab words: headers "Library" (was Shelf) with columns "Skills", "Cost", "This project", "All projects"; sections "All projects (~/.claude/skills)", "This project only (.claude/skills)", "Plugin skills"; skill state cells and details say "loaded" and "not loaded" instead of on and off (a skill-only badge in `rows.ts`, `badgeText` stays for MCP, hooks and plugins); token total lines say "in all projects". Widen `skillCells` state columns per Decision 4. Update the TUI test files listed above for the Skills tab. | sonnet-5-5 |
| [ ] | TUI other tabs: `SCOPE_NAMES.user` becomes "all projects" (MCP, Hooks, Plugins scope badges), Rules and Agents section titles "All projects" and "This project", Catalog column and details say "added" / "not added" and show where an added item lives (library, this project, all projects) and its bundle, catalog section headers "<name> bundle" stay. Sidebar heading per Decision 2. Update the matching TUI tests. | sonnet-5-5 |
| [ ] | Web words: scope switcher "All projects" / "This project" in `app-sidebar.tsx` (value strings `global`/`project` stay), `lib/skill-rows.ts` labels ("Loaded in all projects", "Loaded in this project", "Not loaded"; filter "Library" or "Not loaded"), Library and Bundle on `skills-screen.tsx` (the move dialog's group field becomes "Bundle"), "Added" on `catalog-screen.tsx`, "All projects" on agents, rules and MCP screens. Update `skills.test.tsx`, `shell.test.tsx`, `router.test.ts`, `screens.test.tsx`. | sonnet-5-5 |
| [ ] | CLI help and core text: in `cli/src/bin/agentry.ts` usage and `SHELF_USAGE`, describe shelf groups as library bundles and `--global` as "all projects (~/.claude)", keeping every command, flag and example as is; core messages from `shelf.ts` and `catalog.ts` read "bundle" and "all projects". Add the `bundle` alias per Decision 3. Update `shelf.test.ts`, `shelf-scope.test.ts`, `catalog.test.ts`, `catalog-kinds.test.ts` and the other CLI tests listed above. | sonnet-5-5 |

## Phase 3: Shortcuts, help and hints

**Value:** Each key means one thing on every tab, the footer says what `x` and `X` do in words, `?` shows only the
current tab's keys, and a row that cannot be loaded or toggled says why before any key is pressed.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck`, `npm test` pass. New tests cover: `m` opens the move
menu on Skills rows with only the options that apply; `*` marks and `esc` clears marks; `a` adds on Catalog (with the
all projects / this project menu for agents and MCP), MCP and Plugins; `X` deletes on Backups; pressing `s`, `o` or `i`
on a tab where it no longer works shows the "now press ..." notice; `?` on Skills lists no Catalog or Backups keys and
every help line fits 80 columns; the web help dialog lists the current screen's keys. A manual pass of `agentry` and
`agentry ui` over all nine sections matches the Keymap table.

Test files that press the changed keys (from `grep -rn 'press("[aiosuxXmMdg]"' cli/src/test cli/packages/*/src/test`):
`tui-scope-move.test.ts` (`a`, `o`, `s`), `tui-shelve.test.ts` (`s`, `u`, `x`), `tui-catalog.test.ts` and
`tui-catalog-kinds.test.ts` (`i`, `o`, `u`, `x`, `X`), `tui-plugin-install.test.ts` (`i`, `x`), `tui-mcp-edit.test.ts`
(`a`, `s`), `tui-copy.test.ts` (`s`), `tui-backups.test.ts` (`u`, `x`, `d`), `tui-hooks.test.ts` (`x`),
`packages/tui/src/test/tui-search-bulk.test.ts` (`m`, `M`, `x`), `tui-app.test.ts` (`g`, `u`), web `skills.test.tsx`
(space, `x`) and `screens.test.tsx` (`x`, `u`, `d`).

| Done | Task | Model |
|---|---|---|
| [ ] | Resolve Decision 1 and log it. Marking: in `packages/tui/src/use-list.ts` move mark from `m` to `*` and clear from `M` to `esc` (after the search-clear branch); update the mark hints and `tui-search-bulk.test.ts`. | sonnet-5-5 |
| [ ] | Skills move menu: in `components/skills-tab.tsx` replace the `s`, `a`, `o` and unshelve `u` branches with `m`, which opens a picker (reuse `components/picker.tsx` or the flow `options` step) listing only the moves that apply to the row (library skill: all projects; all-projects folder: library, this project only; project-only folder: library, all projects), each then running the existing `startShelve`, `startUnshelve` or `startScopeMove` preview. Library moves keep asking for the bundle. Update `skillKeys` and `tui-scope-move.test.ts`, `tui-shelve.test.ts`, `tui-copy.test.ts`, `tui-app.test.ts`. | sonnet-5-5 |
| [ ] | Add and remove keys across tabs: Catalog `i` → `a`, and `o` folds into `a` as a two-option menu (all projects, this project) for agents and MCP servers (`components/catalog-tab.tsx`, `catalogKeys`); Plugins `i` → `a` (`components/inventory-tab.tsx`, `pluginKeys`); Backups delete `x` → `X` (`components/backups-tab.tsx`, `backupKeys`); bulk keys follow (`i` → `a`). Footer text names `x` "remove (copy kept)" and `X` "delete (no copy)" with no short form dropping the words. Pressing a retired key (`s` off MCP, `o`, `i`) shows one notice naming the new key. Update the catalog, plugin-install and backups tests listed above. | sonnet-5-5 |
| [ ] | Name `u` per tab in the footer and help ("undo last fix" on Doctor, "restore" on Backups, "update" on Catalog) and make the footer short forms keep the verb (`components/footer.tsx` `shortForm`; the `KeyHint` third field). Update `tui-widths.test.ts` and `tui-layout.test.ts` if footers change width. | sonnet-5-5 |
| [ ] | Per-tab help: replace the single `KEYS` list in `components/help.tsx` with a map from tab to `[key, one-line description]` (from the messages module), plus a short shared block (`tab`, `←/→ 1-9`, `/`, `*`, `e`, `y/n`, `r`, `p`, `?`, `q`). `app.tsx` passes the current tab to `<Help>`. Each line fits 80 columns with no truncation. Add a test in `packages/tui/src/test/tui-app.test.ts`. | sonnet-5-5 |
| [ ] | Why-not hint before pressing: when the selected row has `why` (all-projects folder, project-only folder, plugin skill, plugin MCP server, plugin hook, symlink skill), show it as the dim status line under the list (`components/list.tsx` `status`, set from `skills-tab.tsx` and `inventory-tab.tsx`) and as the first details line, worded with the new keys (for example "Folder in ~/.claude/skills, loaded in all projects. m moves it to the library or this project."). Test it in `tui-app.test.ts` or `tui-plugins.test.ts`. | sonnet-5-5 |
| [ ] | Web keys and help: in `skills-screen.tsx` drop `s` and `a` (mark all), add `m` move dialog and `*` mark per Decision 1; Plugins `i` → `a` in `plugins-screen.tsx`; Backups delete on `X`; update every `hint=` line from the messages module; make `help-dialog.tsx` show the current route's keys (read the route in `app-shell.tsx` and pass it). Update `skills.test.tsx`, `screens.test.tsx`, `shell.test.tsx`. | sonnet-5-5 |

## Phase 4: Docs, changelog and 0.6.0

**Value:** The README files, design docs and the agentry skill use the same words and keys as the UIs, and the CLI is
versioned 0.6.0 with a changelog entry, ready for the user to publish.
**Done when:** From `cli/`: `npm run check`, `npm run typecheck`, `npm test`, `npm run pack:check` pass and
`node dist/bin/agentry.js --version` prints `0.6.0`. From the repo root: `node scripts/check-bundles.mjs && node --test
scripts/test/`, `bash scripts/test/setup.test.sh`, `/bin/bash scripts/test/setup.test.sh`,
`sh scripts/test/trail-autobuild.test.sh` and `node skills/skill-architect/scripts/validate.mjs skills/*/` pass.
`grep -n -i -E '\bshelf group|global on|unshelve key|press i ' cli/README.md README.md cli/docs/web-ui-design.md` finds
nothing stale. Nothing is published.

| Done | Task | Model |
|---|---|---|
| [ ] | `cli/README.md` and `cli/CLAUDE.md`: TUI and web sections use the glossary and the Keymap table (one key table per tab, `*` marks, `m` move), mention `@agentry/core/messages` and the guard tests in the layout and conventions; command docs keep `agentry shelf`, `--global`, `--group` with "library", "bundle", "all projects" in descriptions. Both files carry Copilot edits: ask the user before editing. | haiku-5-5 |
| [ ] | Root `README.md` and `CLAUDE.md` (Copilot edits: ask first), `cli/docs/web-ui-design.md` (scope switcher, state legend, keys bar), and `skills/agentry/SKILL.md` line 29 ("Turning shelf skills on or off" → "Loading library skills": the command stays `agentry shelf on`/`off`). No README cover regeneration: title, tagline and components do not change. | haiku-5-5 |
| [ ] | `cli/CHANGELOG.md`: add `## 0.6.0` above 0.5.0 with the new words (glossary summary), the new keys (`a`, `x`/`X`, `u` names, `m` move, `*` mark, per-tab help, why-not hints), the messages module, and "no JSON, flag or folder changes" (plus the `bundle` alias if added). Bump `"version"` to `0.6.0` in `cli/package.json` and `cli/package-lock.json` (both carry Copilot edits: ask first). Do not run `npm publish`. | haiku-5-5 |
| [ ] | Full run: every check in this phase's "Done when", a manual pass of `agentry` (all nine sections, `?` on each) and `agentry ui`, then log the result in the Decisions log. | sonnet-5-5 |

## Out of scope

- Renaming the `agentry shelf` command, its subcommands, flags, the `~/.claude/skill-shelf` folder, JSON fields or the
  web contract.
- Restructuring or merging tabs, or changing what any write does (backups, previews, confirms stay as they are).
- A second locale, an i18n library, plural rules or a language switch in the UI.
- Moving CLI `--help` text into the messages module (possible later step), and doctor finding messages.
- Configurable key bindings, mouse support, new features in any tab.
- Publishing to npm or pushing to the remote.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-15 | Phase 1 slips: the skeleton commit also carried the staged deletion of `rules/commit-attribution.md`, and the web commit carried the one-line Copilot change in `web/src/contract/load.ts`. Both were already intended work; later tasks stage by explicit path. |
| 2026-11-15 | Baseline before Phase 1: check, typecheck and 621 tests green on the tree with the Copilot work. |
| 2026-11-15 | Vocabulary fixed by the user: Bundle for both shelf group and bundles.tsv topic; Shelf → Library in the UI (folder and `agentry shelf` keep names); Global and User → All projects, Project → This project; skills use Loaded / Not loaded, MCP, hooks and plugins keep on/off; catalog "installed" → Added (plugins keep "installed"). |
| 2026-11-15 | JSON and web contract keep `group`; positional args and flag values unchanged. |
| 2026-11-15 | Shortcuts: one meaning per key (`a` add, `x` remove with copy, `X` no copy, `u` named per tab, move menu, `space` load or on/off, `g` all projects); `?` shows the current tab only; why-not hint visible before pressing. |
| 2026-11-15 | A shared messages module comes first (`@agentry/core/messages`, `terms` object, typed keys, functions for values, `en` default locale as a plain object, no i18n library), migrated with no visible text change; the renaming phase then edits mostly that file. Tests keep literal strings in Phase 1 so they prove nothing changed. |
| 2026-11-15 | Work on `main`, no branches or worktrees; stage by path; never touch the uncommitted Copilot work; ask before editing a file that carries it. Version 0.6.0, not published. |
