# Move the agentry CLI and TUI to TypeScript in a `cli/` subdirectory

The `agentry` CLI (about 8.4k lines of ESM `.mjs` in `bin/`, `lib/`, `tui/`, plus 46 test files) becomes a TypeScript project in `cli/` inside this same git repository: one repo, one subdirectory, no submodule, no second remote. `tsc` compiles `cli/src` to `cli/dist` and the `agentry` command runs from `cli/dist`. The package is named `@ersanyamarya/agentry-cli` (command still `agentry`) and is built to be publishable to npm later; publishing itself is not part of this plan. When every phase is done, the old root-level JavaScript CLI, its package files and its global install are gone, and git history for the moved files is kept.

## How to use this plan

- Work one phase per coordinator session, in order. Each phase ships something usable and testable on its own.
- Start a branch per phase (`ts/phase-<n>`), tick a task's box (`[ ]` to `[x]`) in this file in the same commit that finishes it, and merge when the phase's "Done when" checks pass.
- The **Model** column names the cheapest model that does the task well: `claude-haiku-5-5` for mechanical work, `claude-sonnet-5-5` for normal implementation, `claude-opus-5-5` only for tasks that meet the large-tier bar. No task here does, so the plan uses no Opus.
- **Run each task in its own sub-session on that model, never in a subagent.** The coordinator starts a separate Claude Code session per task (in the desktop app, `start_session` with `model` set; in a terminal, `claude --model <id>` in a new tab) on the phase branch, with a brief naming the task row, files and "Done when" check. A subagent can't be steered or reviewed on its own and doesn't reliably run on the chosen model. The coordinator reviews each sub-session's diff, runs `npm test` (in `cli/` from phase 0 on; before the first move, `npm test` at the repo root), and only then ticks the box. Tasks that touch the same files run one after another, not in parallel.
- **Batch small tasks.** Consecutive tasks with the same model that touch nearby files go into one sub-session. A sub-session's startup and orientation cost more than a one-file task, so never start one per tiny row.
- **The coordinator runs on claude-sonnet-5-5 and never switches model.** It only writes briefs, reviews diffs and runs tests. The prompt cache is per model: switching a session's model re-sends its whole history uncached on the new one, so models change by starting a sub-session, not by switching inside a session.
- Ask before going beyond a phase's tasks. Record decisions and surprises in "Decisions log" at the bottom.
- **Phase 4 touches this machine** (global npm link, mise shims, caches). The coordinator asks the user before each command there.

## Ground rules

