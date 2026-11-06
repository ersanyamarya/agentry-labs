# CLAUDE.md

Guidance for working on the `agentry` CLI in `cli/`. The repo-wide guidance is in the root `CLAUDE.md`.

## Commands

Run from `cli/`:

```bash
npm install          # deps
npm run build        # tsc: src/ -> dist/ (entry: dist/bin/agentry.js)
npm test             # tsc, then node --test dist/test
npm run typecheck    # tsc --noEmit
npm run lint         # biome lint .
npm run format       # biome format --write .
npm run check        # biome check .
npm link             # puts `agentry` on PATH from dist/ (run npm run build first)
```

`npm test` runs against `dist/`, so tests see the compiled code; there is no separate test runner.

## Layout

- `src/bin/agentry.ts`: command router
- `src/lib/`: command modules; `types.ts` holds config shapes; `version.ts` holds the package version; `renames.json` is a data file read at runtime
- `src/lib/inventory/`: readers for skills, MCP servers, hooks and plugins
- `src/tui/`: Ink UI in TSX (`app.tsx`, `components/`, pure helpers such as `rows.ts`, `icons.ts`, `theme.ts`)
- `src/test/`: `node:test` suites (`*.test.ts`, TUI tests `tui-*.test.ts`); `src/test/helpers/` builds temp HOME and project dirs
- `docs/`: design docs; `claude-config-sources.md` is the spec for the inventory readers
- `dist/`, `node_modules/`: generated, git-ignored

## Conventions

- **Strict TypeScript.** `tsconfig.json` sets `strict`, `module` and `moduleResolution` to `nodenext`, `rootDir` to `src`. Do not add `any` or `@ts-nocheck`; `any` is allowed only in `src/test/`, and each use outside it needs a one-line comment.
- **ESM `.js` specifiers.** Local imports end in `.js` (`import { x } from "./paths.js"`), even though the source is `.ts`.
- **Injectable dependencies.** Anything that touches the outside world (`run`, `out`, `confirm`, `now`, `readDefaults`) is a parameter with an explicit function type, so tests pass a fake.
- **Tests never touch the real home.** Use `src/test/helpers/` to set `AGENTRY_HOME` and `CLAUDE_CONFIG_DIR` to temp dirs. Never read the real `~/.claude`.
- **Behaviour first.** Refactors and type work do not change control flow. Changes to what a command does are a separate, reviewed change.
- **User files are backed up.** Writes to settings, `.mcp.json`, skills or `~/.claude.json` go through the fix or backup path; backups under `~/.claude/backups/agentry` are user data. Never print secrets; `mask.ts` masks them.
- **Lint and format with Biome.** `biome.jsonc` extends Ultracite (`ultracite/biome/core` and `ultracite/biome/react`). Run `npm run check` before committing. Rule exceptions in `biome.jsonc` have a comment saying why; add one for any new exception.
- **No `Co-Authored-By` or AI attribution** in commits or PR text.
