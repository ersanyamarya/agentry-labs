# agentry

`agentry` shows and manages what a Claude Code session loads: skills, MCP servers, hooks, plugins, and CLAUDE.md and rule files. It keeps a skill library, backs up every file it changes, installs items from the agentry-labs catalog, and opens a terminal UI with `agentry tui` or a local web UI with `agentry ui`.

It is written in strict TypeScript (ESM) and needs Node.js 22 or newer. It lives in this repo's `cli/` folder; the repo overview is in the [root README](../README.md).

## Install

```bash
npm install -g @ersanyamarya/agentry-cli
agentry --version
```

## Build from source and link

```bash
cd cli
npm install
npm run build    # compiles src/ to dist/
npm link         # puts `agentry` on your PATH
agentry --version
```

Without linking, `npm install -g /path/to/agentry-labs/cli` also works.

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | `tsc`: compiles `src/` to `dist/`; the entry is `dist/bin/agentry.js` |
| `npm test` | builds `dist/` once, then `vitest run` |
| `npm run test:watch` | vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `biome lint .` |
| `npm run format` | `biome format --write .` |
| `npm run check` | `biome check .` |
| `npm run dev` | `tsc --watch` |

## Layout

- `src/bin/agentry.ts`: the command router
- `src/bin/agentry.ts`: the command router
- `packages/core/`: the command modules (shelf, catalog, scan, fix and undo, doctor, status, MCP, hook and plugin toggles, rules, backups, tokens, paths), `data.ts` (the facade both UIs call) and `inventory/` (readers for skills, MCP servers, hooks and plugins)
- `packages/tui/`: the Ink terminal UI (TSX) behind `agentry tui`
- `packages/web/`: the web UI behind `agentry ui` (TanStack Start, Tailwind, shadcn components) and its local server; `src/contract/` is the typed rpc between them, `src/server/router.ts` implements it over core
- These are npm workspaces; `npm run build` bundles them into the one published package with esbuild
- `src/test/`: vitest suites; `src/test/helpers/` builds a temp HOME and project
- `docs/`: design docs, including `claude-config-sources.md` (what Claude Code reads and where)

## Catalog

`agentry catalog refresh` makes a shallow git clone of the agentry-labs repo (`https://github.com/ersanyamarya/agentry-labs.git`) under `~/.claude/cache/agentry/catalog`. `catalog list`, `catalog add` and the TUI Catalog tab read from that clone.

To use another source, set `AGENTRY_CATALOG_REPO` to a git URL or a local path:

```bash
AGENTRY_CATALOG_REPO=/path/to/agentry-labs agentry catalog refresh
```

## Environment variables

| Variable | Effect |
|---|---|
| `AGENTRY_CATALOG_REPO` | Git URL or path to clone the catalog from (default: the agentry-labs repo) |
| `NO_COLOR` | Set and non-empty: no colour, and plain ASCII icons |
| `AGENTRY_ASCII=1` | Plain ASCII icons |
| `TERM=dumb` | Plain ASCII icons |
| `AGENTRY_ICONS=nerd` | Nerd Font glyphs for item kinds; needs a Nerd Font in the terminal |
| `AGENTRY_HOME` | Replaces the home directory the CLI uses (tests set it to a temp dir) |
| `CLAUDE_CONFIG_DIR` | Replaces `<home>/.claude` |

Icons are Unicode by default.

## Command reference

### Skill library, backups, scan, catalog and rules

