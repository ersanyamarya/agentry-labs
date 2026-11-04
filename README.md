# Agentry Labs

![Agentry Labs: reusable skills, rules, agents, and tooling for AI agents](.github/assets/cover.jpg)

Reusable skills, rules, agents, Claude guidance, and tooling for AI agents

## What is Agentry Labs?

A collection of framework-agnostic AI agent components — Claude Code skills and guidance files, GitHub Copilot agents, Cursor rules, and MCP configs. Designed for reuse across projects.

## Requirements

- Bash and Git. The installer clones this repo from GitHub unless `--source` points at a local checkout.
- Node.js for the `.mjs` scripts in `scripts/`.

## Getting started

### One-line Installer
```bash
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash
```

By default, the installer writes to `./.claude` in the current project. Pass
`--global` to write to `~/.claude` instead. The installer opens a chooser when
run in an interactive terminal; select a whole component type, an individual
component, or everything:

```bash
# See every available selector
./scripts/install.sh --list

# Install every skill and rule
./scripts/install.sh --type skills --type rules

# Install only one skill
./scripts/install.sh skills/run-fallow

# Install one skill globally
./scripts/install.sh --global skills/run-fallow

# Mix component types and individual components
./scripts/install.sh skills/run-fallow rules agents/super-planner.agent.md

# Install the basic Claude project guidance template
./scripts/install.sh claude-md-files/BASIC_CLAUDE.md

# Install everything into a custom agent directory
./scripts/install.sh --all --target "$HOME/.config/my-agent"

# Select components through the one-line installer
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash -s -- skills/run-fallow

# Install globally through the one-line installer
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash -s -- --global skills/run-fallow
```

Run `./scripts/install.sh --help` for all selectors, options, and examples.

### Manual Copy
1. Clone this repo
2. Copy skills to the current project's Claude Code directory:
   ```bash
   mkdir -p .claude/skills
   cp -r skills/* .claude/skills/
   ```

### Bundles and syncing

`bundles.tsv` tags each component `global`, `flutter`, `mongodb` or `web`. Install a bundle, or re-run the same command to sync it:

```bash
# Global bundle into ~/.claude (from a local checkout; omit --source to clone from GitHub)
./scripts/install.sh --source . --global --bundle global

# Flutter skills into the current project
./scripts/install.sh --source /path/to/agentry-labs --bundle flutter

# See what would change without writing
./scripts/install.sh --source . --bundle flutter --dry-run
```

Global settings, hooks and MCP servers live in `global/`. Preview the merge into `~/.claude`, then apply it:

```bash
node scripts/apply-global.mjs          # prints the plan
node scripts/apply-global.mjs --write  # applies it and saves backups
```

The context7 MCP entry reads `CONTEXT7_API_KEY` from your shell environment (export it from your shell profile; the desktop app does not read shell rc files). Compare skill copies across projects with `node scripts/skill-drift.mjs`.

### Skill shelf

Every installed skill puts its name and description in every session, and past the listing budget Claude Code drops
descriptions, so rarely used skills crowd out the useful ones. Rarely used groups live in `~/.claude/skill-shelf/<group>/`
instead (currently `video`, `audit`, `flutter-assets`, `design`, `web-audit`, `dev-tools`) and are symlinked in when
needed. The shelved skills (`image-artifact-setup`, `lighthouse-audit`, and four flutter-assets skills) are in no bundle, so
installs never copy them back. Turn them on with `agentry shelf on <group>`:

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
agentry shelf remove docs/pdf             # delete it for good; a copy is kept in ~/.claude/backups/agentry/removed/<time>/
agentry catalog refresh                   # fetch the agentry-labs skill catalog (shallow git clone, cached)
agentry catalog list                      # its skills by bundle, and where each is installed
agentry catalog add run-fallow --group dev # copy a catalog skill onto the shelf (off); never overwrites
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

`agentry` runs from any folder. It needs Node.js 22 or newer. Install the checkout's dependencies once (Ink and React for `agentry ui`), then link it:

