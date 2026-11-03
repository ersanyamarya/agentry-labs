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
needed. `image-artifact-setup` (`design`) and `lighthouse-audit` (`web-audit`) are still in the `global` bundle, so
`install.sh --bundle global` copies them back into `~/.claude/skills`; move them to the shelf again afterwards:

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
```

`list` estimates each group's cost as the frontmatter `description` of its skills and agents, at about four characters
per token: what the group adds to every session once it is on. Project links are listed in `.git/info/exclude` (the
shared one in a worktree), so they never show as untracked. `shelve` refuses to overwrite a folder, and both `shelve`
and `unshelve` refuse while a link to the skill exists; run `off` first. `node scripts/shelf.mjs` still forwards to the same commands.

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
agentry shelf list             # same output as node scripts/shelf.mjs list
agentry shelf on video         # also: off <group>, off --all, shelve, unshelve; --global for ~/.claude, --dry-run to preview
agentry ui                     # terminal UI (Ink); a bare `agentry` in a terminal opens it too
```

`agentry --help` loads no UI code, so it works even before `npm install`. Run tests with `npm test`.

#### agentry ui

`agentry ui` is a keyboard-driven view of the project you run it in: what loads, what it costs, what is wrong.

Start it from the project folder with `agentry ui`, or type a bare `agentry` in a terminal. It needs a terminal: without one it prints a message and exits `2`. The `p` picker switches to another repo (current repo, recent repos, then repos under the scan roots).

- **Tabs:** Skills, MCP, Hooks, Plugins, Doctor, each with a count. A details pane beside the list shows the selected row.
- **Changes it can make:**
  - **Skills:** turn shelf groups and skills on or off for this project or globally (`g` switches the target). Same as `agentry shelf on|off`.
  - **Doctor:** `enter` previews a fix as a diff. `y` applies it through the same engine as the CLI, with a backup first. `u` previews undoing the last fix set, and `y` restores it.
- **Read-only:** MCP, Hooks and Plugins list what loads and its source file, with secrets masked. `e` opens the source file in `$EDITOR`; the UI itself writes nothing there.

Shelf toggles apply on `space`. Doctor fixes and undos are never written until you press `y` on the previewed diff.

| Key | Action |
|---|---|
| ← / →, 1-5 | switch tab |
| ↑ / ↓ | move between rows |
| enter | details, expand a group, preview a fix |
| space | Skills: toggle the group or skill on/off |
| g | Skills: switch the target between project and global |
| e | MCP, Hooks, Plugins, Doctor: open the source file in $EDITOR |
| y / n | Doctor: confirm or cancel a previewed fix or undo |
| u | Doctor: preview undoing the last fix set |
| r | refresh |
| p | project picker |
| ? | this help |
| q | quit |

Press `?` in the UI to see the same table. Screenshot below is a plain-text capture of the Skills tab at 100 columns (not an image), trimmed to fit, with the home folder shown as `~`:

```text
agentry  ~/ws/aryantriki/agentry-labs
 1 Skills (24)    2 MCP (4)    3 Hooks (29)    4 Plugins (5)    5 Doctor (18)
Toggle target: this project  (g to switch)  ~1210 tokens of skill descriptions load in every session
Shelf (agentry shelf list)                             ┌───────────────────────────────────────────┐
>▸ audit  7 skills, 1 agent  ~1078 tokens  off         │ Details                                   │
 ▸ design  2 skills  ~296 tokens  off                  │ shelf group: audit                        │
 ▸ dev-tools  1 skills  ~103 tokens  off               │ state: off                                │
 ▸ flutter-assets  4 skills  ~606 tokens  off          │ cost when on: ~1078 tokens                │
 ▸ video  28 skills  ~3001 tokens  off                 │ enter expands, space toggles the whole gr…│
 ▸ web-audit  1 skills  ~135 tokens  off               │                                           │
Personal skills                                        │                                           │
   humanize-and-unslop  ~44                            │                                           │
   run-fallow  ~158                                    │                                           │
   skill-architect  ~96                                │                                           │
   trail  ~19                                          │                                           │
Project skills                                         │                                           │
   script-writer  ~60                                  │                                           │
Plugin skills                                          │                                           │
   …                                                   │                                           │
space toggle on/off  g switch project/global  |  ←/→ tabs  ↑/↓ rows  r refresh  p project  ? help  …
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
- `scripts/`: installer, sync and shelf scripts (`shelf.mjs` forwards to `agentry shelf`)
- `bin/`: the `agentry` command entry and router
- `lib/`: the CLI modules (paths, shelf, tokens)
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
| `image-artifact-setup` | Set up a reproducible image generator in a project (Open Graph and social cards, link previews, project or product tiles, README banners, store screenshots) by rendering  |
| `lighthouse-audit` | Run Google Lighthouse against a URL (mobile and desktop), trace the performance, accessibility, SEO, and best-practices findings to the project's actual source, and write |
| `phased-plan` | Write a phased implementation plan where every phase delivers testable value and each task names the cheapest Claude model that does it, run as one sub-session per task |
| `run-fallow` | Run the `fallow` CLI on any JavaScript/TypeScript project to find dead code, unused dependencies, duplication, complexity hotspots, and security candidates, then report c |
| `skill-architect` | Create, improve, or review Claude Code skills so they are portable, token-efficient, and spec-compliant, with scripts doing the exact work and the model doing the judgmen |
| `sync-docs-from-diff` | Update repo documentation from a git diff. |
| `write-project-readme` | Draft or refresh a project README from Product.md, Brand.md, and the repository structure. |

**`flutter`** (Flutter and Dart projects):

| Skill | Description |
|-------|-------------|
| `acquire-codebase-knowledge` | Use this skill when the user explicitly asks to map, document, or onboard into an existing Flutter/Dart codebase. |
| `flutter-brand-icons` | Generate every app icon and native splash asset for a Flutter project from one single-color logo SVG, with colors taken from the project's brand doc, design doc, or Dart  |
| `flutter-bundle-google-fonts` | Replaces the google_fonts package in a Flutter project with fonts bundled in the app. |
| `flutter-device-scripts-setup` | Run the stack's scripts/flutter run-all and build-release: debug or release build installed on every connected Android phone, iPhone and this Mac. Wrapper only; the logic lives in the stack. |
| `flutter-lib-refactor` | Audit and refactor a Flutter project's lib/ folder into a feature-first layered architecture. |
| `flutter-logging-strategy` | Establish, audit, and enforce a consistent logging strategy in any Flutter/Dart project using package:logging — installs the dependency if missing, builds a named-logger  |
| `flutter-quality-gate` | Run the Flutter quality checks (format, analyze, test) for a Flutter app and fix common issues. |
| `flutter-store-assets` | Sets up and runs an image tool for a Flutter app that makes store screenshots (App Store iPhone and iPad, Mac App Store, Play phone and tablet), a Play feature graphic, s |
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