- Runtime: Node 22 or newer (current root `engines`; Node 26 is installed), ESM only (`"type": "module"`), React 19 and Ink 8 for the TUI, `ink-testing-library` for TUI tests. TypeScript is the only new dev dependency family (`typescript`, `@types/node`, `@types/react`).
- Layout: everything for the CLI lives under `cli/` and nothing else in the repo gets a `package.json`. `cli/src/bin`, `cli/src/lib`, `cli/src/lib/inventory`, `cli/src/tui`, `cli/src/tui/components`, `cli/src/test` mirror the old `bin/`, `lib/`, `tui/`, `test/`. Shared config shapes live in `cli/src/lib/types.ts`; the package version comes from `cli/src/lib/version.ts`. Move files with `git mv` so history follows.
- Build: `tsc` compiles `cli/src` to `cli/dist` with `rootDir: src`, so `cli/src/bin/agentry.ts` becomes `cli/dist/bin/agentry.js`. `cli/package.json` `bin` points at it, `files` is `["dist"]`, `prepare` runs the build so `npm install && npm link` inside `cli/` works. `cli/dist` and `cli/node_modules` are git-ignored. TS imports of local files use the `.js` extension (nodenext rule).
- Publishable later: the package is `@ersanyamarya/agentry-cli` with `bin` `{"agentry": "dist/bin/agentry.js"}`, `publishConfig.access` `public`, `repository` with `directory` `cli`, `license` MIT, `files` limited to `dist` (plus README and LICENSE), `prepublishOnly` running build and test, and `private` left false. The tarball must run on its own: nothing in `dist` may read a file outside the package (no `../skills`, `../bundles.tsv`, repo-root `package.json`), and any data file such as `renames.json` must be in `dist`. A user who installs it with `npm i -g` has no agentry-labs checkout, so the catalog always comes from `catalog refresh`.
- Behaviour does not change. Every phase keeps the full test suite green; a conversion task that needs a behaviour change stops and asks.
- Testing: `npm test` in `cli/` is `tsc` then `node --test` on `dist/test`. Tests build temp HOME and project dirs via `test/helpers/`; they never read the real `~/.claude`. Keep that.
- Safety: the CLI edits user files (settings, `.mcp.json`, skills) with backups under `~/.claude/backups/agentry`. Those backups are user data: no task deletes them. Never print secrets; `mask.ts` keeps its tests.
- Known breakages from moving into `cli/dist` (handle in phase 0): `import.meta.url` reads of `../package.json` in `bin/agentry.mjs`, `lib/fix.mjs` and `lib/scan.mjs`; reads of `./renames.json` in `lib/fix-rules.mjs` and `lib/doctor.mjs`; `lib/scan.mjs` hashes the CLI's own directory for its cache key; the pty test spawns `bin/agentry.mjs`; `scripts/install.sh` (`link_agentry`) looks for `bin/agentry.mjs` at the repo root and runs `npm install` and `npm link` there.
- The catalog stays as it is: `catalog refresh` shallow-clones agentry-labs into `<cacheDir>/catalog` (override with `AGENTRY_CATALOG_REPO`). `scan` and `catalog` read `bundles.tsv` from the user's project, so no code change is expected; phase 3 verifies it.
- Repo rules still apply: update `CLAUDE.md`, `README.md` and `bundles.tsv` per the "Keeping the docs current" table; run `node skills/skill-architect/scripts/validate.mjs skills/*/` before committing. `cli/` is not a skill, so it is in no bundle in `bundles.tsv`, and the installer must not copy it into other projects.
- Verify against current docs via Context7 before coding: TypeScript `nodenext` module resolution and JSON import attributes, and Ink 8 with `react-jsx`.

## Phase 0: Same CLI, now in `cli/` and built to `cli/dist`

**Value:** `agentry` runs from `cli/dist` with every command and test working, and the old root-level JavaScript CLI and Node project files are gone. Nothing is typed yet; the point is a green baseline that builds.
**Done when:** `cd cli && npm install && npm run build && npm test` pass; `npm link` in `cli/` then `agentry status --json`, `agentry shelf list` and `agentry ui` (opens, tabs switch, `q` quits) work; `agentry --version` prints the package version; at the repo root `git ls-files` shows no `bin/`, `lib/`, `tui/`, `test/`, `package.json` or `package-lock.json` and there is no root `node_modules`; `git log --follow cli/src/lib/shelf.ts` shows pre-move history; `./scripts/install.sh --source . --bundle global --dry-run` still succeeds and copies nothing from `cli/`.

