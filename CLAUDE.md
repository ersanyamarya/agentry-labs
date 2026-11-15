# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agentry Labs** is a collection of reusable, framework-agnostic AI agent components — Claude Code skills and guidance files, GitHub Copilot agents, Cursor rules, and MCP configurations. Designed for reuse across projects. The repo installs selected components into the current project by default, with global installation available explicitly.

## Implementation principles

Remember, before writing any code:

1. Does this need to exist?   → no: skip it (YAGNI)
2. Already in this codebase?  → reuse it, don't rewrite
3. Standard library does it? → use it
4. Native platform feature?   → use it
5. Installed dependency?      → use it
6. One line?                  → one line
7. Only then: the minimum that works → If reusable, write it in a shared file/widget.


## Architecture

```
├── skills/              # Claude Code skills (self-contained, invoked as /<skill-name>)
│   ├── agentry/                # Answer setup questions from agentry status/doctor/scan JSON
│   ├── humanize-and-unslop/    # Edit/detect AI-slop patterns in writing (scan.mjs + judgment)
│   ├── image-artifact-setup/   # Scaffold OG/social card generators using Playwright (web bundle; also used by the README cover)
│   ├── lighthouse-audit/       # Run Lighthouse, diagnose against source, write fix plan
│   ├── phased-plan/            # Write a short phased plan with a model per task (Opus plans, one file)
│   ├── run-fallow/             # Run fallow CLI for dead code, dupes, complexity, security
│   └── skill-architect/        # Create, improve, review, and validate skills
├── claude-md-files/     # Reusable Claude Code project guidance
│   └── BASIC_CLAUDE.md
├── rules/               # context7, trail (setup installs each as a user-level rule, and mirrors it to ~/.copilot/instructions)
├── global/              # settings.fragment.json (env, hooks, status line, attribution), mcp.json and helpers/, applied by the `config` part of setup.sh through scripts/apply-global.mjs (trail and context-mode wire themselves); global/copilot/ holds the Copilot settings fragment, MCP entry and trail hook for the `copilot` part
├── bundles.tsv          # tags each component with one of five topic bundles: general, web, flutter, flutter-assets, mongodb
├── scripts/             # setup.sh, setup-manifest.mjs, check-bundles.mjs, utils.sh, apply-global.mjs, skill-drift.mjs, test/, image-gen-tools/ (README cover generator)
├── cli/                 # agentry CLI and Ink terminal UI, in TypeScript (src/bin; npm workspaces packages/core, packages/tui and packages/web; design docs in cli/docs). See cli/README.md and cli/CLAUDE.md
└── .github/             # CI (validates every skill) and assets/cover.jpg
```

## Common Commands

```bash
# Install agentry, trail, context-mode and the user-level config on a machine
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh | bash
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh | bash -s -- install --all --yes

# Check or remove it
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh | bash -s -- status
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh | bash -s -- uninstall --all --yes

# Wire GitHub Copilot (~/.copilot) too, optionally trusting a repo folder so its hooks run
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh | bash -s -- install --only copilot --trust "$HOME/ws/my-repo"

# Script tests (run the bash test under /bin/bash too: macOS has bash 3.2)
node scripts/check-bundles.mjs && node --test scripts/test/
bash scripts/test/setup.test.sh
sh scripts/test/trail-autobuild.test.sh

# Manual local install
mkdir -p .claude/skills
cp -r skills/* .claude/skills/

# Regenerate the README cover (.github/assets/cover.jpg) after adding components
cd scripts/image-gen-tools && bun install && bun run cover

# CLI: install dependencies, run tests, link `agentry` onto PATH
cd cli && npm install && npm test
cd cli && npm run build && npm link

# Library and setup checks (any folder once linked)
agentry shelf list
agentry plugin disable <name> --dry-run
agentry status --json
agentry doctor --json

# Run skills in Claude Code (/<skill-name>, interactively or with -p)
claude -p "/run-fallow"
claude -p "/lighthouse-audit https://example.com"
claude -p "/image-artifact-setup"
```

## Skills Quick Reference

| Skill | Bundle |
|-------|--------|
| `acquire-codebase-knowledge` | flutter |
| `agentry` | general |
| `flutter-brand-icons` | flutter-assets |
| `flutter-bundle-google-fonts` | flutter-assets |
| `flutter-device-scripts-setup` | flutter-assets |
| `flutter-lib-refactor` | flutter |
| `flutter-logging-strategy` | flutter |
| `flutter-quality-gate` | flutter |
| `flutter-store-assets` | flutter-assets |
| `generate-commit-message` | general |
| `humanize-and-unslop` | general |
| `image-artifact-setup` | web |
| `lighthouse-audit` | web |
| `mongodb-data-modeling` | mongodb |
| `mongoose-schema-docs` | mongodb |
| `phased-plan` | general |
| `run-fallow` | web |
| `shadcn` | web |
| `skill-architect` | general |
| `sync-docs-from-diff` | general |
| `theme-hardcoding-audit` | flutter |
| `write-linkedin-post` | general |
| `write-project-readme` | general |

