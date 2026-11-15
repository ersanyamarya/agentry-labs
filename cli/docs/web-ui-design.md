# Web UI design

Design source: https://claude.ai/artifact/8vveH6tfBvzc3xQWgWoEMq (private canvas: Skills, Doctor, Catalog, TUI, Sidebar artboards). This file is the copy to build from.

## Decisions

- **Local only.** `agentry ui` starts a server on `127.0.0.1`, prints the URL and opens the browser. No hosted version.
- **Same logic as the TUI.** The web server calls `@agentry/core` (today's `src/lib`). Web and TUI never import each other.
- **Sidebar, not top tabs.** Nine sections in three groups, in both the web UI and the TUI:
  - Setup: Skills, MCP, Hooks, Plugins, Rules, Agents
  - Discover: Catalog
  - Health: Doctor, Backups
- **Scope switcher** at the top of the sidebar: All projects (`~/.claude`) or This project.
- **Same keys everywhere.** `space` load or unload, `m` move, `*` mark, `x` remove, `X` delete, `/` search, `?` help, `q` quit (TUI), `tab` moves focus between sidebar and list. On the web they show as `kbd` chips on the buttons and work as shortcuts.
- **Stack.** TanStack Start (Router + Query), React, Tailwind, shadcn components, oRPC contract between UI and server, Vitest + Testing Library, Biome/Ultracite. Mirrors `gentlemans-stack/apps/todo-ui`.

## Tokens (dark, shadcn zinc + green)

| Token | Value | Use |
| --- | --- | --- |
| background | `#09090b` | page |
| sidebar | `#0c0c0f` | sidebar, TUI keys bar |
| card | `#0f0f12` | cards, tables |
| muted-surface | `#111114` | inputs, segmented controls |
| selected | `#18181d` / `#1c1c21` | selected row / active nav item |
| border | `#27272a` | all borders; rows use `#1f1f23` |
| foreground | `#fafafa` | main text |
| body | `#d4d4d8` | paragraphs |
| muted | `#a1a1aa` | secondary text |
| dim | `#8e8e98` | labels, counts (4.5:1 on all surfaces; do not go darker) |
| accent / on | `#4ade80` (badge bg `#14301f`) | loaded, all projects, passing |
| project / warn | `#fbbf24` (badge bg `#33280a`) | this project, warnings |
| error | `#f87171` (badge bg `#3b1414`, border `#4a1d1d`) | errors, Remove |
| cursor | `#38bdf8` | TUI cursor `›` |

Fonts: Inter (UI), JetBrains Mono (names, paths, keys, counts). Radii: 8px controls, 12px cards, 6px nav items, pill badges. Touch targets at least 44px. The TUI uses the same names through `src/tui/theme.ts`.

## Layout

- **No containers, full width (decided 2026-11-12).** Content sits flat on the page background and uses the whole width next to the sidebar: no `max-width`, no bordered or filled cards around tables, lists, findings or the catalog. Structure comes from spacing and hairline dividers (`border-t` in `#1f1f23`), not boxes. The `card` token is for floating surfaces only (dialogs, sheets, popovers). Where this section below says "card", read "flat block". Padding is comfortable: 32px sides, 24px between blocks, rows at least 56px high.
- **Shell:** 240px sidebar + fluid content (`max-w` none, 28/32px padding). Under 800px the sidebar stacks above the content.
- **Sidebar:** brand (`agentry`, version), scope switcher, three labelled groups with counts, Doctor shows a red count pill, footer shows `● N problems` and a `?` hint. Active item: `#1c1c21` background, white text, `aria-current="page"`.
- **List screens** (Skills, MCP, Hooks, Plugins, Rules, Backups): title + summary line, "Add" button, search input (`/`) + segmented filter, table (switch, name + one-line description, scope badge, bundle) with a key hint line below, and a details panel on the right (name, scope badge, description, path, scope segmented control, Move / Remove with key chips). The panel is a Sheet below 1100px.
- **Doctor:** three stat cards (errors, warnings, passing), then one card per finding: severity badge, title, area, explanation, the command that fixes it in a code box, and a primary "Fix it" button. Passing checks collapse into one row.
- **Catalog:** search + bundle filter (All, general, web, flutter, flutter-assets, mongodb), responsive card grid (`minmax(280px, 1fr)`), each card: name, bundle badge, description, Add / Added.
- **TUI:** 22-column left rail (16 columns from 70 wide, hidden below) with the same sections and counts, list on the right with `›` cursor, `●` loaded or on, `◐` partial, `○` not loaded or off, a description line for the selected row, and a keys bar at the bottom.

## Server and security

- Bind `127.0.0.1` only. Pick a free port; `--port` overrides.
- A random token is generated on launch, put in the opened URL, exchanged for an HttpOnly SameSite=Strict cookie, and required on every call.
- Reject requests whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`, and mutating requests whose `Origin` differs (blocks DNS rebinding and cross-site writes).
- Every write goes through the same backup-first functions the TUI uses (`src/lib/backups.ts`), so Undo works the same.

## Packaging

npm workspaces under `cli/`: `packages/core`, `packages/tui`, `packages/web`, and the existing CLI. One published package: `@ersanyamarya/agentry-cli` ships the built web app, and `agentry ui` serves it. Import boundaries are checked in CI: `core` imports no UI; `tui` and `web` import `core` only.
