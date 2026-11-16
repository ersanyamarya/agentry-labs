# CLAUDE.md

Guidance for working on the `agentry` CLI in `cli/`. The repo-wide guidance is in the root `CLAUDE.md`.

## Commands

Run from `cli/` (the npm workspace root; one `npm install` links every package):

```bash
npm install                  # deps for the CLI and all packages/*
npm run build                # builds the web app (vite) into dist/web, then esbuild bundles src/bin/agentry.ts plus workspace code -> dist/bin/ (lazy TUI and web chunks)
npm test                     # builds dist/ once (globalSetup), then vitest runs the cli, core, tui and web projects
npx vitest run --project core   # one package's tests (cli | core | tui | web)
npm run typecheck            # tsc -p packages/core && tsc -p packages/tui && tsc -p .  (noEmit; esbuild does the emit)
npm run lint                 # biome lint .
npm run format               # biome format --write .
npm run check                # biome check . (includes the package boundary rules)
npm run pack:check           # builds, packs, checks the size budget, installs the tarball into a temp prefix, runs agentry --help/--version/status, and starts agentry ui from the install
npm link                     # puts `agentry` on PATH from dist/ (run npm run build first)
```

The CLI subprocess tests spawn the built `dist/bin/agentry.js`, which `npm test` builds first.

## Layout

npm workspaces. One published package (`@ersanyamarya/agentry-cli`, this folder). The `packages/*` are private and
their `exports` point at TypeScript source. They reach the tarball only by being bundled into `dist/bin`, never as
`node_modules` entries.

- `src/bin/agentry.ts`: command router; imports `@agentry/core/*` and lazily `@agentry/tui`
- `packages/core/` (`@agentry/core`, imported per file as `@agentry/core/<file>`): command modules; `types.ts` holds config shapes; `version.ts` finds the CLI's `package.json` by walking up; `renames.json` is imported as JSON (inlined by the bundle); `data.ts` (`createData`) is the facade both UIs call
- `packages/core/src/copilot-command.ts`: `agentry copilot status|share|unshare|trust|untrust` (`createCopilotCommand`), over `copilot-share.ts` and `copilot-trust.ts` and the facade's `copilotState`; the router in `src/bin/agentry.ts` only parses (`COPILOT_USAGE`, `runCopilot`). Exit codes: 0 done, previewed, declined or already so; 1 refused or failed (also "Copilot not found"); 2 usage (ambiguous name needs `--kind`). Tests: `src/test/copilot.test.ts` (spawn, fixture home, fake `pgrep`)
- `packages/core/src/inventory/`: readers for skills, MCP servers, hooks and plugins, and `copilot.ts` for what GitHub Copilot loads (spec: `docs/copilot-config-sources.md`)
- `packages/tui/` (`@agentry/tui`, exports `run` from `src/index.tsx`): Ink UI in TSX (`app.tsx`, `components/`, pure helpers such as `rows.ts`, `icons.ts`, `theme.ts`)
- `packages/web/` (`@agentry/web`): TanStack Start app and its local server. `src/serve.ts` + `src/serve/` are the token/cookie/Host/Origin server the CLI imports as `@agentry/web/serve`; `src/contract/` is the oRPC contract, `src/server/router.ts` implements it over `createData`; `src/components/` the screens (shared `list-screen`, `details-panel`, `preview-flow`); `src/components/ui/` is shadcn output, kept as shipped. Design: `docs/web-ui-design.md`
- User-visible text: `packages/core/src/messages.ts` and `messages/en.ts` (the `terms` glossary and typed messages, English only today, read through `@agentry/core/messages`). TUI and web take every word from there; `src/test/messages-guard.test.ts` fails on new hard-coded user-facing text in tui and web
- Boundaries (Biome `noRestrictedImports` overrides plus `noUndeclaredDependencies` per `package.json`): core imports no `react`, `ink*` or `@tanstack/*`; tui and web import `@agentry/core/*` only, never each other
- Tests sit with the package whose code they import: `packages/core/src/test/` (in-process lib tests), `packages/tui/src/test/` (`tui-*.test.ts`, helper `helpers/tui.tsx`), `src/test/` (tests that spawn the CLI: router, scan, shelf and the other command tests, `tui-pty`, `tui-loader`)
- `src/test/helpers/`: shared by every package's tests: `fixture.ts` and `fake-claude.ts` build temp HOME and project dirs, `paths.ts` locates the CLI root and bin, `build.ts` is the vitest globalSetup, `pty-run.py` drives the TUI in a pty
- `vitest.config.ts` (projects `cli`, `core`, `tui`), `tsconfig.base.json` (shared options, `noEmit`) extended by each `tsconfig.json`, `biome.jsonc` covers all packages
- `docs/`: design docs; `claude-config-sources.md` and `copilot-config-sources.md` are the specs for the inventory readers; `web-ui-design.md` is the web UI spec
- `dist/`, `node_modules/`: generated, git-ignored

## Conventions

- **Strict TypeScript.** `tsconfig.base.json` sets `strict`, `module` and `moduleResolution` to `nodenext`, `noEmit`. Do not add `any` or `@ts-nocheck`; `any` is allowed only in test folders (`src/test/`, `packages/*/src/test/`), and each use outside them needs a one-line comment.
- **ESM `.js` specifiers.** Relative imports end in `.js` (`import { x } from "./paths.js"`), even though the source is `.ts`. Cross-package imports use the package name without an extension (`@agentry/core/paths`), never a relative path into another package.
- **Bundle externals match `dependencies`.** Every `--external:` in the `build` script is in the root `dependencies` and the reverse also holds; workspace packages are root devDependencies and get inlined. A package's shared dependency ranges match the root's exactly.
- **Injectable dependencies.** Anything that touches the outside world (`run`, `out`, `confirm`, `now`, `readDefaults`) is a parameter with an explicit function type, so tests pass a fake.
- **Tests never touch the real home.** Use `src/test/helpers/` to set `AGENTRY_HOME` and `CLAUDE_CONFIG_DIR` to temp dirs. Never read the real `~/.claude` or `~/.copilot` (tests also clear `COPILOT_HOME`).
- **Words and keys.** User-facing words are the glossary terms (library, bundle, this project, all projects, loaded, added); command names, flags (`--global`, `--group`) and JSON fields keep their names. Key tables live in `cli/README.md`; change them there and in the footer and help text together
- **Behaviour first.** Refactors and type work do not change control flow. Changes to what a command does are a separate, reviewed change.
- **User files are backed up.** Writes to settings, `.mcp.json`, skills or `~/.claude.json` go through the fix or backup path; backups under `~/.claude/backups/agentry` are user data. Never print secrets; `mask.ts` masks them.
- **Lint and format with Biome.** `biome.jsonc` extends Ultracite (`ultracite/biome/core` and `ultracite/biome/react`). Run `npm run check` before committing. Rule exceptions in `biome.jsonc` have a comment saying why; add one for any new exception.
- **No `Co-Authored-By` or AI attribution** in commits or PR text.