Each skill's bundle is set in `bundles.tsv`; the README lists them all. Every bundle is a library bundle in `~/.claude/skill-shelf/<bundle>/`, linked in with `agentry shelf on <bundle> [--global]`.

## Conventions

### Skill Development
- Each skill lives in `skills/<name>/` with a `SKILL.md` frontmatter + instructions
- Reference files go in `references/` or `assets/`
- Scripts go in `scripts/` as Node `.mjs` files, invoked as `node ${CLAUDE_SKILL_DIR}/scripts/<file>.mjs` so they work from any install location
- Test prompts go in `evals/evals.json`
- Run `node skills/skill-architect/scripts/validate.mjs skills/*/` before committing; CI runs the same check
- Skills are self-contained — they should run via `/<skill-name>` after installation


### Bundles
Skills that assume gentlemans-stack layers or generators belong in that repo, not here. Every new skill, rule, agent or claude-md file gets exactly one line in `bundles.tsv` with one of the five topics (`general`, `web`, `flutter`, `flutter-assets`, `mongodb`). `node scripts/check-bundles.mjs` checks it, and CI runs it. A bundle is a topic, never a scope.

### README cover
`.github/assets/cover.jpg` is generated from the repo: the README title and tagline, the skill names in `skills/*/SKILL.md`, and the counts of skills, agents, rules, and guidance files. Regenerate it in the same change whenever you add, remove, or rename anything in `skills/`, `agents/`, `rules/`, or `claude-md-files/`, or edit the README title or tagline:

```bash
cd scripts/image-gen-tools && bun install && bun run cover
node ../../skills/image-artifact-setup/scripts/verify-images.mjs ../../.github/assets --expect 1 --width 1280 --height 640
```

`bun run cover` also runs `sync-logo.mjs`, which copies the master `.github/assets/logo.svg` into the web package (the cover inlines the logo). Edit the logo only in the master file.

The `bun run cover` log prints the counts it used; check they match the change, then view the image before committing it.

### MCP Configuration
This repo has no project MCP servers (`.mcp.json` stays gitignored for local experiments). It relies on the global ones:
- **context7**: library documentation lookup (`CONTEXT7_API_KEY` exported from your shell profile, since GUI-launched Claude does not read shell rc files)
- **trail**: code graph (its SessionStart autobuild hook also runs in Copilot, installed to `~/.copilot/hooks` by the `copilot` part); `trail init` writes its own hooks and skill into ~/.claude, and agents call the `trail` CLI (`ask`, `grep`, `skeleton`, `callers`, `map`). The fragment only sets `TRAIL_INVOKED_AS=trail`
- **context-mode**: installed from npm (`context-mode setup`), which registers it as a Claude Code plugin; sandboxed execution and indexing of large outputs

`global/mcp.json` holds only these always-useful servers. Repo-specific ones (fallow, shadcn, chrome-devtools) go in that
repo's tracked `.mcp.json`, started with `npx -y <pkg>@latest` so they work without a local install and secrets come from
`${VAR}` expansion or the server's own `.env`.

## Keeping the docs current

| File | Update it when… |
| --- | --- |
| `CLAUDE.md` (this file) | A layer, convention or the skill list changes |
| `README.md` | The installer, bundles or the component list changes; the one-liner and examples change with the commands or parts of `scripts/setup.sh` |
| `global/` | The settings fragment or helpers change what the `config` or `copilot` part installs (update the README and this file) |
| `cli/README.md`, `cli/CLAUDE.md` | The `agentry` commands, flags, env vars, layout, build or test steps change |
| `bundles.tsv` | A skill, rule or agent is added, removed or moved to another bundle |

## Adding New Components

1. Fork the repo
2. Add skill to `skills/<name>/` with `SKILL.md`
3. Regenerate the README cover (see "README cover" above)
4. Submit PR

## Testing Skills Locally

Before submitting a skill, test it by copying it to `~/.claude/skills/` and invoking it via Claude Code:

```bash
cp -r skills/my-new-skill ~/.claude/skills/
claude -p "/my-new-skill"
```

## License

MIT