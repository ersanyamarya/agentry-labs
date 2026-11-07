# agentry

`agentry` shows and manages what a Claude Code session loads: skills, MCP servers, hooks, plugins, and CLAUDE.md and rule files. It keeps a skill shelf, backs up every file it changes, installs items from the agentry-labs catalog, and opens a terminal UI with `agentry ui`.

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
- `src/lib/`: the command modules (shelf, catalog, scan, fix and undo, doctor, status, MCP, hook and plugin toggles, rules, backups, tokens, paths)
- `src/lib/inventory/`: readers for skills, MCP servers, hooks and plugins
- `src/lib/types.ts`: shapes of the config files; `src/lib/version.ts` holds the package version
- `src/tui/`: the Ink terminal UI (TSX) behind `agentry ui`
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

### Skill shelf, backups, scan, catalog and rules

```bash
agentry shelf list                        # groups, the description tokens each costs when on, and where each is on
agentry shelf status [--json]             # what is on in this project and globally, plus broken links
agentry shelf on video audit/review       # several targets at once: a group, group/skill, or a skill name unique across groups
agentry shelf on video --global           # ~/.claude/skills, every project (default: this project's .claude)
agentry shelf off video                   # remove those links
agentry shelf off --all                   # remove every shelf link in this project (add --global for ~/.claude)
agentry shelf on audit --dry-run          # print the links and exclude lines it would change; write nothing
agentry shelf shelve pdf docs             # move ~/.claude/skills/pdf onto the shelf as group docs
agentry shelf unshelve pdf                # move it back to ~/.claude/skills
agentry shelf promote my-skill            # move this project's .claude/skills/my-skill to ~/.claude/skills (every project)
agentry shelf demote my-skill             # the reverse: ~/.claude/skills/my-skill into this project (add --dry-run to preview)
agentry shelf remove docs/pdf             # delete it; a copy is kept in ~/.claude/backups/agentry/removed/<time>/
agentry shelf remove docs/pdf --no-backup # delete it and keep no copy (add --dry-run to see which it would be)
agentry backups list [--json]             # fix backup sets, removed-skill and updated copies, with size and age
agentry backups restore <id> [--dry-run]  # move a removed skill or an updated copy back where it came from; never overwrites
agentry backups prune --older-than 30 --kind removed --dry-run   # or --all; --kind fix|removed|updated; previewed, then asked (--yes for scripts)
agentry backups delete <id>... [--yes]    # delete chosen backups; a fix set not yet undone can then not be undone
agentry scan ~/ws --find-skill pdf        # every repo/worktree with .claude/skills/pdf, git-tracked ones marked; --global adds ~/.claude/skills (--remove-skill keeps a copy unless --no-backup)
agentry scan ~/ws --remove-skill pdf --dry-run   # delete that folder from each (no copy; shelf links are skipped)
agentry catalog refresh                   # fetch the agentry-labs skill catalog (shallow git clone, cached)
agentry catalog list [--json]             # skills, agents, rules, CLAUDE.md files and MCP servers (kind/name), where each is installed, "outdated" when it differs
agentry catalog add run-fallow --group dev # a skill goes onto the shelf (off); never overwrites
agentry catalog add agent/super-planner [--project]   # agent -> ~/.claude/agents (or .claude/agents)
agentry catalog add rule/context7          # rule -> ~/.claude/rules
agentry catalog add claude-md/BASIC_CLAUDE # -> ./CLAUDE.md, refused when the project has one
agentry catalog add mcp/trail --project --dry-run   # through `mcp add`: masked preview, backup, undo (--yes to apply)
agentry catalog update --all --dry-run     # or <item>...; lists every file it overwrites, saves the old copy under backups/updated/, asks (--yes for scripts)
agentry catalog remove agent/super-planner [--project]   # delete an installed agent; a copy is kept under backups/removed/ (--no-backup, --dry-run, --yes)
agentry rules list [--json]                # CLAUDE.md and rule files loaded here, with tokens
agentry rules remove CLAUDE.md [--dry-run] [--no-backup]   # delete one; a copy is kept in the backups
```

`list` estimates each group's cost as the frontmatter `description` of its skills and agents, at about four characters
per token: what the group adds to every session once it is on. Project links are listed in `.git/info/exclude` (the
shared one in a worktree), so they never show as untracked. `shelve` refuses to overwrite a folder, and both `shelve`
and `unshelve` refuse while a link to the skill exists; run `off` first.