```bash
cd /path/to/agentry-labs
npm install                    # once: Ink and React for `agentry ui`
npm link                       # puts `agentry` on your PATH (or: npm install -g /path/to/agentry-labs)

agentry --help                 # commands and options
agentry shelf list             # shelf groups, their token cost and whether each is on
agentry shelf on video         # also: off <group>, off --all, shelve, unshelve; --global for ~/.claude, --dry-run to preview
agentry mcp disable context7   # park a user-scope MCP server (also: enable, list-parked; --dry-run, --yes); undo with agentry fix --undo
agentry mcp disable plugin:context-mode:context-mode   # plugin, project (.mcp.json) and local servers: off for this project only (disabledMcpServers)
agentry plugin disable demo    # also: enable; --scope user|project|local, --dry-run, --yes; backed up, undo with agentry fix --undo
agentry ui                     # terminal UI (Ink); a bare `agentry` in a terminal opens it too
```

`agentry --help` loads no UI code, so it works even before `npm install`. Run tests with `npm test`.

#### agentry ui

`agentry ui` is a keyboard-driven view of the project you run it in: what loads, what it costs, what is wrong.

Start it from the project folder with `agentry ui`, or type a bare `agentry` in a terminal. It needs a terminal: without one it prints a message and exits `2`. The `p` picker switches to another repo (current repo, recent repos, then repos under the scan roots).

