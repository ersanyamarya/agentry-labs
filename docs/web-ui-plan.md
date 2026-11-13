# agentry web UI

`agentry ui` gets a local web UI built with TanStack Start, shadcn and an oRPC contract. It does everything the Ink TUI
does, across all eight sections: Skills, MCP, Hooks, Plugins, Rules, Catalog, Doctor and Backups. First the CLI is split
into npm workspaces under `cli/` (`packages/core`, `packages/tui`, `packages/web` and the CLI entry), so the TUI and the
web app share one core. Both UIs then use the same left-rail sidebar. When every phase is done, the single published
package `@ersanyamarya/agentry-cli` ships the built web app. `agentry ui` serves it on `127.0.0.1` behind a per-launch
token, and every write goes through the same backup-first functions the TUI uses.

**Design source:** `cli/docs/web-ui-design.md` is the committed design spec. Its sections are Decisions, Tokens, Layout,
Server and security, and Packaging. Every UI task names the section it builds from. Read that section before coding,
and do not restyle anything the file already decides. The private canvas it links to is reference only; when they
differ, the file wins.

## How to use this plan

- One phase per coordinator session, in order. Tick a task's box (`[ ]` → `[x]`) in the commit that finishes it.
- Branching: one branch per phase, `web-ui/phase-<n>`, cut from `main`. When the phase's Done when checks pass, ask the
  user, then squash-merge it into `main` as one commit. Never push unless asked. Commit messages and PR text carry no AI
  attribution (no `Co-Authored-By`, no "Generated with").
- **Model column:** claude-haiku-5-5 for mechanical work, claude-sonnet-5-5 for normal implementation.
  claude-opus-5-5 is used only for these rows:
  - Phase 1, workspace and boundary design: cross-cutting design that every later phase builds on. It must also settle
    how one published package carries unpublished workspace code, and that choice is expensive to redo.
  - Phase 3, `agentry ui` server and security model: security-sensitive. It covers the token, the cookie, the Host and
    Origin checks, and the loopback-only bind.
  - Phase 3, oRPC contract shape and router over core: a spec every web screen in Phases 3-6 builds on, and it
    carries write calls that edit user files.
- **The coordinator runs on claude-sonnet-5-5 and never switches model** (the prompt cache is per model).
  claude-sonnet-5-5 rows run inline.
- **claude-haiku-5-5 and claude-opus-5-5 rows run as subagents**, with the Agent tool's `model` set. The brief must
  stand alone: the task row, the files, the phase's "Done when" check, the design-file section it builds from, and, for
  claude-opus-5-5, its reason. The coordinator reviews the diff, runs
  `cd cli && npm run check && npm run typecheck && npm test`, then ticks the box.
- **Batch:** consecutive claude-haiku-5-5 rows on nearby files go to one subagent. A lone one-file claude-haiku-5-5 row
  runs inline. Subagents that touch the same files run one after another.
- A task runs in its own session (`start_session` with `model`, or `claude --model <id>`) only if the user wants to
  steer it.
- In Phases 4, 5 and 6, the screen rows of one phase share only the route folder and may run in parallel. Ask the user
  before creating a worktree.
- Ask before going beyond a phase's tasks. Log decisions and surprises in "Decisions log".

## Ground rules

- **Runtime:** Node `>=22`, ESM with `.js` import specifiers, and strict TypeScript (`typescript ^7`;
  `tsconfig.json` plus `tsconfig.build.json`). Ink `^8` with React `^19`, vitest `^5`, and Biome `^2` extending
  Ultracite. These versions come from `cli/package.json`; use them, not older numbers. No `any` outside tests.
- **Layout after Phase 1:**
  - `cli/package.json` stays the published CLI package and gains `"workspaces": ["packages/*"]`.
  - `cli/src/bin/agentry.ts` stays the router.
  - `cli/packages/core` holds today's `src/lib`, plus the Ink-free facade `src/tui/data.ts`.
  - `cli/packages/tui` holds today's `src/tui`.
  - `cli/packages/web` is the TanStack Start app, added in Phase 3.
  - Boundaries: core imports no UI code (no `react`, `ink` or `@tanstack/*`). `tui` and `web` import `core` only and
    never each other.
- **Stack for `packages/web`** (copy patterns from `gentlemans-stack`, read-only):
  - `apps/todo-ui`: `vite.config.mts` with `tanstackStart()`, `@vitejs/plugin-react` and `@tailwindcss/vite`; plus
    `src/router.tsx`, `src/routes/__root.tsx`, `src/server.ts` and `src/lib/orpc.ts`.
  - `ui-libs/design-system`: `components.json` (style `new-york`, lucide icons, `@/components/ui` alias) and
    `src/components/ui/*`.
  - `libs/contract-kit` and `contracts/todo-contracts`: oRPC contract style.
  - Do not copy Nx, Docker, Mongo, paraglide/i18n or the `catalog:` dependency protocol (npm workspaces have no
    catalogs; pin versions).
- **Testing:** vitest everywhere. The CLI subprocess tests spawn the built `dist/bin/agentry.js`, which
  `src/test/helpers/build.ts` builds once.
  - Tests never touch the real `~/.claude`. They use `src/test/helpers/fixture.ts` and `paths.ts` to set
    `AGENTRY_HOME` and `CLAUDE_CONFIG_DIR` to temp dirs. The web server tests do the same.
  - Web components are tested with Testing Library on jsdom. Server routes are tested by calling the fetch handler with
    `Request` objects.
  - The 461 existing tests stay green in every phase. Where tests move, the total only grows.
- **Safety:**
  - Every write (settings, `.mcp.json`, skills, `~/.claude.json`, rules) goes through the core function the TUI already
    calls, which backs up first. The web never writes files itself.
  - Preview/apply pairs stay pairs. The web shows the preview text and needs an explicit confirm before apply.
  - Secrets are never sent to the browser unmasked. Use `mask.ts` in core, the same as the CLI.
  - The server binds `127.0.0.1` only.
- **Behaviour first** (`cli/CLAUDE.md`): moving code must not change control flow. A behaviour change to an existing
  command is its own reviewed task with its own tests and CHANGELOG line.