A group's agents sit in `~/.claude/skill-shelf/<group>/agents/*.md` (the `audit` group carries `slop-auditor-analyst`) and
are linked into `.claude/agents` with its skills. Claude Code watches skill folders, so a running session picks skills up;
start a new session if a linked agent doesn't show. To shelve another group, move its skill folders (and agents) into a new
`~/.claude/skill-shelf/<group>/`. Leave `~/.claude/skills/synced/` alone: claude.ai manages it.

### agentry CLI

```bash
agentry --help                 # commands and options
agentry shelf list             # shelf groups, their token cost and whether each is on
agentry shelf on video         # also: off <group>, off --all, shelve, unshelve; --global for ~/.claude, --dry-run to preview
agentry mcp disable context7   # park a user-scope MCP server (also: enable, list-parked; --dry-run, --yes); undo with agentry fix --undo
agentry mcp disable plugin:context-mode:context-mode   # plugin, project (.mcp.json) and local servers: off for this project only (disabledMcpServers)
agentry mcp add files --command npx --arg=-y --arg @scope/files --env FILES_TOKEN=abc   # add a server (--url U --header K:V for http; --scope user|project; --dry-run, --yes)
agentry mcp set files --env FILES_TOKEN=new   # change env/args of a user server (--unset-env K, --arg=A replaces args); backed up, undoable
agentry hook list              # every hook with an 8-hex id; then: hook disable|enable|remove <id> [--scope S] [--dry-run] [--yes]
agentry plugin install demo@market --scope project   # claude plugin install through the preview/backup path; also: uninstall demo
agentry plugin disable demo    # also: enable; --scope user|project|local, --dry-run, --yes; backed up, undo with agentry fix --undo; refuses a plugin set by macOS MDM (names the source)
agentry ui                     # terminal UI (Ink); a bare `agentry` in a terminal opens it too
```

`agentry --help` loads no UI code, so it works even before `npm install`. Run tests with `npm test`.

### agentry ui

`agentry ui` is a keyboard-driven view of the project you run it in: what loads, what it costs, what is wrong.

Start it from the project folder with `agentry ui`, or type a bare `agentry` in a terminal. It needs a terminal: without one it prints a message and exits `2`. The `p` picker switches to another repo (current repo, recent repos, then repos under the scan roots).