| Done | Task | Model |
|---|---|---|
| [x] | Create `cli/` and `git mv` into it: `bin/` `lib/` (with `renames.json`) `tui/` `test/` to `cli/src/`, `package.json` and `package-lock.json` to `cli/`. Rename `.mjs` to `.ts`, rewrite `.mjs` import specifiers to `.js`, and add `// @ts-nocheck` to line 1 of every converted file (after the shebang in the bin file) so `tsc` passes before typing starts. Keep `test/helpers/`. | claude-haiku-5-5 |
| [x] | Write `cli/package.json` (name `@ersanyamarya/agentry-cli`, keep `type` module, `bin` `agentry`, `files`, `engines`, `publishConfig.access` public, `repository` with `directory` `cli`, `license`, scripts `build`, `typecheck`, `test`, `prepare`, `prepublishOnly`, `dev`, add the TypeScript devDependencies) and `cli/tsconfig.json` (nodenext, `rootDir` src, `outDir` dist, `strict` off for now, `resolveJsonModule`, `jsx` react-jsx). Add `cli/dist/` and `cli/node_modules/` to the root `.gitignore`; delete the root `node_modules`. | claude-haiku-5-5 |
| [x] | Fix the dist-path breakages in Ground rules: add `cli/src/lib/version.ts` and use it in `bin`, `fix` and `scan`; load `renames.json` through a JSON import with attributes (or a copy step in `build`) in `fix-rules` and `doctor`; confirm `scan.ts`'s cache-key directory walk still hashes the compiled code; make the pty test spawn `cli/dist/bin/agentry.js`. | claude-sonnet-5-5 |
| [x] | Update `scripts/install.sh` `link_agentry` (and the `--global` header comment) to find `cli/package.json`, run `npm install` and `npm link` in `cli/`, and use `cli/` of the `~/.agentry-labs` clone. Make sure no bundle or type copy picks up `cli/`. Check with `--dry-run` for the `global`, `flutter`, `mongodb` and `web` bundles. | claude-sonnet-5-5 |
| [x] | Run `npm install`, `npm run build` and `npm test` in `cli/`; fix every failure that comes from the move (paths, extensions, ESM and Ink resolution), without changing behaviour. Record anything surprising in the Decisions log. | claude-sonnet-5-5 |
| [x] | Add `.github/workflows/cli.yml` (path filter `cli/**`) running `npm ci`, `npm run build`, `npm test` in `cli/` on Node 22 and 26. | claude-haiku-5-5 |

## Phase 1: Type the library and the router

**Value:** the non-UI code is strictly typed and `npm run typecheck` guards it. Config shapes (settings, MCP, plugins, hooks, inventory items) are defined once.
**Done when:** `cd cli && npm run typecheck` reports 0 errors with `strict` true for everything under `src/bin` and `src/lib`; `grep -rn "ts-nocheck" src/bin src/lib` finds nothing; `npm test` passes; no new `any` outside `src/test/` (`grep -rnE ": any|as any" src/bin src/lib` is empty or each hit has a one-line comment).

| Done | Task | Model |
|---|---|---|
| [x] | Write `cli/src/lib/types.ts`: shapes for `settings.json`, `.mcp.json`, `installed_plugins.json`, hook entries, inventory items, findings and severities, as read by `lib/inventory/*` and `lib/doctor-rules`. Derive them from the code and `docs/claude-config-sources.md`; mark fields optional where Claude itself treats them so. | claude-sonnet-5-5 |
| [x] | Convert the leaf modules to strict TS and remove their `ts-nocheck`: `json-edit`, `mask`, `paths`, `tokens`, `scan-cache`, `discover`, `backups`. Update their tests' types. | claude-sonnet-5-5 |
| [x] | Convert `lib/inventory/*`, `status`, `doctor`, `doctor-rules` to strict TS using `types.ts`. | claude-sonnet-5-5 |
| [x] | Convert `shelf`, `catalog`, `rules`, `plugin-toggle`, `plugin-install`, `mcp-toggle`, `mcp-edit`, `hook-toggle` to strict TS. The injectable dependencies (`run`, `out`, `confirm`, `now`) get explicit function types. | claude-sonnet-5-5 |
| [x] | Convert `fix`, `fix-rules`, `fix-undo`, `scan` to strict TS. These write user files: do not change any control flow, only add types, and keep the backup and undo tests unchanged. | claude-sonnet-5-5 |
| [x] | Convert `cli/src/bin/agentry.ts` (command router) to strict TS, set `strict` true in `tsconfig.json` for the whole project except `src/tui`, and add `npm run typecheck` to the CLI workflow. | claude-sonnet-5-5 |

## Phase 2: TUI in TSX