```bash
agentry shelf list                        # bundles, the description tokens each costs when loaded, and where each is loaded
agentry shelf status [--json]             # what is loaded in this project and in all projects, plus broken links
agentry shelf on video audit/review       # several targets at once: a bundle, bundle/skill, or a skill name unique across bundles
agentry shelf on video --global           # ~/.claude/skills, all projects (default: this project only)
agentry shelf off video                   # remove those links
agentry shelf off --all                   # unload every library link in this project (add --global for all projects)
agentry shelf on audit --dry-run          # print the links and exclude lines it would change; write nothing
agentry shelf shelve pdf docs             # move ~/.claude/skills/pdf into the library as bundle docs
agentry shelf unshelve pdf                # move it back out of the library to ~/.claude/skills (all projects)
agentry shelf promote my-skill            # move this project's .claude/skills/my-skill to ~/.claude/skills (every project)
agentry shelf demote my-skill             # the reverse: ~/.claude/skills/my-skill into this project (add --dry-run to preview)
agentry shelf remove docs/pdf             # delete it; a copy is kept in ~/.claude/backups/agentry/removed/<time>/
agentry shelf remove docs/pdf --no-backup # delete it and keep no copy (add --dry-run to see which it would be)
agentry backups list [--json]             # fix backup sets, removed-skill and updated copies, with size and age
agentry backups restore <id> [--dry-run]  # move a removed skill or an updated copy back where it came from; never overwrites
agentry backups prune --older-than 30 --kind removed --dry-run   # or --all; --kind fix|removed|updated; previewed, then asked (--yes for scripts)
agentry backups delete <id>... [--yes]    # delete chosen backups; a fix set not yet undone can then not be undone
agentry scan ~/ws --find-skill pdf        # every repo/worktree with .claude/skills/pdf, git-tracked ones marked; --global adds ~/.claude/skills (--remove-skill keeps a copy unless --no-backup)
agentry scan ~/ws --remove-skill pdf --dry-run   # delete that folder from each (no copy; library links are skipped)
agentry catalog refresh                   # fetch the agentry-labs skill catalog (shallow git clone, cached)
agentry catalog list [--json]             # skills, agents, rules, CLAUDE.md files and MCP servers (kind/name), where each is added, "outdated" when it differs
agentry catalog add run-fallow --group dev # a skill goes into the library (not loaded); never overwrites
agentry catalog add agent/super-planner [--project]   # agent -> ~/.claude/agents (or .claude/agents)
agentry catalog add rule/context7          # rule -> ~/.claude/rules
agentry catalog add claude-md/BASIC_CLAUDE # -> ./CLAUDE.md, refused when the project has one
agentry catalog add mcp/trail --project --dry-run   # through `mcp add`: masked preview, backup, undo (--yes to apply)
agentry catalog update --all --dry-run     # or <item>...; lists every file it overwrites, saves the old copy under backups/updated/, asks (--yes for scripts)
agentry catalog remove agent/super-planner [--project]   # delete an added agent; a copy is kept under backups/removed/ (--no-backup, --dry-run, --yes)
agentry agents list [--json]               # agents added for you and this project, with model and listing cost
agentry rules list [--json]                # CLAUDE.md and rule files loaded here, with tokens
agentry rules remove CLAUDE.md [--dry-run] [--no-backup]   # delete one; a copy is kept in the backups
```

`list` estimates each bundle's cost as the frontmatter `description` of its skills and agents, at about four characters per token: what the bundle adds to every session once it is loaded. Project links are listed in `.git/info/exclude` (the shared one in a worktree), so they never show as untracked. `shelve` refuses to overwrite a folder, and both `shelve` and `unshelve` refuse while a link to the skill exists; run `off` first.

A bundle's agents sit in `~/.claude/skill-shelf/<bundle>/agents/*.md` (the `audit` bundle carries `slop-auditor-analyst`) and are linked into `.claude/agents` with its skills. Claude Code watches skill folders, so a running session picks skills up; start a new session if a linked agent doesn't show. To add another bundle, move its skill folders (and agents) into a new `~/.claude/skill-shelf/<bundle>/`. Leave `~/.claude/skills/synced/` alone: claude.ai manages it.

### agentry CLI

```bash
agentry --help                 # commands and options
agentry shelf list             # library bundles, their token cost and whether each is loaded
agentry shelf on video         # also: off <bundle>, off --all, shelve, unshelve; --global for all projects, --dry-run to preview
agentry mcp disable context7   # park a user-scope MCP server (also: enable, list-parked; --dry-run, --yes); undo with agentry fix --undo
agentry mcp disable plugin:context-mode:context-mode   # plugin, project (.mcp.json) and local servers: off for this project only (disabledMcpServers)
agentry mcp add files --command npx --arg=-y --arg @scope/files --env FILES_TOKEN=abc   # add a server (--url U --header K:V for http; --scope user|project; --dry-run, --yes)
agentry mcp set files --env FILES_TOKEN=new   # change env/args of a user server (--unset-env K, --arg=A replaces args); backed up, undoable
agentry hook list              # every hook with an 8-hex id; then: hook disable|enable|remove <id> [--scope S] [--dry-run] [--yes]
agentry plugin install demo@market --scope project   # claude plugin install through the preview/backup path; also: uninstall demo
agentry plugin disable demo    # also: enable; --scope user|project|local, --dry-run, --yes; backed up, undo with agentry fix --undo; refuses a plugin set by macOS MDM (names the source)
agentry doctor                  # findings with file, line and fix; duplicates (dup-hook-scope: a project hook a user hook also runs), retired trail MCP permissions (stale-mcp-permission), trail-hooks-missing (advice only); Copilot (when `~/.copilot` exists): copilot-broken-skill-link, copilot-coauthor, copilot-context7-local and copilot-dup-hook (a `.github/hooks` copy) are fixed by `agentry fix`; copilot-mcp-secret, copilot-untrusted-hooks, copilot-cannot-see and trail-old-index are advice only
agentry status                  # what loads in this folder, now including a Copilot block (skills, instructions, hooks, MCP, agents, trusted folder, includeCoAuthoredBy; secrets masked); `copilot` is null when `~/.copilot` is missing
agentry fix --dry-run           # preview the automatic fixes as diffs; --yes applies them with a backup, agentry fix --undo restores; agentry scan ~/ws --fix does it across repos
agentry tui                    # terminal UI (Ink); a bare `agentry` in a terminal opens it too
agentry ui                     # web UI on 127.0.0.1 (see agentry ui below)
```