- **Tabs:** Skills, MCP, Hooks, Plugins, Doctor, Catalog, Backups, Rules, each with a count where the width allows (counts drop first on the lesser tabs, never the names). The top line holds the project path on the left and, on the right, the skill-description tokens every session pays and the problems found. A details pane beside the list shows the selected row; the footer lists only the keys that work on the selected row, then `1-8 tab` and `? help` on the right; every other key is in help.
- **Copying:** on any preview or result, `c` copies its text (refusals and errors included) to the system clipboard (`pbcopy`, `clip`, `wl-copy` or `xclip`; otherwise the terminal's OSC 52 escape).
- **Changes it can make** (all except the plain shelf toggle are previewed first and wait for `y`):
  - **Skills, shelf:** Each shelf row has two columns, **Project** (this project) and **Global**, each `● on`, `○ off` or `◐ partial`. `space` toggles the Project column of the selected row and `g` toggles the Global column; there is no mode to switch. Same as `agentry shelf on|off [--global]`.
  - **Skills, shelving:** `s` on a global skill (a real folder under `~/.claude/skills`) asks for a shelf group (`↑/↓` and `enter`, or `n` to type a new name), previews the move, and `y` runs `agentry shelf shelve`. Afterwards the skill sits under Shelf, off, and toggles with `space`. `u` on a shelved skill moves it back (`agentry shelf unshelve`). Both refuse to overwrite, and to move a skill that is still linked.
  - **Skills, scope moves:** `a` on a project-only skill (This project only) previews moving the folder to `~/.claude/skills` so every project loads it; `o` on a global skill folder previews moving it into this project only. `y` moves it (no copy kept); both refuse links and never overwrite. Same as `agentry shelf promote|demote <skill>`.
  - **Plugins, install:** `i` on the Plugins tab asks for `name@marketplace` (the marketplace must already be added to claude), then a scope, previews the `claude plugin install` command and the settings file it backs up; `x` previews `claude plugin uninstall` (a scope pick when it is installed at several). Same as `agentry plugin install|uninstall`. `fix --undo` restores the settings file only; the cache and `installed_plugins.json` stay as claude left them.
  - **Plugins:** `space` on a plugin row (Plugins tab) or a `plugin:*` row (Skills tab) previews the `enabledPlugins` edit as a diff; `y` writes it with a backup. Same as `agentry plugin enable|disable`, and `agentry fix --undo` restores it. It applies to new sessions only.
  - **Doctor:** `enter` previews a fix as a diff. `y` applies it through the same engine as the CLI, with a backup first. `u` previews undoing the last fix set, and `y` restores it.
  - **MCP:** `space` on a user-scope server previews turning it off (its config is saved, then `claude mcp remove --scope user` runs, with a backup of `~/.claude.json`); turned-off servers stay in the list as `○ off`, and `space` adds them back with `claude mcp add-json`. Same as `agentry mcp disable|enable <name>`, `agentry mcp list-parked`. The saved configs live in `~/.claude/agentry/parked-mcp.json` (mode 0600), with their secrets, exactly as exposed as `~/.claude.json`. Plugin, project `.mcp.json` and desktop servers say who manages them instead.
  - **MCP, add and edit:** `a` opens an add form (name, command or url, env or headers, user or project scope) ending in a masked preview; `y` runs `claude mcp add-json` (user) or edits `.mcp.json` (project). Typed env and header values show as `****`. `s` on a user server edits its env (`KEY=VALUE` sets, `-KEY` removes) and args (replaces them), as a text edit of `~/.claude.json`. Same as `agentry mcp add|set`; the form splits on spaces, so arguments with spaces need the CLI.
  - **Hooks:** `space` on a hook from user, project or local settings previews turning it off: the entry moves out of the settings file into `~/.claude/agentry/parked-hooks.json` (mode 0600, raw command, so as sensitive as the settings file) and shows as `○ off`; `space` again puts it back in the same event and matcher group. `x` deletes it. Plugin hooks say the plugin manages them. Backed up, undo with `agentry fix --undo`; same as `agentry hook disable|enable|remove <id>` (ids come from `agentry hook list`: a hash of event, matcher and command).
  - **Skills, removing:** `x` on a shelved skill, a global skill folder or a project-only skill folder (`agentry shelf remove <skill> --project` on the CLI) previews the delete, saying whether a copy is kept; `y` copies the folder to `~/.claude/backups/agentry/removed/<time>/` and removes it (same as `agentry shelf remove`). `X` does the same but keeps no copy (`--no-backup`). It refuses while the skill is linked into a project.
  - **Backups:** the tab lists the fix sets, removed-skill copies and updated copies with size and age. `u` previews moving a removed skill or an updated copy back (it never overwrites), `x` previews deleting the selected backup, `d` previews deleting every backup 30 or more days old; `y` applies, `c` copies the preview. Same as `agentry backups restore|delete|prune`. Deleting a fix set that is not undone yet ends `agentry fix --undo` for it, and the preview says so.
  - **Catalog:** `f` fetches the agentry-labs repo (a shallow git clone under `~/.claude/cache/agentry/catalog`; the only network use), then the tab lists its skills by bundle, then agents, rules, CLAUDE.md files and MCP servers, with where each is installed. `i` previews and `y` installs the selected item: a skill onto the shelf under its bundle name (off; turn it on from the Skills tab), an agent into `~/.claude/agents`, a rule into `~/.claude/rules`, a CLAUDE.md file as the project's `CLAUDE.md` (refused when it has one), an MCP server through the MCP add path (masked preview, backup, undo). `o` does the same for an agent or MCP server in this project only. `outdated` marks an installed skill, agent, rule or CLAUDE.md file whose files differ from the cached clone, and an MCP server whose catalog entry differs from yours; `u` previews each file it would overwrite or add (files only in your copy are kept) and `y` replaces them after saving the current copy under `~/.claude/backups/agentry/updated/`. Without a local edit you cannot tell an upstream change from your own edit, so the preview says every overwritten file loses local changes. `x` removes an installed skill, agent or rule (a copy goes to the backups). Same as `agentry catalog`.
  - **Rules:** the CLAUDE.md and rule files Claude Code loads every session: `~/.claude/CLAUDE.md`, `~/.claude/rules/**/*.md`, the project's `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` and `.claude/rules/**/*.md`, with the token cost of the whole file. `e` opens one; `x` previews removing it (a copy goes to the backups, so the Backups tab restores it) and `y` confirms; `X` keeps no copy. Same as `agentry rules`.
- **Rows that cannot be toggled** say why in the status line and the details: global skills ("press s to move it onto the shelf"), project skills ("files live in the repo") and symlinked or broken skills.
- **Hooks** list what loads and its source file, with secrets masked. `e` opens a source file in `$EDITOR`.

State is one mark per row: `●` on or active green, `○` off or disabled gray (the whole row dim), `◐` partial yellow. The word is in the details pane. Colour is off when `NO_COLOR` is set; then the mark stays, a `STATE` column adds the word, the active tab is in brackets (`[Plugins 6]`) and Doctor reads `2 err`, so nothing depends on colour. Token cost is dim under 100, yellow under 500, red from 500; the active tab is cyan and underlined, and Doctor's count is red when it holds errors; kind glyphs (`✦ ⇄ ⚑ ⬡`, or Nerd Font ones with `AGENTRY_ICONS=nerd`) appear only on Doctor and Catalog rows, where kinds mix, never on the tabs; scope tags `global` cyan, `project` magenta, `plugin` blue, `shelf` yellow; Doctor `✖` error red, `▲` warning yellow, `ℹ` info blue; the selected row is inverse with a `>`.

| Key | Action |
|---|---|
| ← / →, 1-8 | switch tab |
| ↑ / ↓ | move between rows |
| enter | details, expand a group, preview a fix |
| space | Skills: shelf row on/off for this project; plugin rows: on/off; MCP, Hooks: turn off (saved) / add back |
| a | MCP: add a server (user or project scope) |
| g | Skills: shelf row on/off globally |
| s | Skills: move a global or project-only skill onto the shelf (CLI: `shelf shelve <skill> <group> [--project]`); MCP: edit env/args of a user server |
| a | Skills: move a project-only skill to ~/.claude/skills (all projects) |
| o | Skills: move a global skill into this project only; Catalog: add an agent or MCP server to this project only |
| u | Skills: unshelve a skill; Doctor: undo the last fix set; Backups: restore a removed skill or updated copy; Catalog: update an outdated item (skill, agent, rule, CLAUDE.md, MCP server) |
| x | Skills: remove a skill, keeping a copy in the backups; Catalog: remove an installed skill, agent or rule (a copy is kept in the backups); Rules: remove a file; Backups: delete a backup; MCP, Hooks: remove; Plugins: uninstall |
| X | Skills, Catalog, Rules: remove and keep no copy |
| d | Backups: delete the backups 30+ days old |
| i | Catalog: add the selected skill (to the shelf, off), agent, rule, CLAUDE.md or MCP server; Plugins: install a plugin |
| f | Catalog: fetch or update the agentry-labs catalog |
| / | search the rows of the current tab: type, enter keeps it, esc clears it (q and tab keys are text while typing) |
| m / M | mark or unmark the selected row / clear marks; space, g, x, X, i, u then apply to all marked rows, one preview, one y |
| e | open the selected row's file in $EDITOR |
| y / n | confirm or cancel a previewed change; c copies the preview |
| r | refresh |
| p | switch project |
| ? | this help |
| q | quit |

Press `?` in the UI to see the same table. Layout: from 110 columns the details sit in a box beside the list; below that they go under the list so the list keeps the whole width and its Project/Global badges are never cut (a long name is shortened with `…` in the middle instead). The header path is cut in the middle to fit, a list taller than its box ends in `↓ N more`, and the footer is one line that drops `1-8 tab`, then trailing row keys, before it drops `? help`. `/` filters the rows of any tab; `m` marks rows (shown with `*`, counted under the list) so one space or `x` previews and applies to all of them at once. The last Skills row, Token total, breaks the description tokens down into global, this project and plugins. Screenshot below is a plain-text capture of the Skills tab at 100 columns, with two shelf groups marked (colours are lost in text; not an image), with the home folder shown as `~`:

```text
agentry  ~/ws/aryantriki/agentry-labs                                     ~1k tokens  ·  no problems
Skills 24   MCP 4   Hooks 0   Plugins 5   Doctor 0   Catalog 28   Backups 0   Rules 6
 Shelf                                                       Skills      Cost    Project     Global
*▸ audit                                                     7 skills   ~1078          ○          ○
>▸ design                                                    2 skills    ~296          ○          ○
 ▸ dev-tools                                                 1 skills    ~103          ○          ○
 ▸ flutter-assets                                            4 skills    ~606          ○          ○
 ▸ general                                                   0 skills      ~0          ○          ○
 ▸ video                                                     28 skills  ~3001          ○          ○
 ▸ web-audit                                                 1 skills    ~135          ○          ○

Global skills
   humanize-and-unslop                                                    ~44                     ●
   run-fallow                                                            ~158                     ●
  ↓ 17 more
 2 marked (space/x apply to all, M clears)

────────────────────────────────────────────────────────────────────────────────────────────────────
Details
shelf group: design (opt-in)
this project: ○ off     global: ○ off
contains: 2 skills
cost when on: ~296 tokens
toggle: space = this project, g = global; enter expands
space project   g global   enter expand                                             1-8 tab   ? help
```