**Value:** the Ink UI is written in JSX with typed props, replacing the `React.createElement` calls. The whole project is strict.
**Done when:** `cd cli && npm run typecheck` reports 0 errors with `strict` true for all of `src`; `grep -rn "ts-nocheck\|createElement" src` finds nothing; `npm test` passes including `tui-*` tests and the pty test; `agentry ui` works by hand: every tab opens, `/` search, `m` marks and one bulk preview work, `q` quits cleanly.

| Done | Task | Model |
|---|---|---|
| [x] | Convert `tui/components/*` (12 files) to `.tsx` with JSX and typed props. Rename imports to `.js`. | claude-sonnet-5-5 |
| [x] | Convert `tui/use-cursor`, `use-list`, `use-flow`, `bulk-flow`, `editor`, `recents`, `clipboard`, `layout`, `rows`, `theme`, `data` to strict TS (`.ts`, or `.tsx` where they render). | claude-sonnet-5-5 |
| [x] | Convert the flows (`mcp-flow`, `hook-flow`, `plugin-flow`, `move-flow`, `remove-flow`), `app` and `index` to `.tsx`; make `tsconfig.json` fully strict and delete the `src/tui` exception. | claude-sonnet-5-5 |
| [x] | Update the `tui-*` tests and `ink-testing-library` usage to the typed components; fix type errors in `src/test/helpers/`. | claude-sonnet-5-5 |

## Phase 2.1: Biome and Ultracite for lint and format

**Value:** one formatter and linter for all of `cli/`, wired into `npm run lint`, `npm run format` and CI, so later work stays consistent. Runs after Phase 2 so the one-time reformat does not collide with the TSX conversion.
**Done when:** `cd cli && npm run lint` reports 0 errors; `npm run format` leaves `git diff` empty; `npm run build` and `npm test` pass; CI runs lint; the reformat is its own commit so `git blame --ignore-rev` can skip it.

| Done | Task | Model |
|---|---|---|
| [ ] | Verify current Biome and Ultracite setup via Context7, then add `@biomejs/biome` and `ultracite` as devDependencies in `cli/`, run the Ultracite init for Biome (no editor or AI-rule files unless the user asks), write `cli/biome.jsonc` extending Ultracite's preset, and add scripts `lint`, `format`, `check`. Tune only rules that fight existing code (record each in the Decisions log); no blanket disables. | claude-sonnet-5-5 |
| [ ] | Apply the formatter and safe fixes in one commit (`style(cli): biome format`), add its hash to `cli/.git-blame-ignore-revs`, fix the remaining lint errors by hand without changing behaviour, then add `npm run lint` to `.github/workflows/cli.yml`. | claude-sonnet-5-5 |

## Phase 2.2: TUI visual polish

**Value:** `agentry ui` looks clearer: consistent colours, icons, borders, spinners and status line. Behaviour, keys and data shown stay the same.
**Done when:** `npm test` passes (update snapshot-style tui tests only for intended visual changes); every tab renders with icons and degrades to plain ASCII when `NO_COLOR` is set, `TERM=dumb`, or `AGENTRY_ASCII=1`; the user has looked at each tab and approved.

Icons: Phosphor ships SVG and DOM React components, which a terminal cannot draw, so it is not usable here. Use the `figures` package (Unicode with ASCII fallback) as the default icon set, plus `ink-spinner` and `ink-gradient` where they help. Nerd Font glyphs are an opt-in (`AGENTRY_ICONS=nerd`) because they need the user's terminal font. Verify package versions and Ink 8 compatibility via Context7 before adding any.

| Done | Task | Model |
|---|---|---|
| [ ] | Add one `src/tui/icons.ts` (icon map by kind: skill, agent, rule, plugin, MCP, hook, on/off, warning, error; unicode default, ASCII fallback, optional nerd set) and extend `src/tui/theme.ts` with semantic colours; add tests for the fallbacks. | claude-sonnet-5-5 |
| [ ] | Apply icons, rounded borders, tab bar, status footer with key hints, and spinners to the components and flows; keep layout working at 80 columns. Screenshot or capture each tab for the user to review. | claude-sonnet-5-5 |