`agentry --help` loads no UI code, so it works even before `npm install`. Run tests with `npm test`.

### agentry copilot

GitHub Copilot CLI loads its own folder, `~/.copilot` (or `$COPILOT_HOME`), and does not read `~/.claude`. `agentry copilot` shares Claude user items with it, by choice: a skill, agent, rule or MCP server you pick is written into `~/.copilot`, and Copilot then loads it for all projects. Nothing is shared or trusted automatically. Setup, `status` and `doctor` only report.

```bash
agentry copilot status                                   # signed in, this folder trusted, what is shared (--json)
agentry copilot share <name> [--kind skill|agent|rule|mcp]    # share with Copilot, for all projects
agentry copilot unshare <name> [--kind skill|agent|rule|mcp]  # stop sharing
agentry copilot trust [path]                             # trust a repo (default: its root) so Copilot runs its hooks and MCP servers
agentry copilot untrust [path]                           # take that trust back
```

Flags: `--dry-run` prints the preview and writes nothing; `--yes` applies without asking; `--json` prints the result as JSON (a write needs `--yes` or `--dry-run`); `--kind` picks the kind when a name is in more than one. `share` and `unshare` without `--kind` pick the one kind the action can change; if the name is still ambiguous they list the kinds and stop.

Exit codes: `0` done, previewed, declined or already so; `1` refused or failed (also "Copilot not found"); `2` usage (an ambiguous name, or a JSON write without `--yes` or `--dry-run`).

Every write goes through the fix path: a preview first, a backup, then a check. `agentry fix --undo` reverts the newest set. It targets the newest set even when that one is already undone, so to reach an older change pass its timestamp (`agentry fix --undo --list` shows them). Sharing applies to all projects. Trust is per repo and lets Copilot run that repo's hooks and MCP servers. A secret in an MCP server's env, headers or args is written as a `${...}` reference, never as a literal, so the variable must be set in Copilot's own environment. A server whose command or url holds a secret is refused.

`agentry status --json` adds `copilot.signedIn` (true when Copilot has a logged-in user) and `copilot.shared` (the names agentry shared, per kind).

The terminal UI and the web UI show the Copilot column and the trust switch only when Copilot is signed in (see the keys below).

### agentry ui

`agentry ui` serves a local web UI for the same things the terminal UI does: Skills, MCP, Hooks, Plugins, Rules, Agents, Catalog, Doctor and Backups, in a sidebar with the same three sections. Run it from the project folder:

```bash
agentry ui                       # picks a free port, prints a URL with a one-time token, opens your browser
agentry ui --no-open --port 4200 # print the URL only, on a port you choose
```

It is a local tool and stays one. The server listens on `127.0.0.1` only. The printed URL carries a random token that is swapped for an `HttpOnly`, `SameSite=Strict` cookie on the first visit (and removed from the address bar); every other request needs that cookie, a wrong `Host` is refused, and a write from another origin is refused. Stop it with Ctrl-C.

Every change goes through the same backup-first functions as the terminal UI. A change that has a preview shows it first and writes nothing until you press Apply (`y`; `n` cancels). Removals keep a copy that Backups can restore. Secrets in MCP servers and hook commands are masked before they reach the browser. The keys match the terminal UI: `↑ ↓` move, `space` loads or unloads the selected skill for this project, `g` for all projects, `m` move, `*` mark, `esc` clears the marks, `x` remove, `X` delete, `/` search, `?` help. When Copilot is signed in, a Copilot column with a checkbox on Skills, MCP, Agents and Rules shares or unshares that row for all projects (the same as `C` in the terminal UI), and a sidebar switch, "Copilot in this repo", turns trust on or off for this folder (the same as `T`).