- **Facts to verify before coding** (Context7 first, then the reference repo):
  - TanStack Start's production build output and the shape of its server entry (`default.fetch` or something else),
    and whether `agentry ui` can wrap it in a `node:http` server without nitro.
  - How to mount an oRPC handler on a TanStack Start server route (`@orpc/server` fetch adapter).
  - `@orpc/tanstack-query` usage.
  - shadcn CLI init for Tailwind v4.
  - npm workspaces with `bundleDependencies`, and how a bundler (tsdown or esbuild) handles `renames.json`, which is
    read at runtime.
  - TypeScript 7 project-reference behaviour.
- **Docs to update** when commands, layout, build or test steps change: `cli/README.md`, `cli/CLAUDE.md`, the
  architecture block in the root `CLAUDE.md`, and `cli/CHANGELOG.md`.

## Phase 1: Workspaces and packages/core, no behaviour change

**Value:** The logic both UIs need lives in one package with an enforced boundary, so the web app can call it without
touching the TUI. Users see no change.
**Done when:** `cd cli && npm install && npm run check && npm run typecheck && npm test` passes with at least 461
tests. Deliberately importing `ink` from a core file fails the boundary check, shown once and reverted. `npm pack
--dry-run` lists a tarball that `npm install -g ./<tarball>` installs into a temp prefix, and `agentry status --json`
works from that install. `cli/docs/web-ui-design.md` is tracked in git.