## Phase 3: Docs, references and catalog check

**Value:** the repo's docs and skills describe the CLI at its new location, the CLI's design docs live beside it, and the CLI is proven to work against the real catalog from outside this repo. No reference to the old root-level layout remains.
**Done when:** a fresh `git clone` of this repo followed by `cd cli && npm ci && npm test && npm link` works; from `~` (not inside this repo), `agentry catalog refresh` then `agentry catalog list --json` lists skills, agents, rules and CLAUDE.md files; `agentry scan ~/ws/aryantriki/agentry-labs --json` reads `bundles.tsv`; `node skills/skill-architect/scripts/validate.mjs skills/*/` passes; the per-term sweep in the last task finds only references to `cli/`.

| Done | Task | Model |
|---|---|---|
| [ ] | `git mv` `docs/shelf-cli-plan.md`, `gaps-plan.md`, `open-items-plan.md` and `claude-config-sources.md` into `cli/docs/` and fix every link to them (README, CLAUDE.md, the docs themselves, the code comment in `lib/catalog` or wherever they are cited). | claude-haiku-5-5 |
| [ ] | Write `cli/README.md` (what agentry is, build and link steps, the command reference moved out of the root README, catalog source and `AGENTRY_CATALOG_REPO`) and `cli/CLAUDE.md` (layout, `npm run build`, `npm test`, `npm run typecheck`, conventions: strict TS, `.js` import specifiers, injectable deps in tests). | claude-haiku-5-5 |
| [ ] | Edit the root `CLAUDE.md` and `README.md`: Architecture shows `cli/` in place of `bin/ lib/ tui/ test/`; "Common Commands" CLI lines say `cd cli && npm install && npm test` and `npm link` from `cli/`; the root README keeps a short CLI section that links to `cli/README.md`; the "Keeping the docs current" table gains a row for `cli/`. Edit `skills/agentry/SKILL.md` so its missing-command hint says `cd cli && npm install && npm link` (or `scripts/install.sh --global`); check the other skills and `rules/` for `agentry` references that assume the old root layout. | claude-haiku-5-5 |
| [ ] | Run the catalog and scan checks from "Done when" outside this repo. If any code assumes the CLI sits at the repo root or beside `bundles.tsv`, `skills/` or `global/`, fix it and add a test. | claude-sonnet-5-5 |
| [ ] | Prove the package is publishable without publishing: run `npm pack` in `cli/`, list the tarball (`dist`, README, LICENSE, `package.json` only; no tests if avoidable, no source maps of secrets, no repo files), install the tarball into an empty temp dir with `npm i`, and run `./node_modules/.bin/agentry --version`, `status --json`, `shelf list` and `ui` from there. Fix any file the CLI reads outside its own package. Do not run `npm publish`. | claude-sonnet-5-5 |
| [ ] | Sweep for leftovers: run `grep -rn` once per term (`bin/agentry.mjs`, `lib/`, `tui/`, `npm link`, `npm test`, `package.json`, `.mjs` paths under the old layout) over the repo, excluding `node_modules`, `.git`, `cli/dist` and `graft`, and resolve every hit that points at the old layout. Refresh the trail index so `graft/` has no cards for deleted paths. | claude-haiku-5-5 |

## Phase 4: Clean this machine and finish

**Value:** `agentry` on this machine is the new TypeScript build, nothing from the old JavaScript install is left behind, and this plan is removed from the repo.
**Done when:** `command -v agentry` resolves to the new link; `readlink -f "$(command -v agentry)"` ends in `agentry-labs/cli/dist/bin/agentry.js`; `agentry status --json` and `agentry doctor --json` run from `~` and from this repo; `npm ls -g --depth=0` shows `@ersanyamarya/agentry-cli` linked from `cli/` and no `agentry-labs`; `~/.agentry-labs` does not exist or its `cli/dist` is built; the old scan cache is gone and rebuilt on the next scan; `~/.claude/backups/agentry` is untouched; `docs/ts-migration-plan.md` is deleted in the last commit.