### agentry tui

`agentry tui` is a keyboard-driven view of the project you run it in: what loads, what it costs, what is wrong.

Start it from the project folder with `agentry tui`, or type a bare `agentry` in a terminal. It needs a terminal: without one it prints a message and exits `2`. The `p` picker switches to another repo (current repo, recent repos, then repos under the scan roots).

- **Sidebar:** a left rail with three sections: Setup (Skills, MCP, Hooks, Plugins, Rules, Agents), Discover (Catalog) and Health (Doctor, Backups), each with its count. The rail also holds the project path, the skill-description tokens every session pays, and the problems found. It is 22 columns wide from 90 columns, 16 from 70, and below that a one-line section header replaces it. `tab` moves the keys between the rail and the list: on the rail, `↑`/`↓` pick a section and `enter` goes back to the list. A details pane beside the list shows the selected row; the footer lists only the keys that work on the selected row, then `tab sidebar` and `? help` on the right; every other key is in help.
- **Copying:** on any preview or result, `c` copies its text (refusals and errors included) to the system clipboard (`pbcopy`, `clip`, `wl-copy` or `xclip`; otherwise the terminal's OSC 52 escape).
- **Changes it can make** (all except loading and unloading a skill are previewed first and wait for `y`):
  - **Skills, loading:** each Skills row has two state columns, **This project** and **All projects**, each `● loaded`, `○ not loaded` or `◐ partial`. `space` loads or unloads the selected skill for this project, `g` for all projects. Same as `agentry shelf on|off [--global]`.
  - **Skills, moving:** `m` opens a short menu for the row: All projects (`~/.claude/skills`), This project only, or the Library. Moving into the Library asks for a bundle (`↑/↓` and `enter`, or `n` to type a new name); the skill then sits there, not loaded, until `space`. `y` runs the move; both refuse to overwrite and refuse a skill that is still linked. Same as `agentry shelf shelve|unshelve|promote|demote`. The retired `s`, `a`, `o` and `u` keys show a notice that names `m`.
  - **Plugins, add:** `a` on the Plugins tab asks for `name@marketplace` (the marketplace must already be added to claude), then a scope, and previews the `claude plugin install` command and the settings file it backs up; `x` previews `claude plugin uninstall` (a scope pick when it is installed at several). Same as `agentry plugin install|uninstall`. `fix --undo` restores the settings file only; the cache and `installed_plugins.json` stay as claude left them.
  - **Plugins:** `space` on a plugin row (Plugins tab) or a `plugin:*` row (Skills tab) previews the `enabledPlugins` edit as a diff; `y` writes it with a backup. Same as `agentry plugin enable|disable`, and `agentry fix --undo` restores it. It applies to new sessions only.
  - **Doctor:** `enter` previews a fix as a diff. `y` applies it through the same engine as the CLI, with a backup first. `u` previews undoing the last fix set, and `y` restores it.
  - **MCP:** `space` on a server for all projects previews turning it off (its config is saved, then `claude mcp remove --scope user` runs, with a backup of `~/.claude.json`); turned-off servers stay in the list as `○ off`, and `space` adds them back with `claude mcp add-json`. Same as `agentry mcp disable|enable <name>`, `agentry mcp list-parked`. The saved configs live in `~/.claude/agentry/parked-mcp.json` (mode 0600), with their secrets, exactly as exposed as `~/.claude.json`. Plugin, project `.mcp.json` and desktop servers say who manages them instead.
  - **MCP, add and edit:** `a` opens an add form (name, command or url, env or headers, all projects or this project) ending in a masked preview; `y` runs `claude mcp add-json` (all projects) or edits `.mcp.json` (this project). Typed env and header values show as `****`. `s` on a server for all projects edits its env (`KEY=VALUE` sets, `-KEY` removes) and args (replaces them), as a text edit of `~/.claude.json`. Same as `agentry mcp add|set`; the form splits on spaces, so arguments with spaces need the CLI.
  - **Hooks:** `space` on a hook from user, project or local settings previews turning it off: the entry moves out of the settings file into `~/.claude/agentry/parked-hooks.json` (mode 0600, raw command, so as sensitive as the settings file) and shows as `○ off`; `space` again puts it back in the same event and matcher group. `x` deletes it. Plugin hooks say the plugin manages them. Backed up, undo with `agentry fix --undo`; same as `agentry hook disable|enable|remove <id>` (ids come from `agentry hook list`: a hash of event, matcher and command).
  - **Skills, removing:** `x` on a library skill, an all-projects skill folder or a this-project-only skill folder (`agentry shelf remove <skill> --project` on the CLI) previews the delete, saying whether a copy is kept; `y` copies the folder to `~/.claude/backups/agentry/removed/<time>/` and removes it (same as `agentry shelf remove`). `X` does the same but keeps no copy (`--no-backup`). It refuses while the skill is linked into a project.
  - **Backups:** the tab lists the fix sets, removed-skill copies and updated copies with size and age. `u` previews moving a removed skill or an updated copy back (it never overwrites), `X` previews deleting the selected backup, `d` previews deleting every backup 30 or more days old; `y` applies, `c` copies the preview. Pressing `x` shows a notice to use `X`. Same as `agentry backups restore|delete|prune`. Deleting a fix set that is not undone yet ends `agentry fix --undo` for it, and the preview says so.
  - **Catalog:** `f` fetches the agentry-labs repo (a shallow git clone under `~/.claude/cache/agentry/catalog`; the only network use), then the tab lists its skills by bundle, then agents, rules, CLAUDE.md files and MCP servers, with where each is added. `a` previews and `y` adds the selected item: a skill into the Library under its bundle (not loaded; load it from the Skills tab), a rule into `~/.claude/rules`, a CLAUDE.md file as the project's `CLAUDE.md` (refused when it has one), or an agent or MCP server after a scope pick (all projects or this project); an MCP server goes through the MCP add path (masked preview, backup, undo). `outdated` marks an added skill, agent, rule or CLAUDE.md file whose files differ from the cached clone, and an MCP server whose catalog entry differs from yours; `u` previews each file it would overwrite or add (files only in your copy are kept) and `y` replaces them after saving the current copy under `~/.claude/backups/agentry/updated/`. Without a local edit you cannot tell an upstream change from your own edit, so the preview says every overwritten file loses local changes. `x` removes an added skill, agent or rule (a copy goes to the backups). `i` and `o` show a notice to use `a`. Same as `agentry catalog`.
  - **Agents:** the subagents Claude Code can start, from `~/.claude/agents` and the project's `.claude/agents`, with model, tools and the cost of their name and description. Read-only: `e` opens the file; add or remove agents from the Catalog tab. Agents that plugins ship are not listed yet.
  - **Rules:** the CLAUDE.md and rule files Claude Code loads every session: `~/.claude/CLAUDE.md`, `~/.claude/rules/**/*.md`, the project's `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` and `.claude/rules/**/*.md`, with the token cost of the whole file. `e` opens one; `x` previews removing it (a copy goes to the backups, so the Backups tab restores it) and `y` confirms; `X` keeps no copy. Same as `agentry rules`.
- **Rows that cannot be toggled** say why in the status line and the details: all-projects skills ("press m to move it"), project skills ("files live in the repo") and symlinked or broken skills.
- **Hooks** list what loads and its source file, with secrets masked. `e` opens a source file in `$EDITOR`.

State is one mark per row: `●` loaded or on (active green), `○` not loaded or off (disabled gray, the whole row dim), `◐` partial yellow. The word is in the details pane. Colour is off when `NO_COLOR` is set; then the mark stays, a `STATE` column adds the word, the active section keeps its `>` marker and Doctor reads `2 err`, so nothing depends on colour. Token cost is dim under 100, yellow under 500, red from 500; the active section is cyan and bold, and Doctor's count is red when it holds errors; kind glyphs (`✦ ⇄ ⚑ ⬡`, or Nerd Font ones with `AGENTRY_ICONS=nerd`) appear only on Doctor and Catalog rows, where kinds mix, never in the sidebar; scope tags `all projects` cyan, `this project` magenta, `plugin` blue, `library` yellow; Doctor `✖` error red, `▲` warning yellow, `ℹ` info blue; the selected row is inverse with a `>`.

Shared by every tab:

| Key | Action |
|---|---|
| tab | move focus between the sidebar and the list |
| ← / →, 1-9 | switch section (1-9 follow the sidebar order) |
| ↑ / ↓ | move between rows |
| / | search the rows (enter keeps it, esc clears it) |
| * | mark or unmark the row; the next key applies to all marked rows (one preview, one y) |
| esc | clear the search, or the marks |
| e | open the selected row's file in $EDITOR |
| y / n | apply or cancel a previewed change; c copies the preview |
| r | refresh |
| p | switch project |
| ? | this tab's keys, then the shared keys |
| q | quit |

Per tab (the footer shows the keys that apply to the selected row):

| Tab | Keys |
|---|---|
| Skills | `space` load or unload here · `g` load or unload for all projects · `m` move (all projects, this project only, or the Library) · `x` remove (copy kept) · `X` delete (no copy) · `enter` expand a bundle, show details · `C` share with Copilot or unshare (Copilot signed in) · `T` Copilot in this repo on or off |
| MCP | `a` add a server (all projects or this project) · `space` turn off (saved) or add back · `s` edit env and args of a server for all projects · `x` remove (undo: `agentry fix --undo`) · `C` share with Copilot or unshare · `T` Copilot in this repo on or off |
| Hooks | `space` turn off (saved) or on again · `x` remove (undo: `agentry fix --undo`) |
| Plugins | `a` install · `space` on or off (new sessions) · `x` uninstall |
| Rules | `e` open · `x` remove the file (copy kept) · `X` delete (no copy) · `C` share with Copilot or unshare · `T` Copilot in this repo on or off |
| Agents | `e` open the file (read only) · `C` share with Copilot or unshare · `T` Copilot in this repo on or off |
| Catalog | `f` fetch the catalog · `a` add (agents and MCP servers ask all projects or this project) · `u` update an outdated item · `x` remove an added item (copy kept) · `X` delete (no copy) |
| Doctor | `enter` preview a fix · `u` undo the last fix set |
| Backups | `u` restore a removed skill or updated copy · `X` delete a backup (no copy kept) · `d` delete backups 30+ days old |

Retired keys (`s`, `a`, `o`, `u` on Skills; `i`, `o` on Catalog; `x` on Backups) show a one-line notice that names the new key.

`C` and `T` appear only when Copilot is signed in. The footer lists `C` only on a row agentry can share or unshare; on any other row `C` says why in the status line and writes nothing. `T` is always listed on those four tabs and in the sidebar.

Press `?` to see the current tab's keys, then the shared keys. The web UI uses the same letters on Skills (`space`, `g`, `m`, `*`, `esc`, `x`, `X`) and `u` on Doctor. Layout: from 110 columns of list (132 with the sidebar) the details sit in a box beside the list; below that they go under the list so the list keeps the whole width and its Project/Global badges are never cut (a long name is shortened with `…` in the middle instead). The path in the sidebar is cut in the middle to fit, a list taller than its box ends in `↓ N more`, and the footer is one line that drops `tab sidebar`, then trailing row keys, before it drops `? help`. `/` filters the rows of any tab; `*` marks rows (counted under the list) so one key (`space`, `g`, `x`, `X` or `u`) previews and applies to all of them at once. The last Skills row, Token total, breaks the description tokens down into all projects, this project and plugins. Sketch below shows the Skills section at about 122 columns, hand-updated to the current labels (not a capture), with two bundles marked (colours are lost in text; not an image), with the home folder shown as `~`:

```text
agentry              │ Library                                                     Skills      Cost   This project  All projects
~/ws/aryan…ntry-labs │*▸ audit                                                     7 skills   ~1078          ○             ○
~1k tokens           │>▸ design                                                    2 skills    ~296          ○             ○
                     │ ▸ dev-tools                                                 1 skills    ~103          ○             ○
SETUP                │ ▸ flutter-assets                                            4 skills    ~606          ○             ○
› Skills          24 │ ▸ general                                                   0 skills      ~0          ○             ○
  MCP              4 │ ▸ video                                                     28 skills  ~3001          ○             ○
  Hooks            0 │ ▸ web-audit                                                 1 skills    ~135          ○             ○
  Plugins          5 │
  Rules            6 │All projects skills
  Agents           2 │
                     │   humanize-and-unslop                                                    ~44                       ●
DISCOVER             │   run-fallow                                                            ~158                       ●
  Catalog         28 │  ↓ 17 more
                     │ 2 marked (space, g, x, X or u apply to all; esc clears)
HEALTH               │
  Doctor           0 │────────────────────────────────────────────────────────────────────────────────────────────────────
  Backups          0 │Details
                     │bundle: design (not loaded)
● no problems        │this project: ○ not loaded     all projects: ○ not loaded
? help  tab focus    │contains: 2 skills
                     │cost when loaded: ~296 tokens
                     │toggle: space = this project, g = all projects; enter expands
                     │space loaded/not loaded   g all projects   enter expand                    tab sidebar   ? help
```