| Done | Task | Model |
|---|---|---|
| [x] | Commit the untracked `cli/docs/web-ui-design.md` as-is on the phase branch, so it is the committed design source every UI phase points at. | claude-haiku-5-5 |
| [x] | Design the workspace layout and write it into this plan's Decisions log and `cli/CLAUDE.md`. Cover four things. (1) Package names (`@agentry/core`, `@agentry/tui`, `@agentry/web`, all `private`) and their `exports`. (2) How the published `@ersanyamarya/agentry-cli` carries unpublished workspace code: bundle the bin with tsdown or esbuild, or use `bundleDependencies`; verify which `npm pack` handles with workspace symlinks, and how `renames.json` and `version.ts` resolve after the move. (3) The test layout: tests move with their package, and a root vitest `projects` config with `src/test/helpers/build.ts` building everything once. (4) The boundary check: Biome `noRestrictedImports` overrides per package, plus each package's `dependencies` list. Confirm that `src/tui/data.ts` (`createData`, no Ink imports) moves to core as the shared facade, and decide whether the pure counting helpers in `src/tui/rows.ts` (`tokenBreakdown`) move with it. Reason: cross-cutting design every later phase depends on. | claude-opus-5-5 |
| [x] | Add `"workspaces"` to `cli/package.json`. Create `packages/core/package.json` and `tsconfig.json` per the design task. Move `src/lib/**` (with `renames.json`) and `src/tui/data.ts` into `packages/core/src/` with `git mv`. Rewrite import specifiers only; no control-flow edits. | claude-haiku-5-5 |
| [x] | Move `src/tui/**` into `packages/tui/src/` with `git mv`. Point its imports and `src/bin/agentry.ts` at `@agentry/core` and `@agentry/tui`. Update `tsconfig.build.json` and the `build`, `postbuild` and `typecheck` scripts so `dist/bin/agentry.js` still builds and stays executable. | claude-sonnet-5-5 |
| [x] | Move the lib tests (`src/test/*.test.ts` except `router`, `scan-*` and `tui-*`) to `packages/core/src/test` and the `tui-*` tests to `packages/tui/src/test`, with the helpers they need. Add the root vitest `projects` config. Keep `npm test` as one command and keep the test count at 461 or more. | claude-sonnet-5-5 |
| [x] | Add the boundary check from the design task (Biome `noRestrictedImports` per package, and no `react`, `ink` or `@tanstack` in core's dependencies), with a comment on each rule saying why. Make `npm run check` run it. | claude-sonnet-5-5 |
| [x] | Update the packaging per the design task (`files`, `bin`, `prepublishOnly`, and bundling if chosen). Add `npm run pack:check`: `npm pack --dry-run`, then install the tarball into a temp prefix and run `agentry --help` and `agentry status --json` against a temp `CLAUDE_CONFIG_DIR`. | claude-sonnet-5-5 |
| [x] | Update the docs for the new layout and build steps: `cli/CLAUDE.md` Layout and Commands, `cli/README.md` Development section, the root `CLAUDE.md` architecture block (`cli/packages/{core,tui}`), and a `cli/CHANGELOG.md` "Internal" line. | claude-haiku-5-5 |

## Phase 2: TUI sidebar redesign

**Value:** The TUI shows the same left rail the web UI will use. That means three groups (Library: Skills, MCP, Hooks,
Plugins, Rules; Discover: Catalog; Health: Doctor, Backups), with counts and the Doctor error count, and `tab` moves
focus between the rail and the list.
**Done when:** `cd cli && npm run check && npm run typecheck && npm test` passes. New TUI tests cover four things:
(1) the rail renders its group labels, items and counts in design order; (2) Doctor shows its error count in error
colour, and the colour-off text says `err`; (3) `tab` toggles focus, and `↑`/`↓` on the rail change the section;
(4) `1`–`8` and `←`/`→` still switch sections in the new order. `tui-pty.test.ts` and `tui-widths.test.ts` pass at
their existing widths. A manual `agentry` run in an 80- and a 120-column terminal looks right.

Design rules (from `cli/docs/web-ui-design.md`, Decisions and Layout → TUI):

- Order: Library (Skills, MCP, Hooks, Plugins, Rules), Discover (Catalog), Health (Doctor, Backups).
- List markers: `›` cursor in `cursor` `#38bdf8`, `●` on, `◐` this project, `○` shelf.
- A description line shows for the selected row, and the keys bar sits at the bottom.
- Keys: `space` toggle, `s` shelve, `x` remove, `/` search, `?` help, `q` quit, `tab` focus.
- Theme names match the tokens, through `packages/tui/src/theme.ts`.

The design's "232" rail width is the artboard's pixel width, not a column count; see the Decisions log.

| Done | Task | Model |
|---|---|---|
| [x] | Add the `sidebar`, `selected`, `dim` and `cursor` token names to `packages/tui/src/theme.ts`, mapping them onto Ink colours, with colour-off fallbacks. Change no existing style names. Extend `tui-colour.test.ts`. | claude-sonnet-5-5 |
| [x] | Replace `components/tab-bar.tsx` with `components/sidebar.tsx`: a rail of 22 columns (16 under 90 columns; it hides under 70 and falls back to a one-line section name) with group labels, items, counts, and Doctor's error count. Move the project path, tokens and problems line to the rail footer (`● N problems`, `?` hint). Reorder `TAB_NAMES` to design order, and update `COUNT_PRIORITY`, the `TAB_KEYS` tuple in `app.tsx` and the `tabs` tuple, which are all positional. | claude-sonnet-5-5 |
| [x] | In `app.tsx`, add rail/list focus. `tab` toggles focus. While the rail has focus, `↑`/`↓` move the section and `return` or `tab` returns to the list. `←`/`→` and `1`–`8` keep working in the new order. Update `components/help.tsx` and `components/footer.tsx` key hints. Typing mode (`locked === "typing"`) still swallows `tab`. | claude-sonnet-5-5 |
| [x] | Update the TUI tests whose section indices or tab-bar text changed (`tui-app`, `tui-layout`, `tui-widths`, `tui-pty`, `tui-copy`, `tui-catalog`, `tui-backups` and others found by running the suite), then add the four Done when tests. Assert behaviour, not snapshots of the whole screen. | claude-sonnet-5-5 |
| [x] | Update `cli/README.md` (TUI keys and screenshot text) and add a `cli/CHANGELOG.md` line: the sidebar replaces the top tabs, `tab` focuses the rail, and the digit order follows the groups. | claude-haiku-5-5 |

## Phase 3: Web app, secure `agentry ui` server and the Skills screen

**Value:** `agentry ui` opens a browser on a local, token-protected web app with the sidebar shell. The Skills section
fully works: list, search, filter, toggle, shelve and unshelve, move scope, and remove with backup.
**Done when:** `cd cli && npm run check && npm run typecheck && npm test` passes, including the server tests below and
the Skills screen tests. `agentry ui --no-open` prints a `http://127.0.0.1:<port>/?token=…` URL. Opening it shows the
Skills list for the current project, and toggling a skill changes the same file the TUI changes, with a backup under
`~/.claude/backups/agentry`. Server tests cover the following:

- a wrong `Host` returns 403;
- a POST with a foreign `Origin` returns 403;
- a missing or wrong cookie returns 401 or 403;
- the token URL sets an HttpOnly SameSite=Strict cookie and redirects to `/` (the token leaves the address bar);
- the listener address is `127.0.0.1`;
- `--port` is honoured.

Design rules (from `cli/docs/web-ui-design.md`):

- **Tokens:**
  - Surfaces: background `#09090b`, sidebar `#0c0c0f`, card `#0f0f12`, muted-surface `#111114`, selected
    `#18181d`/`#1c1c21`, border `#27272a` (rows `#1f1f23`).
  - Text: foreground `#fafafa`, body `#d4d4d8`, muted `#a1a1aa`, dim `#8e8e98` (never darker).
  - Accents: on `#4ade80` (badge bg `#14301f`), project `#fbbf24` (badge bg `#33280a`), error `#f87171` (badge bg
    `#3b1414`, border `#4a1d1d`).
  - Fonts: Inter for UI, JetBrains Mono for names, paths, keys and counts.
  - Radii: 8px controls, 12px cards, 6px nav items, pill badges. Touch targets at least 44px.
- **Shell:** a 240px sidebar with fluid content (28/32px padding). Under 800px the sidebar stacks above the content.
  - The sidebar holds the brand and version, the Global/This project scope switcher, the three labelled groups with
    counts, a red count pill on Doctor, and a footer with `● N problems` and a `?` hint.
  - The active item has a `#1c1c21` background and `aria-current="page"`.
- **List screen:**
  - A title and summary line, an Add button, search (`/`) with a segmented filter, and a table: switch, name with a
    one-line description, scope badge, bundle.
  - A key hint line sits below the table. A details panel on the right shows the name, scope badge, description, path,
    a scope segmented control, and Shelve/Remove with key chips. Below 1100px the panel is a Sheet.
- **Keys:** `space`, `s`, `x`, `/`, `?`, and `tab` (sidebar or list focus) work as shortcuts and show as `kbd` chips.

| Done | Task | Model |
|---|---|---|
| [x] | Scaffold `cli/packages/web` (`@agentry/web`, private) from `gentlemans-stack/apps/todo-ui`: `vite.config.mts` (`tanstackStart()`, `viteReact()`, `tailwindcss()`, `@` alias to `src`), `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx` redirecting to `/skills`, `vitest.config.mts` (jsdom), `tsconfig.json`, and scripts `dev`, `build`, `test` and `typecheck`. Leave out paraglide, nitro presets, Docker and Nx. Wire its tests into the root vitest `projects`. | claude-haiku-5-5 |
| [x] | Run shadcn init in `packages/web` with a `components.json` like `ui-libs/design-system/components.json`. Add `button`, `badge`, `card`, `input`, `switch`, `table`, `toggle-group`, `sheet`, `separator`, `tooltip`, `dialog`, `alert-dialog`, `sonner`, `kbd` (or a local `kbd.tsx`) and `sidebar`. Write the Tokens table into `src/styles/globals.css` as shadcn CSS variables (dark only), with Inter and JetBrains Mono. Add a Biome override for `src/components/ui/**`, with a comment that these files are generated by shadcn and kept as shipped. | claude-sonnet-5-5 |
| [x] | Build `agentry ui` serving per `cli/docs/web-ui-design.md` "Server and security", in `packages/web/src/serve.ts`, exported for the CLI. It binds a `node:http` server to `127.0.0.1` on a free port (`--port` overrides) and wraps the built TanStack Start fetch handler (verify its output shape with Context7 first). It generates a 32-byte random token per launch. `/?token=` sets an HttpOnly SameSite=Strict `Path=/` cookie and redirects with 303 to `/`. Every other request needs the cookie, compared in constant time. It rejects a `Host` other than `127.0.0.1:<port>` or `localhost:<port>`, and a mutating request whose `Origin` differs. The token is never logged after the first URL print. It takes `--no-open`; injectable `open`, `listen` and `now`. Add the server tests from Done when. Reason: security-sensitive auth and network boundary. | claude-opus-5-5 |
| [x] | Resolve the `agentry ui` name clash. Today `ui` opens the TUI (`src/bin/agentry.ts` `command === "ui"` → `runUi()`, documented in `cli/README.md`). Change it so that `agentry ui` serves the web app, a new `agentry tui` opens the TUI, and a bare `agentry` in a terminal still opens the TUI. Update `USAGE`, `src/test/router.test.ts` and the `cli/README.md` command list. Add a `cli/CHANGELOG.md` "Breaking" line. | claude-sonnet-5-5 |
| [x] | Define the oRPC contract in `packages/web/src/contract/` (kept inside web, so web imports core only), following `libs/contract-kit` and `contracts/todo-contracts`. Shape it as one procedure group per section, mirroring `createData`. `load` returns the per-section data, with secrets masked by core's `mask.ts`. Write calls return `{ ok, text }`. Preview/apply pairs become `preview*` and `apply*` procedures, with `apply` refusing anything that wasn't previewed if the core pair needs it. Every call takes `dir` and the scope. Implement the router in `src/server/router.ts` over `createData` from `@agentry/core`, mounted on a Start server route at `/rpc`. Add `src/lib/orpc.ts` (client plus `@orpc/tanstack-query` utils). Router tests run against temp HOME fixtures. Reason: the spec every web screen builds on, carrying write calls that edit user files. | claude-opus-5-5 |
| [x] | Build the shell in `src/routes/__root.tsx` and `src/components/app-sidebar.tsx`, per "Layout → Shell and Sidebar" and "Tokens", using shadcn `sidebar`, `badge`, `toggle-group` (scope switcher), `tooltip` and `kbd`. One route per section (`/skills`, `/mcp`, `/hooks`, `/plugins`, `/rules`, `/catalog`, `/doctor`, `/backups`), with sections not yet built showing "Coming in a later phase". It shows counts from `load`, the Doctor red pill, and the `● N problems` footer, and stacks under 800px. Add a `useShortcuts` hook for `/`, `?` and `tab`. Testing Library tests cover group order, counts, `aria-current="page"` on the active item, and the `?` help dialog. | claude-sonnet-5-5 |
| [x] | Build the Skills screen at `src/routes/skills.tsx`, with `components/list-screen.tsx` and `components/details-panel.tsx` reusable for later list screens. Follow "Layout → List screens" and use shadcn `table`, `switch`, `input`, `toggle-group`, `badge`, `sheet`, `alert-dialog` and `sonner`. It calls `toggleShelf`, `shelveSkill`, `unshelveSkill`, `promoteSkill`, `demoteSkill` and `removeSkill` (confirmed in an `alert-dialog` that names the backup), with `space`, `s` and `x` shortcuts. It refetches `load` after each write. Testing Library tests use a mocked oRPC client and cover filtering, a toggle calling `toggleShelf`, remove needing confirmation, and the panel becoming a Sheet below 1100px. | claude-sonnet-5-5 |
| [x] | Add one end-to-end test in `cli/src/test/web-serve.test.ts`. Against a temp HOME it builds the web app, starts `serve()`, exchanges the token, calls the Skills `load` and `toggleShelf` procedures over HTTP, and asserts that the file changed and a backup exists. | claude-sonnet-5-5 |

## Phase 4: Doctor and Catalog

**Value:** In the browser, users see what is wrong and fix it with one click, and they browse and install from the
agentry-labs catalog.
**Done when:** `cd cli && npm run check && npm run typecheck && npm test` passes with the new Doctor and Catalog tests.
Against a fixture with a known finding, "Fix it" shows the preview and, after confirmation, applies the fix, after which
the finding is gone on refetch. The Catalog filters by bundle, and Install flips the card to Installed.

Design rules (from `cli/docs/web-ui-design.md` "Layout"):

- **Doctor:** three stat cards (errors, warnings, passing), then one card per finding. Each card has a severity badge,
  title, area, explanation, the fixing command in a code box, and a primary "Fix it" button. Passing checks collapse
  into one row.
- **Catalog:** search plus a bundle filter (All, global, flutter, mongodb, web) and a responsive card grid
  (`minmax(280px, 1fr)`). Each card shows the name, bundle badge, description, and Install or Installed.
- Error colour is `#f87171` (badge bg `#3b1414`), warn `#fbbf24` (badge bg `#33280a`), and passing `#4ade80`.

| Done | Task | Model |
|---|---|---|
| [x] | Build the Doctor screen at `src/routes/doctor.tsx` with shadcn `card`, `badge`, `button`, `alert-dialog` (shows the `previewFix` text and confirms `applyFix`), `accordion` or `collapsible` for the passing checks, and `sonner`. Undo of the last fix (`previewUndo`, `applyUndo`) sits here as in the TUI's `doctor-tab.tsx`. Testing Library tests cover the stat counts, finding cards, fix needing confirmation, and passing checks collapsing. | claude-sonnet-5-5 |
| [x] | Build the Catalog screen at `src/routes/catalog.tsx` with shadcn `input`, `toggle-group` (bundle filter), `card`, `badge` and `button`. It calls `refreshCatalog`, `addFromCatalog`, `updateFromCatalog` and `removeAgent` (confirmed, with the backup named), mirroring `components/catalog-tab.tsx`. Testing Library tests cover the bundle filter, search, Install calling `addFromCatalog`, and an installed entry showing Installed or Update. | claude-sonnet-5-5 |
| [x] | Extend the end-to-end test in `src/test/web-serve.test.ts` with one `previewFix`/`applyFix` round trip over HTTP against a fixture finding, asserting the backup. | claude-haiku-5-5 |

## Phase 5: MCP, Hooks and Plugins

**Value:** Users manage MCP servers (toggle, add, edit, remove), hooks (toggle) and plugins (toggle and install) from
the browser, with the same previews and backups as the TUI.
**Done when:** `cd cli && npm run check && npm run typecheck && npm test` passes with the new screen tests. A test proves
MCP env values reach the browser masked. Each write procedure shows its preview before applying, in a Testing Library
test.

Design rules (from `cli/docs/web-ui-design.md` "Layout → List screens" and "Decisions"):

- The three screens reuse Phase 3's `list-screen.tsx` and `details-panel.tsx`, with the same table columns, search,
  segmented filter and details panel, and the panel becomes a Sheet below 1100px.
- Keys are `space` (toggle) and `x` (remove), shown as `kbd` chips.
- Writes show the preview text and need a confirm. Secrets never appear unmasked.

| Done | Task | Model |
|---|---|---|
| [x] | Build the MCP screen at `src/routes/mcp.tsx` on the shared list components. It uses `previewMcp` and `applyMcp` (toggle), `previewMcpRemove` and `applyMcpRemove`, `previewMcpAdd` and `applyMcpAdd` (an "Add" `dialog` form), and `previewMcpSet` and `applyMcpSet` (edit in the details panel), mirroring `mcp-flow.tsx`. It uses shadcn `dialog`, `input`, `alert-dialog` and `switch`. Tests cover the preview-then-apply flow for each pair and masked env values. | claude-sonnet-5-5 |
| [x] | Build the Hooks screen at `src/routes/hooks.tsx` on the shared list components, with `previewHook` and `applyHook` (toggle), mirroring `hook-flow.tsx` and `rows.ts` `hookRows`. Tests cover grouping by event and toggle going through preview. | claude-sonnet-5-5 |
| [x] | Build the Plugins screen at `src/routes/plugins.tsx` on the shared list components, with `previewPlugin` and `applyPlugin` (toggle) and `previewPluginInstall` and `applyPluginInstall` (an "Add" `dialog`), mirroring `plugin-flow.tsx`. It shows the `PLUGIN_NOTE` ("applies to new sessions") after a change. Tests cover toggle and install going through preview, and the note showing. | claude-sonnet-5-5 |

## Phase 6: Rules and Backups (with restore)

**Value:** All eight sections work in the browser. Users remove rule files with a backup, and they browse, restore and
prune backups, so any web write can be undone the same way as a TUI write.
**Done when:** `cd cli && npm run check && npm run typecheck && npm test` passes. Every method in `createData`'s return
object (`packages/core/src/data.ts`) is called by at least one web screen, or is logged in the Decisions log as left
out on purpose. A short script or test greps the contract against that list. A round-trip test removes a skill, then
restores it from Backups, and the file is back.

Design rules (from `cli/docs/web-ui-design.md` "Layout → List screens" and "Server and security", last bullet):

- Rules and Backups reuse the list layout, and Backups rows show age and size (`formatAge`, `formatBytes` from core).
- Restore and prune confirm in an `alert-dialog`.
- Every write goes through the core backup functions.

| Done | Task | Model |
|---|---|---|
| [x] | Build the Rules screen at `src/routes/rules.tsx` on the shared list components, with `removeRule` (confirmed, with the backup named), mirroring `components/rules-tab.tsx` and `ruleRows`. Tests cover listing by scope and remove needing confirmation. | claude-sonnet-5-5 |
| [x] | Build the Backups screen at `src/routes/backups.tsx` on the shared list components, with `restoreBackup` (the restore action) and `pruneBackups` ("Delete 30+ days old" with a `d` shortcut), mirroring `components/backups-tab.tsx`. Tests cover age and size columns, restore confirming, and prune confirming. | claude-sonnet-5-5 |
| [x] | Add the parity test `packages/web/src/test/parity.test.ts`. It reads the keys of `createData`'s return object and asserts each one is a contract procedure or sits in an explicit allow-list with a reason. Extend `src/test/web-serve.test.ts` with the remove-then-restore round trip. | claude-sonnet-5-5 |

## Phase 7: Packaging, docs and release check

**Value:** `npm install -g @ersanyamarya/agentry-cli` gives users `agentry ui` with the web app included, at a known
size, with the docs and README cover current.
**Done when:** `cd cli && npm run check && npm run typecheck && npm test && npm run pack:check` passes. The packed
tarball contains the built web app, and `pack:check` fails if the unpacked size exceeds the budget logged in the
Decisions log. The smoke test passes from the installed tarball. The cover image is regenerated, and
`node skills/image-artifact-setup/scripts/verify-images.mjs .github/assets --expect 1 --width 1280 --height 640` passes.

| Done | Task | Model |
|---|---|---|
| [x] | Ship the web build. Make `npm run build` build `packages/web` and place its client and server output where `serve.ts` finds it from an installed package (for example `dist/web/`). Update `files` and `prepublishOnly`. Make sure no dev-only dependency (vite, the shadcn CLI, Testing Library) is needed at runtime. Add a size budget to `pack:check`: record today's size, and fail above it plus 20%. | claude-sonnet-5-5 |
| [x] | Add a full-stack smoke test to `pack:check`. It installs the tarball into a temp prefix, runs `agentry ui --no-open --port <free>` against a temp `CLAUDE_CONFIG_DIR`, fetches the token URL, follows the redirect with the cookie, gets `/skills` with a 200 and the sidebar text, calls one read procedure, and stops the server. | claude-sonnet-5-5 |
| [x] | Update the docs. `cli/README.md` gets an `agentry ui` section covering the web app, the security model in two lines, `--port` and `--no-open`, and `agentry tui`. Also update `cli/CLAUDE.md` (Layout, Commands, web test steps), the root `CLAUDE.md` architecture block (`packages/web`) and the root `README.md` CLI paragraph. Add `cli/CHANGELOG.md` entries for the web UI. | claude-haiku-5-5 |
| [x] | Regenerate the README cover (`cd scripts/image-gen-tools && bun install && bun run cover`). Check the printed counts, run `verify-images.mjs` as in Done when, and view the image before committing. | claude-haiku-5-5 |

## Out of scope

- A hosted or remote web UI, auth beyond the per-launch token, multi-user access, or binding to anything but
  `127.0.0.1`.
- A light theme or theme toggle. The design defines dark tokens only.
- i18n/paraglide, Nx, Docker, MongoDB or nitro deployment presets from gentlemans-stack.
- New capabilities the TUI lacks, such as editing skill content in the browser, live file watching or websockets. The
  web UI refetches after each write.
- Publishing `@agentry/core`, `@agentry/tui` or `@agentry/web` as separate npm packages.
- Playwright browser tests. Testing Library and the HTTP smoke test cover behaviour; add Playwright only if a regression
  shows the need.
- Changing what any core command does, beyond the logged `agentry ui` / `agentry tui` rename.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-12 | Layout: npm workspaces inside `cli/`, with `packages/core` (today's `src/lib` plus the facade `src/tui/data.ts`), `packages/tui` (Ink UI) and `packages/web` (TanStack Start), plus the existing CLI entry `src/bin/agentry.ts`. One published package, `@ersanyamarya/agentry-cli`, ships the built web app. |
| 2026-11-12 | `src/tui/data.ts` (`createData`) moves to core. It has no Ink imports, and it is the single facade both UIs call. Without the move, the web app would duplicate it or import the TUI, which the boundary forbids. |
| 2026-11-12 | First web release covers all 8 sections with full TUI parity, checked by the Phase 6 parity test against `createData`'s methods. |
| 2026-11-12 | The TUI sidebar redesign is its own phase (2), right after the core extraction, so both UIs share the Library / Discover / Health grouping. |
| 2026-11-12 | `cli/docs/web-ui-design.md` is the committed design source. It is committed in Phase 1's first task because it was untracked when this plan was written. |
| 2026-11-12 | The design file's "232-column-wide" TUI rail is read as the artboard's pixel width. The TUI rail is 22 columns (16 under 90 columns, hidden under 70) so the 80-column layouts in `tui-widths.test.ts` keep working. |
| 2026-11-12 | TUI keys: `tab` now toggles rail/list focus (it did not switch tabs before). `←`/`→` and `1`–`8` keep switching sections, in the new group order. |
| 2026-11-12 | `agentry ui` clash: today it opens the TUI. Per the brief and the design file it becomes the web server, `agentry tui` is added for the TUI, and a bare `agentry` in a terminal still opens the TUI. This is a breaking change, logged in the CHANGELOG in Phase 3. Confirm with the user before merging Phase 3. |
| 2026-11-12 | The oRPC contract lives inside `packages/web` (not a separate contracts package), so "web imports core only" holds. |
| 2026-11-12 | How the single published package carries the workspace code (bundling or `bundleDependencies`) is decided by Phase 1's design task and logged here. Phase 1 already proves it with `npm pack` plus a temp install, so Phase 7 only adds the web build. |
| 2026-11-12 | Branching: one branch per phase (`web-ui/phase-<n>`), squash-merged into `main` when the phase's checks pass. No AI attribution in commits or PRs. |
| 2026-11-12 | **Workspace design (Phase 1 design task).** The rows below are the spec for the rest of Phase 1. Where they differ from a Phase 1 task row's wording, they win. They were proven in a throwaway copy of `cli/`: all files moved, the full suite green (43 files, 461 tests), the three `tsc -p` runs and Biome clean, `npm pack`, and `npm install -g <tarball> --prefix <tmp>`. From that install, `agentry --version`, `status --json` and `doctor --json` exit 0, and `agentry ui` renders the Skills rail under a pty. |
| 2026-11-12 | Packages, all `"private": true`, `"version": "0.0.0"` and `"type": "module"`. Their `exports` point at TypeScript source, and nothing builds them on their own (internal "just-in-time" packages). **`@agentry/core`** (`packages/core`) has `"exports": { "./*": "./src/*.ts" }` and is imported by file, for example `@agentry/core/paths`, `@agentry/core/inventory/skills` or `@agentry/core/data`. It has no barrel, so the lazy TUI split stays intact. It has no `dependencies` (core uses Node built-ins only), and its devDependencies are `{ "vitest": "^5.1.0" }`. **`@agentry/tui`** (`packages/tui`) has `"exports": { ".": "./src/index.tsx" }`, with `dependencies` `{ "@agentry/core": "*", "figures": "^6.1.0", "ink": "^8.0.0", "ink-spinner": "^5.0.0", "react": "^19.3.1" }` and devDependencies `{ "ink-testing-library": "^4.0.0", "vitest": "^5.1.0" }`. **`@agentry/web`** (Phase 3) gets `"exports": { "./serve": "./src/serve.ts" }`, the only thing the CLI imports, and depends on `@agentry/core` plus its own UI stack. npm workspaces have no `workspace:` protocol, so sibling ranges are `"*"`. Version ranges shared with the root must match it exactly, so npm hoists a single React. |
| 2026-11-12 | **How the published package carries workspace code: esbuild bundles the bin.** `npm run build` is `esbuild src/bin/agentry.ts --bundle --platform=node --format=esm --target=node22 --splitting --outdir=dist/bin --jsx=automatic --external:figures --external:ink --external:ink-spinner --external:react`. Workspace code is inlined. Every external is in the root `dependencies` and the reverse also holds; `pack:check`'s install smoke test catches a mismatch. With `--splitting`, the bin's `await import("@agentry/tui")` becomes a lazy chunk. Measured result: `dist/bin/agentry.js` statically imports only `node:*`, and `figures`, `ink`, `ink-spinner`, `react` and `react/jsx-runtime` appear only in the TUI chunk, so `tui-loader.test.ts` ("help runs without node_modules") still passes. `renames.json` is a static `import … with { type: "json" }`, so esbuild inlines it, and the bundle needs no data file. The tarball is 7 files, 104 kB packed and 412 kB unpacked, with 0 `@agentry/*` entries in the installed `node_modules`. `@agentry/core` and `@agentry/tui` are root **devDependencies** (`"*"`) and never reach users as packages. The CLI gains devDependency `esbuild` `^0.28.2`. npm 11 blocks esbuild's postinstall, which is harmless because the platform binary comes from optionalDependencies. **Rejected:** `bundleDependencies`. npm 11 does follow the workspace symlinks, but it also bundled all 44 transitive deps (4.7 MB, 2,024 files), and Node refuses `.ts` under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so every package would need its own emit plus `dist` exports. **Rejected:** tsdown. It auto-externalises `dependencies`, but adds a tool and a config for what one esbuild command does. |
| 2026-11-12 | **Shipping invariant for later phases:** workspace packages reach the tarball only through a bundler, never as `node_modules` entries. Phases 3 and 7 (unverified, not needed for Phase 1): the Vite SSR build of `packages/web` must inline `@agentry/core` (`ssr.noExternal: [/^@agentry\//]`), or the installed server fails the same way `bundleDependencies` did. Anything Vite leaves external joins the root `dependencies`. The CLI imports `@agentry/web/serve` lazily, the way it imports the TUI. `serve.ts` imports only Node and core (no `@/` alias, no `?url` imports), so esbuild can bundle it. It loads the built server entry from `dist/web/` through a computed path (`await import(pathToFileURL(…).href)`), so esbuild leaves that entry alone. It finds the CLI root with the same walk-up as `version.ts`; core can export that helper when Phase 3 needs it. |
| 2026-11-12 | `version.ts` after the move: `new URL("../../package.json", import.meta.url)` points at `packages/package.json` when tests run from source, which gave 12 ENOENT failures in the spike. It changes to a walk-up from `import.meta.url` to the first `package.json` whose `name` is `@ersanyamarya/agentry-cli`, throwing if none is found. The return value is unchanged from `packages/core/src` (tests), `dist/bin` (bundle) and an installed prefix. `scan.ts`'s `here` (the code-mtime cache key) becomes `dist/bin` in the bundle and `packages/core/src` in tests; it still means "newest mtime of the CLI's own code". `build` gains `"prebuild": "node -e \"fs.rmSync('dist',{recursive:true,force:true})\""` so stale hashed chunks never ship or skew that key. |
| 2026-11-12 | **The only edits allowed beyond import specifiers** in the Phase 1 move tasks: (a) the `version.ts` walk-up above; (b) in `tui-loader.test.ts`, the copy list `["dist/bin", "dist/lib", "package.json"]` becomes `["dist/bin", "package.json"]`; (c) `vitest.config.ts`, `tsconfig*.json`, `biome.jsonc` and `package.json` as specified here; (d) one `npx biome check --write .` after rewriting specifiers, because the rewritten imports re-sort (`organizeImports`) and the new `package.json` files get key-sorted (`useSortedPackageJson`). |
| 2026-11-12 | `git mv` list, run from `cli/`. Core: `mkdir -p packages/core/src/test packages/tui/src/test/helpers`, then `git mv src/lib/* packages/core/src/` (this includes `inventory/` and `renames.json`) and `git mv src/tui/data.ts packages/core/src/data.ts`. TUI: `git mv src/tui/* packages/tui/src/`. Core tests: `git mv src/test/{discover,fix-rules,json-edit,mcp,tokens}.test.ts packages/core/src/test/`. TUI tests: `git mv src/test/tui-{app,backups,catalog-kinds,catalog,colour,copy,hooks,icons,layout,mcp-edit,mcp,plugin-install,plugins,scope-move,search-bulk,shelve,widths}.test.ts packages/tui/src/test/` and `git mv src/test/helpers/tui.tsx packages/tui/src/test/helpers/`. These stay in `src/test` (21 files): backups, catalog-kinds, catalog, doctor, fix-undo, fix, hook-toggle, inventory, mcp-edit, mcp-toggle, plugin-install, plugin-toggle, router, scan-fix, scan-skill, scan-workspace, scan, shelf-scope, shelf, tui-loader, tui-pty. 5 + 17 + 21 = 43 files, 461 tests. Finally `git rm tsconfig.build.json`. |
| 2026-11-12 | Specifier rewrites. `packages/core/src/data.ts`: `../lib/X.js` becomes `./X.js`. `packages/tui/src/**`: `../lib/X.js` and `../../lib/X.js` become `@agentry/core/X`, and `./data.js` and `../data.js` become `@agentry/core/data`. `src/bin/agentry.ts`: `../lib/X.js` becomes `@agentry/core/X`, and `import("../tui/index.js")` becomes `import("@agentry/tui")`. Core tests: `../lib/X.js` becomes `../X.js`. TUI tests: `../tui/X.js` becomes `../X.js`, and `./helpers/fake-claude.js` becomes `../../../../src/test/helpers/fake-claude.js`. `packages/tui/src/test/helpers/tui.tsx`: `../../lib/X.js` becomes `@agentry/core/X`, `../../tui/data.js` becomes `@agentry/core/data`, `../../tui/X.js` becomes `../../X.js`, and `./fixture.js` becomes `../../../../../src/test/helpers/fixture.js`. Tests that stay in `src/test`: `../lib/X.js` becomes `@agentry/core/X`. |
| 2026-11-12 | **Tests follow what they import, which differs from the Phase 1 test-move row.** Most "lib" tests (catalog, shelf, plugin-toggle and the others in the stay list) spawn `dist/bin/agentry.js` through `fixture.run`. They are CLI tests, so they stay in `cli/src/test`. Moving them to core would make core's tests depend on the CLI bin. Core gets only the 5 in-process suites. `tui-app` and `tui-plugins` call `fx.run` once each but drive the Ink app, so they go to tui. Shared helpers stay in `cli/src/test/helpers/`: `fixture.ts`, `fake-claude.ts`, `paths.ts` (its `root` is three levels up from there), `build.ts` and `pty-run.py`. TUI tests reach them by relative path; only `tui.tsx` moves. |
| 2026-11-12 | Root `vitest.config.ts`: `test: { globalSetup: ["src/test/helpers/build.ts"], testTimeout: 30_000, hookTimeout: 30_000, projects: [{ test: { name: "cli", include: ["src/test/**/*.test.ts"] } }, { test: { name: "core", root: "packages/core", include: ["src/test/**/*.test.ts"] } }, { test: { name: "tui", root: "packages/tui", include: ["src/test/**/*.test.ts"] } }] }`. In vitest 5 the root `globalSetup` runs once per run and is not inherited by projects (Context7, vitest v5 "projects"). The timeouts are inherited. `build.ts` stays `npm run build` at the CLI root, which Phase 7 extends to build web too. Phase 3 adds `"packages/web"` (its own `vitest.config.mts` on jsdom) to `projects`. `npm test` is unchanged, and `vitest run --project core` runs one package. |
| 2026-11-12 | TypeScript 7 (7.0.2): `tsconfig.base.json` holds today's `compilerOptions` minus `rootDir`/`outDir`, plus `"noEmit": true`. `packages/core/tsconfig.json` and `packages/tui/tsconfig.json` are `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`, and the root `tsconfig.json` is `{ "extends": "./tsconfig.base.json", "include": ["src"] }` (bin plus the CLI tests). `typecheck` is `tsc -p packages/core && tsc -p packages/tui && tsc -p .`. `nodenext` resolves the `.ts` targets in `exports` with no flag. Nothing emits, so project references are not needed (this answers the "TS 7 project references" item in Facts to verify). Phase 3's web `tsconfig.json` extends the base and overrides `moduleResolution: "bundler"` and `lib` (DOM). |
| 2026-11-12 | Root `package.json` scripts: `prebuild` as above; `build` is the esbuild command; `postbuild` is unchanged (chmod `dist/bin/agentry.js`); `dev` is `npm run build -- --watch`; `typecheck` as above; `check`, `lint` and `format` are unchanged (Biome runs from `cli/` over every package); `prepublishOnly` is `npm run typecheck && npm run build && npm test` (esbuild does not typecheck); `pack:check` is added by its own task. It also gets `"workspaces": ["packages/*"]`. `bin` and `files` (`dist`, `README.md`, `LICENSE`, `CHANGELOG.md`) stay as they are. |
| 2026-11-12 | **Boundary check: two Biome rules, both proven in the spike.** (1) `noRestrictedImports` overrides in `biome.jsonc`. For `packages/core/src/**`, `paths` bans `react`, `ink`, `@agentry/tui` and `@agentry/web`, and `patterns` `[{ "group": ["react/*", "react-dom", "react-dom/*", "ink/*", "ink-*", "@tanstack/*", "@agentry/*", "**/tui/src/**", "**/web/src/**"], "message": … }]` bans the rest. For `packages/tui/src/**`, `paths` bans `@agentry/web`, and `patterns` bans `["@agentry/web/*", "@tanstack/*", "**/web/src/**", "**/core/src/**"]` (core only through `@agentry/core/*`). Phase 3 adds the mirror rule for `packages/web/src/**` (no `ink*`, no `@agentry/tui`, no `**/tui/src/**` or `**/core/src/**`). The globs match by name rather than by `../` depth, so tui's own `../../app.js` passes; existing code had 0 hits. (2) Ultracite's `noUndeclaredDependencies` checks every import against the nearest `package.json`, so a core file importing `ink` fails a second time because core declares no dependencies. That makes each package's `dependencies` list part of the gate, and is why vitest and ink-testing-library are package devDependencies. `files.includes` becomes `["src/**", "packages/*/src/**", "packages/*/*.json", "*.json", "*.jsonc", "!**/dist", "!**/node_modules"]`, and the tests override becomes `["src/test/**", "packages/*/src/test/**"]`. |
| 2026-11-12 | `src/tui/data.ts` (`createData`) moves to core as `@agentry/core/data`. Confirmed: it imports only `../lib/*`, with no Ink or React. `src/tui/rows.ts`'s `tokenBreakdown` **stays in tui**. Its only users are `rows.ts`'s `skillRows` summary and `tui-search-bulk.test.ts`, and it takes the TUI `Data` type. If web needs it later, it moves to core in that task. The `Api` and `Data` types (`ReturnType<typeof createData>`, `ReturnType<Api["load"]>`) stay in `packages/tui/src/types.ts`. When web needs them, core's `data.ts` exports them, and web never imports tui. |
| 2026-11-13 | Phase 3 notes. (1) `toggleShelf` and `shelveSkill` never write a backup (core only backs up removals, restores and fix-engine writes), so the end-to-end test checks the backup after `removeSkill`, not after a toggle. (2) The contract gained an `info` procedure (`{ dir, version }`): the browser needs the folder `agentry ui` ran in before it can call `load`. (3) SSR uses `@tanstack/react-router-ssr-query` (`setupRouterSsrQueryIntegration`); the older `react-router-with-query` failed on the server render with a query in the root. (4) `serve.ts` allows `script-src 'unsafe-inline'` because TanStack Start emits inline bootstrap scripts; a nonce needs `createRouter({ ssr: { nonce } })` and is a follow-up. (5) The built server imports bare packages (react, `@tanstack/*`, ...), so Phase 7 must put them in the root `dependencies` or bundle them. (6) Core: `removeSkill({ project: true, target: ".." })` resolves to the project's `.claude` folder; the web contract blocks it, but the CLI path does not. Fix separately. (7) shadcn generated `import "cn"` and added the unrelated `cn` npm package; the imports now use `@/lib/utils` and the package is removed. `sonner.tsx` no longer uses `next-themes`. (8) The design file's "card" blocks are flat in the web UI (no containers, full width), per the 2026-11-12 rule in the design file; Skills rows have no description line because `load` carries none for skills, so the second line shows group and tokens. |
| 2026-11-13 | Phases 4-6 were built together on one branch (`web-ui/phase-4`): Doctor, Catalog, MCP, Hooks, Plugins, Rules and Backups, all on the shared `ListScreen`, `DetailsPanel` and `usePreviewFlow` (preview text, then Apply; `y` and `n` work as keys). The parity test passes with an empty left-out list: every `createData` method has a procedure. Doctor has no "passing checks" row because `load` carries findings only, not a count of passing checks. The Catalog page fetches only when asked (never on its own). Lists show "Loading..." until `load` answers, so an empty state never flashes. |
| 2026-11-13 | Phase 7: the server bundle is self-contained (`ssr.noExternal: true` in `packages/web/vite.config.mts`), so no web dependency was added to the root `dependencies`; it imports and runs from a copy with no `node_modules`. The tarball is 4.27 MB unpacked (budget 5.2 MB in `scripts/pack-check.mjs`, about 20% over). `pack:check` now installs the tarball, starts `agentry ui` from the install and checks the token exchange, a page, an rpc read and the 401 without a cookie. The README cover shows the sidebar. The web docs were not updated beyond the READMEs, CLAUDE.md files and CHANGELOG. |