- **Tabs:** Skills, MCP, Hooks, Plugins, Doctor, Catalog, each with a count. A summary line under them shows the skill-description tokens every session pays and the problems found. A details pane beside the list shows the selected row; the footer lists only the keys that work on the current tab.
- **Copying:** on any preview or result, `c` copies its text (refusals and errors included) to the system clipboard (`pbcopy`, `clip`, `wl-copy` or `xclip`; otherwise the terminal's OSC 52 escape).
- **Changes it can make** (all except the plain shelf toggle are previewed first and wait for `y`):
  - **Skills, shelf:** Each shelf row has two columns, **Project** (this project) and **Global**, each `● on`, `○ off` or `◐ partial`. `space` toggles the Project column of the selected row and `g` toggles the Global column; there is no mode to switch. Same as `agentry shelf on|off [--global]`.
  - **Skills, shelving:** `s` on a global skill (a real folder under `~/.claude/skills`) asks for a shelf group (`↑/↓` and `enter`, or `n` to type a new name), previews the move, and `y` runs `agentry shelf shelve`. Afterwards the skill sits under Shelf, off, and toggles with `space`. `u` on a shelved skill moves it back (`agentry shelf unshelve`). Both refuse to overwrite, and to move a skill that is still linked.
  - **Plugins:** `space` on a plugin row (Plugins tab) or a `plugin:*` row (Skills tab) previews the `enabledPlugins` edit as a diff; `y` writes it with a backup. Same as `agentry plugin enable|disable`, and `agentry fix --undo` restores it. It applies to new sessions only.
  - **Doctor:** `enter` previews a fix as a diff. `y` applies it through the same engine as the CLI, with a backup first. `u` previews undoing the last fix set, and `y` restores it.
  - **MCP:** `space` on a user-scope server previews turning it off (its config is saved, then `claude mcp remove --scope user` runs, with a backup of `~/.claude.json`); turned-off servers stay in the list as `○ off`, and `space` adds them back with `claude mcp add-json`. Same as `agentry mcp disable|enable <name>`, `agentry mcp list-parked`. The saved configs live in `~/.claude/agentry/parked-mcp.json` (mode 0600), with their secrets, exactly as exposed as `~/.claude.json`. Plugin, project `.mcp.json` and desktop servers say who manages them instead.
  - **Skills, removing:** `x` on a shelved skill, a global skill folder or a project-only skill folder (`agentry shelf remove <skill> --project` on the CLI) previews the delete; `y` copies the folder to `~/.claude/backups/agentry/removed/<time>/` and removes it (same as `agentry shelf remove`). Move the copy back to restore. It refuses while the skill is linked into a project.
  - **Catalog:** `f` fetches the agentry-labs repo (a shallow git clone under `~/.claude/cache/agentry/catalog`; the only network use), then the tab lists its skills by bundle with where each is installed. `i` previews and `y` copies a skill onto the shelf under its bundle name, off; turn it on from the Skills tab. `x` removes an installed one. Same as `agentry catalog`.
- **Rows that cannot be toggled** say why in the status line and the details: global skills ("press s to move it onto the shelf"), project skills ("files live in the repo") and symlinked or broken skills.
- **Read-only:** Hooks list what loads and its source file, with secrets masked. `e` opens a source file in `$EDITOR`.

Colour (off when `NO_COLOR` is set; every badge has a symbol and a word, so nothing depends on it): `● on` / `● active` green, `○ off` / `○ disabled` gray, `◐ partial` yellow; token cost dim under 100, yellow under 500, red from 500 (legend line on the Skills tab); scope tags `global` cyan, `project` magenta, `plugin` blue, `shelf` yellow; Doctor `✖` error red, `▲` warning yellow, `ℹ` info blue; the selected row is inverse with a `>`.

| Key | Action |
|---|---|
| ← / →, 1-6 | switch tab |
| ↑ / ↓ | move between rows |
| enter | details, expand a group, preview a fix |
| space | Skills: shelf row on/off for this project; plugin rows: on/off; MCP: turn off (saved) / add back a user server |
| g | Skills: shelf row on/off globally |
| s | Skills: move a global skill onto the shelf |
| u | Skills: unshelve a skill; Doctor: undo the last fix set |
| x | Skills, Catalog: remove a skill (previewed; a copy is kept in the backups) |
| i | Catalog: add the selected skill to the shelf, off |
| f | Catalog: fetch or update the agentry-labs catalog |
| e | open the selected row's file in $EDITOR |
| y / n | confirm or cancel a previewed fix, undo, shelve or plugin change |
| r | refresh |
| p | switch project |
| ? | this help |
| q | quit |

Press `?` in the UI to see the same table. Layout: from 110 columns the details sit in a box beside the list; below that they go under the list so the list keeps the whole width and its Project/Global badges are never cut (a long name is shortened with `…` in the middle instead). The summary line shortens to fit, and the footer lists only the keys that work on the selected row, in one line. Screenshot below is a plain-text capture of the Skills tab at 100 columns (colours are lost in text; not an image), with the home folder shown as `~`:

```text
agentry  ~/ws/aryantriki/agentry-labs
 1 Skills (38)    2 MCP (4)    3 Hooks (29)    4 Plugins (5)    5 Doctor (18)
~2801 skill-description tokens  ·  plugins 2 ● active 3 ○ disabled  ·  0 errors, 18 warnings
● on ○ off ◐ partial  cost: ~<100 ~100-499 ~500+
 Shelf                                                   Skills      Cost  Project      Global
>▸ audit                                                 7 skills   ~1078  ● on         ● on
 ▸ design                                                2 skills    ~296  ○ off        ○ off
 ▸ dev-tools                                             1 skills    ~103  ○ off        ○ off
 ▸ flutter-assets                                        4 skills    ~606  ○ off        ○ off
 ▸ video                                                 28 skills  ~3001  ○ off        ○ off
 ▸ web-audit                                             1 skills    ~135  ○ off        ○ off

Global skills ──────────────────────────
   humanize-and-unslop                                                ~44               ● active
   run-fallow                                                        ~158               ● active
   skill-architect                                                    ~96               ● active
   trail                                                              ~19               ● active

This project only ──────────────────────
   script-writer                                                      ~60  ● active
  2/23

────────────────────────────────────────────────────────────────────────────────────────────────────
Details
shelf group: audit (opt-in)
this project: ● on
global: ● on
contains: 7 skills, 1 agent
cost when on: ~1078 tokens
toggle: space = this project, g = global; enter expands
space project  g global  enter expand  │ ←→ tabs  ? help  q quit
```

## Commands
1. Install skills
2. Invoke a skill by name in Claude Code, interactively or with `-p`. Skills also trigger on their own when a request matches their description.
   ```bash
   claude -p "/run-fallow"
   claude -p "/humanize-and-unslop README.md --detect"
   ```

## Project layout

- `skills/`: Claude Code skills, one folder each
- `agents/`: agent definitions
- `rules/`: commit-attribution and context7 rules
- `claude-md-files/`: reusable CLAUDE.md templates
- `global/`: settings fragment and MCP config merged by `scripts/apply-global.mjs`
- `scripts/`: installer, global-settings merge, skill drift check and the README cover generator
- `bin/`: the `agentry` command entry and router
- `lib/`: the CLI modules (paths, shelf, catalog, status, doctor, scan, fix, tokens, inventory)
- `tui/`: the Ink terminal UI behind `agentry ui`
- `docs/`: design plans, such as `docs/shelf-cli-plan.md`
- `test/`: tests for the CLI (`npm test`)
- `bundles.tsv`: the bundle each component belongs to

## Available Components

### Skills (`.claude/skills/`)

**`global`** (any project; install once into `~/.claude`):

| Skill | Description |
|-------|-------------|
| `agentry` | Answer "what loads here", slow-session and duplicate MCP or skill questions from `agentry status`, `doctor` and `scan --json`; fixes go through `agentry fix`. |
| `generate-commit-message` | Write a Conventional Commit message in this repo's style (type(scope): Capitalized summary) from staged or unstaged changes. |
| `humanize-and-unslop` | Edit drafts into plain, specific, human-sounding writing by removing AI tells (banned vocabulary, em dashes, curly quotes, puffery, chatbot phrases, formulaic structures) |
| `phased-plan` | Write a phased implementation plan where every phase delivers testable value and each task names the cheapest Claude model that does it, run as one sub-session per task |
| `run-fallow` | Run the `fallow` CLI on any JavaScript/TypeScript project to find dead code, unused dependencies, duplication, complexity hotspots, and security candidates, then report c |
| `skill-architect` | Create, improve, or review Claude Code skills so they are portable, token-efficient, and spec-compliant, with scripts doing the exact work and the model doing the judgmen |
| `sync-docs-from-diff` | Update repo documentation from a git diff. |
| `write-project-readme` | Draft or refresh a project README from Product.md, Brand.md, and the repository structure. |

**`flutter`** (Flutter and Dart projects):

| Skill | Description |
|-------|-------------|
| `acquire-codebase-knowledge` | Use this skill when the user explicitly asks to map, document, or onboard into an existing Flutter/Dart codebase. |
| `flutter-lib-refactor` | Audit and refactor a Flutter project's lib/ folder into a feature-first layered architecture. |
| `flutter-logging-strategy` | Establish, audit, and enforce a consistent logging strategy in any Flutter/Dart project using package:logging — installs the dependency if missing, builds a named-logger  |
| `flutter-quality-gate` | Run the Flutter quality checks (format, analyze, test) for a Flutter app and fix common issues. |
| `theme-hardcoding-audit` | Audit the app for hardcoded theme values, local styling drift, and visual inconsistencies. |

**`mongodb`** (MongoDB / Mongoose projects):

| Skill | Description |
|-------|-------------|
| `mongodb-data-modeling` | Design new MongoDB/Mongoose schemas or audit existing ones against document-modeling best practices — embedding vs. referencing, unbounded arrays, compound index field or |
| `mongoose-schema-docs` | Generate documentation and an entity-relationship diagram from a codebase's Mongoose schemas. |

**`web`** (web UI projects):

| Skill | Description |
|-------|-------------|
| `shadcn` | Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI, including chat interfaces. |

Shelved skills (`image-artifact-setup`, `lighthouse-audit`, `flutter-brand-icons`, `flutter-bundle-google-fonts`, `flutter-device-scripts-setup`, `flutter-store-assets`) are in no bundle; they live on the shelf (`agentry shelf on <group>`, see [Skill shelf](#skill-shelf)).

Skills tied to gentlemans-stack layers, generators and libs (Nx workspace and package linking, `api-endpoints`, `service-handler-tests`, `domain-repository-tests` and similar) live in that repo's `.claude/skills` and reach projects through its sync, not from here.

### Agents (`.claude/agents/`)
| Agent | Description |
|-------|-------------|
| `super-planner` | Investigate a task and produce a verified, execution-ready plan without making changes |

### Rules (`.claude/rules/`)
| Rule | Description |
|------|-------------|
| `commit-attribution` | No AI attribution lines in commits or pull requests |
| `context7` | When and how to fetch current library docs with the Context7 MCP |

### Claude MD files (`.claude/claude-md-files/`)
| File | Description |
|------|-------------|
| `BASIC_CLAUDE.md` | Starting template for concise project-specific Claude Code guidance |

## Adding New Components
1. Fork this repo
2. Add your component to the appropriate directory
3. Submit a PR

## License
MIT