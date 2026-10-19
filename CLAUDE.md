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
│   ├── humanize-and-unslop/    # Edit/detect AI-slop patterns in writing (scan.mjs + judgment)
│   ├── image-artifact-setup/   # Scaffold OG/social card generators using Playwright
│   ├── lighthouse-audit/       # Run Lighthouse, diagnose against source, write fix plan
│   ├── run-fallow/             # Run fallow CLI for dead code, dupes, complexity, security
│   └── skill-architect/        # Create, improve, review, and validate skills
├── agents/              # Custom agent definitions
│   └── super-planner.agent.md
├── claude-md-files/     # Reusable Claude Code project guidance
│   └── BASIC_CLAUDE.md
├── rules/               # commit-attribution, context7
├── global/              # settings.fragment.json + mcp.json, merged by scripts/apply-global.mjs
├── bundles.tsv          # tags each component `global`, `flutter`, `mongodb` or `web`; used by install.sh --bundle
├── scripts/             # install.sh, utils.sh, apply-global.mjs, skill-drift.mjs, shelf.mjs (skill groups on/off), image-gen-tools/ (README cover generator)
└── .github/             # CI (validates every skill) and assets/cover.jpg
```

## Common Commands

```bash
# Install components into the current project's .claude directory
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash

# Install components globally
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash -s -- --global

# Manual local install
mkdir -p .claude/skills
cp -r skills/* .claude/skills/

# Regenerate the README cover (.github/assets/cover.jpg) after adding components
cd scripts/image-gen-tools && bun install && bun run cover

# Run skills in Claude Code (/<skill-name>, interactively or with -p)
claude -p "/run-fallow"
claude -p "/lighthouse-audit https://example.com"
claude -p "/image-artifact-setup"
```

## Skills Quick Reference

| Skill | Bundle |
|-------|--------|
| `acquire-codebase-knowledge` | flutter |
| `flutter-brand-icons` | flutter |
| `flutter-bundle-google-fonts` | flutter |
| `flutter-device-scripts-setup` | flutter |
| `flutter-lib-refactor` | flutter |
| `flutter-logging-strategy` | flutter |
| `flutter-quality-gate` | flutter |
| `flutter-store-assets` | flutter |
| `generate-commit-message` | global |
| `humanize-and-unslop` | global |
| `image-artifact-setup` | global |
| `lighthouse-audit` | global |
| `mongodb-data-modeling` | mongodb |
| `mongoose-schema-docs` | mongodb |
| `run-fallow` | global |
| `shadcn` | web |
| `skill-architect` | global |
| `sync-docs-from-diff` | global |
| `theme-hardcoding-audit` | flutter |
| `write-project-readme` | global |

Each skill's bundle is set in `bundles.tsv`; the README lists them all.

## Conventions

### Skill Development
- Each skill lives in `skills/<name>/` with a `SKILL.md` frontmatter + instructions
- Reference files go in `references/` or `assets/`
- Scripts go in `scripts/` as Node `.mjs` files, invoked as `node ${CLAUDE_SKILL_DIR}/scripts/<file>.mjs` so they work from any install location
- Test prompts go in `evals/evals.json`
- Run `node skills/skill-architect/scripts/validate.mjs skills/*/` before committing; CI runs the same check
- Skills are self-contained — they should run via `/<skill-name>` after installation


### Bundles
Skills that assume gentlemans-stack layers or generators belong in that repo, not here. Every new skill, rule, or agent gets a line in `bundles.tsv` (`global`, `flutter`, `mongodb` or `web`). Check install changes with `./scripts/install.sh --source . --bundle <name> --dry-run`.

### README cover
`.github/assets/cover.jpg` is generated from the repo: the README title and tagline, the skill names in `skills/*/SKILL.md`, and the counts of skills, agents, rules, and guidance files. Regenerate it in the same change whenever you add, remove, or rename anything in `skills/`, `agents/`, `rules/`, or `claude-md-files/`, or edit the README title or tagline:

```bash
cd scripts/image-gen-tools && bun install && bun run cover
node ../../skills/image-artifact-setup/scripts/verify-images.mjs ../../.github/assets --expect 1 --width 1280 --height 640
```

The `bun run cover` log prints the counts it used; check they match the change, then view the image before committing it.

### MCP Configuration
This repo has no project MCP servers (`.mcp.json` stays gitignored for local experiments). It relies on the global ones:
- **context7**: library documentation lookup (`CONTEXT7_API_KEY` exported from `~/.zshenv`, since GUI-launched Claude never reads `~/.zshrc`)
- **graft**: prebuilt code graph for finding and tracing code
- **context-mode**: plugin for sandboxed execution and indexing of large outputs

`global/mcp.json` holds only these always-useful servers. Repo-specific ones (fallow, shadcn, chrome-devtools) go in that
repo's tracked `.mcp.json`, started with `npx -y <pkg>@latest` so they work without a local install and secrets come from
`${VAR}` expansion or the server's own `.env`.

## Keeping the docs current

| File | Update it when… |
| --- | --- |
| `CLAUDE.md` (this file) | A layer, convention or the skill list changes |
| `README.md` | The installer, bundles or the component list changes |
| `bundles.tsv` | A skill, rule or agent is added, removed or moved to another bundle |

## Adding New Components

1. Fork the repo
2. Add skill to `skills/<name>/` with `SKILL.md`
3. Regenerate the README cover (see "README cover" above)
4. Submit PR

## Testing Skills Locally

Before submitting a skill, test it by copying to `~/.claude/skills/` and invoking via Claude Code:

```bash
cp -r skills/my-new-skill ~/.claude/skills/
claude -p "/my-new-skill"
```

## License

MIT