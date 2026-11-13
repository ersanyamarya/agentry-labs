# CLAUDE.md

Guidance for working on the `agentry` CLI in `cli/`. The repo-wide guidance is in the root `CLAUDE.md`.

## Commands

Run from `cli/` (the npm workspace root; one `npm install` links every package):

```bash
npm install                  # deps for the CLI and all packages/*
npm run build                # esbuild bundles src/bin/agentry.ts plus workspace code -> dist/bin/ (lazy TUI chunk)
npm test                     # builds dist/ once (globalSetup), then vitest runs the cli, core and tui projects
npx vitest run --project core   # one package's tests (cli | core | tui)
npm run typecheck            # tsc -p packages/core && tsc -p packages/tui && tsc -p .  (noEmit; esbuild does the emit)
npm run lint                 # biome lint .
npm run format               # biome format --write .
npm run check                # biome check . (includes the package boundary rules)
npm run pack:check           # builds, packs, installs the tarball into a temp prefix and runs agentry --help/--version/status
npm link                     # puts `agentry` on PATH from dist/ (run npm run build first)
```

The CLI subprocess tests spawn the built `dist/bin/agentry.js`, which `npm test` builds first.

## Layout

npm workspaces. One published package (`@ersanyamarya/agentry-cli`, this folder). The `packages/*` are private and
their `exports` point at TypeScript source. They reach the tarball only by being bundled into `dist/bin`, never as
`node_modules` entries.

- `src/bin/agentry.ts`: command router; imports `@agentry/core/*` and lazily `@agentry/tui`
- `packages/core/` (`@agentry/core`, imported per file as `@agentry/core/<file>`): command modules; `types.ts` holds config shapes; `version.ts` finds the CLI's `package.json` by walking up; `renames.json` is imported as JSON (inlined by the bundle); `data.ts` (`createData`) is the facade both UIs call
- `packages/core/src/inventory/`: readers for skills, MCP servers, hooks and plugins
- `packages/tui/` (`@agentry/tui`, exports `run` from `src/index.tsx`): Ink UI in TSX (`app.tsx`, `components/`, pure helpers such as `rows.ts`, `icons.ts`, `theme.ts`)
- `packages/web/` (`@agentry/web`, from Phase 3 of `docs/web-ui-plan.md`): TanStack Start app; the CLI imports `@agentry/web/serve`
- Boundaries (Biome `noRestrictedImports` overrides plus `noUndeclaredDependencies` per `package.json`): core imports no `react`, `ink*` or `@tanstack/*`; tui and web import `@agentry/core/*` only, never each other
- Tests sit with the package whose code they import: `packages/core/src/test/` (in-process lib tests), `packages/tui/src/test/` (`tui-*.test.ts`, helper `helpers/tui.tsx`), `src/test/` (tests that spawn the CLI: router, scan, shelf and the other command tests, `tui-pty`, `tui-loader`)
- `src/test/helpers/`: shared by every package's tests: `fixture.ts` and `fake-claude.ts` build temp HOME and project dirs, `paths.ts` locates the CLI root and bin, `build.ts` is the vitest globalSetup, `pty-run.py` drives the TUI in a pty
- `vitest.config.ts` (projects `cli`, `core`, `tui`), `tsconfig.base.json` (shared options, `noEmit`) extended by each `tsconfig.json`, `biome.jsonc` covers all packages
- `docs/`: design docs; `claude-config-sources.md` is the spec for the inventory readers; `web-ui-design.md` is the web UI spec
- `dist/`, `node_modules/`: generated, git-ignored

## Conventions

- **Strict TypeScript.** `tsconfig.base.json` sets `strict`, `module` and `moduleResolution` to `nodenext`, `noEmit`. Do not add `any` or `@ts-nocheck`; `any` is allowed only in test folders (`src/test/`, `packages/*/src/test/`), and each use outside them needs a one-line comment.
- **ESM `.js` specifiers.** Relative imports end in `.js` (`import { x } from "./paths.js"`), even though the source is `.ts`. Cross-package imports use the package name without an extension (`@agentry/core/paths`), never a relative path into another package.
- **Bundle externals match `dependencies`.** Every `--external:` in the `build` script is in the root `dependencies` and the reverse also holds; workspace packages are root devDependencies and get inlined. A package's shared dependency ranges match the root's exactly.
- **Injectable dependencies.** Anything that touches the outside world (`run`, `out`, `confirm`, `now`, `readDefaults`) is a parameter with an explicit function type, so tests pass a fake.
- **Tests never touch the real home.** Use `src/test/helpers/` to set `AGENTRY_HOME` and `CLAUDE_CONFIG_DIR` to temp dirs. Never read the real `~/.claude`.
- **Behaviour first.** Refactors and type work do not change control flow. Changes to what a command does are a separate, reviewed change.
- **User files are backed up.** Writes to settings, `.mcp.json`, skills or `~/.claude.json` go through the fix or backup path; backups under `~/.claude/backups/agentry` are user data. Never print secrets; `mask.ts` masks them.
- **Lint and format with Biome.** `biome.jsonc` extends Ultracite (`ultracite/biome/core` and `ultracite/biome/react`). Run `npm run check` before committing. Rule exceptions in `biome.jsonc` have a comment saying why; add one for any new exception.
- **No `Co-Authored-By` or AI attribution** in commits or PR text.