| Done | Task | Model |
|---|---|---|
| [ ] | With the user's approval for each command: `npm unlink -g agentry-labs` (the old package name; also `npm rm -g agentry-labs` if it still lists), `mise reshim`, confirm the old shim target is gone, then `npm link` in `agentry-labs/cli` and `mise reshim` again. If `~/.agentry-labs` exists, rebuild its `cli/` or remove it. | claude-haiku-5-5 |
| [ ] | Find the CLI cache dir (`paths.cacheDir` in `cli/src/lib/paths.ts`), show its contents to the user, and with approval delete the old `scan` cache files only; leave the cached `catalog` clone and `~/.claude/backups/agentry` alone. | claude-haiku-5-5 |
| [ ] | End-to-end check from a clean clone: `git clone` this repo into a temp dir, `cd cli && npm ci && npm test`, then run the "Done when" commands on the linked build. Report any leftover reference to the old layout or old install. | claude-sonnet-5-5 |
| [ ] | In the final commit delete `docs/ts-migration-plan.md` (git history keeps it) and confirm `git status` is clean. | claude-haiku-5-5 |

## Out of scope

- Actually publishing to npm (no `npm publish`, no npm token or provenance setup, no release workflow); phase 3 only proves the tarball works.
- Any compile step beyond `tsc`: no bundler, no `tsup`.
- A second git repository, a git submodule, or npm workspaces at the repo root.
- New CLI features, renamed commands, or changes to what data the TUI shows (Phase 2.2 changes only how it looks).
- Moving the skill scripts (`skills/*/scripts/*.mjs`) to TypeScript; they stay plain `.mjs` and self-contained.
- Deleting `~/.claude/backups/agentry` or any user config the CLI backed up.
- Bundling the catalog inside the CLI.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-05 | First draft put the CLI in a new repo at `~/ws/aryantriki/agentry`; superseded the same day. |
| 2026-11-05 | The CLI stays in the agentry-labs repository as a plain subdirectory `cli/`: same git repo, no submodule, no workspaces. Directory name `cli/` chosen as the default; rename it in phase 0 if the user prefers another. |
| 2026-11-05 | Build with `tsc` to `cli/dist`, no native type stripping and no bundler, because the user wants the CLI to be the `dist` output. |
| 2026-11-05 | Files move with `git mv`, so history for the CLI is kept (no filter-repo step needed in a single repo). |
| 2026-11-05 | The catalog stays reached through the existing `catalog refresh` clone; no bundling and no new flag unless phase 3 finds a code path that needs the CLI at the repo root. |
| 2026-11-05 | Cleanup covers the old root-level CLI code, tests and package files (phase 0), stale references and docs (phase 3), the old global link, mise shim and scan cache on this machine (phase 4), and this plan file itself. Backups under `~/.claude/backups/agentry` are user data and stay. |
| 2026-11-05 | Package name is `@ersanyamarya/agentry-cli`, command `agentry`, to be published to npm later. This plan makes it publishable (self-contained tarball, `files`, `publishConfig`, `repository.directory`) and proves it with `npm pack`, but does not publish. |
| 2026-11-05 | Models: claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5 (latest of each); no task needs Opus. |
| 2026-11-05 | Phase 0 adds `// @ts-nocheck` to every converted file so the build is green before typing starts; phases 1 and 2 remove it file by file. |
| 2026-11-05 | Added Phase 2.1 (Biome + Ultracite) and 2.2 (TUI polish) at user request. Biome runs after Phase 2 because it reformats every file. Phosphor icons need SVG/DOM so they cannot render in Ink; use `figures` (Unicode with ASCII fallback), Nerd Font opt-in. |
