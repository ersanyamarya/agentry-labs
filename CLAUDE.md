# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agentry Labs** is a collection of reusable, framework-agnostic AI agent components — Claude Code skills and guidance files, GitHub Copilot agents, Cursor rules, and MCP configurations. Designed for reuse across projects. The repo installs selected components into the current project by default, with global installation available explicitly.

## Repository Structure

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
├── rules/               # Coding standards / Cursor rules (none published yet)
├── scripts/             # install.sh, utils.sh, and image-gen-tools/ (README cover generator)
├── .github/             # CI (validates every skill) and assets/cover.jpg
└── .mcp.json            # Local MCP config, gitignored (holds an API key); not part of the repo
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

## Implementation principles

Remember, before writing any code:

1. Does this need to exist?   → no: skip it (YAGNI)
2. Already in this codebase?  → reuse it, don't rewrite
3. Standard library does it? → use it
4. Native platform feature?   → use it
5. Installed dependency?      → use it
6. One line?                  → one line
7. Only then: the minimum that works → If reusable, write it in a shared file/widget.


## Skills Quick Reference

| Skill | Purpose | Key Files |
|-------|---------|-----------|
| `image-artifact-setup` | Scaffold reproducible image generators (OG cards, social previews, thumbnails) via Playwright | `SKILL.md`, `references/`, `assets/card-renderer.ts` |
| `lighthouse-audit` | Run Lighthouse (mobile+desktop) on any web stack, trace findings to source, write fix plan | `SKILL.md`, `scripts/summarize-report.mjs`, `references/framework-hints.md`, `assets/fix-plan-template.md` |
| `humanize-and-unslop` | Edit drafts to remove AI patterns while preserving voice, or detect without rewriting | `SKILL.md`, `scripts/scan.mjs`, `references/patterns.json` |
| `run-fallow` | Run fallow CLI (dead code, duplication, complexity, security) on any JS/TS project, condense JSON output | `SKILL.md`, `scripts/preflight.mjs`, `scripts/summarize.mjs`, `references/` |
| `skill-architect` | Create, improve, or review skills; scaffold, validate against the spec, test on a sample | `SKILL.md`, `scripts/scaffold.mjs`, `scripts/validate.mjs`, `references/` |

## Development Conventions

### Skill Development
- Each skill lives in `skills/<name>/` with a `SKILL.md` frontmatter + instructions
- Reference files go in `references/` or `assets/`
- Scripts go in `scripts/` as Node `.mjs` files, invoked as `node ${CLAUDE_SKILL_DIR}/scripts/<file>.mjs` so they work from any install location
- Test prompts go in `evals/evals.json`
- Run `node skills/skill-architect/scripts/validate.mjs skills/*/` before committing; CI runs the same check
- Skills are self-contained — they should run via `/<skill-name>` after installation

### README cover
`.github/assets/cover.jpg` is generated from the repo: the README title and tagline, the skill names in `skills/*/SKILL.md`, and the counts of skills, agents, rules, and guidance files. Regenerate it in the same change whenever you add, remove, or rename anything in `skills/`, `agents/`, `rules/`, or `claude-md-files/`, or edit the README title or tagline:

```bash
cd scripts/image-gen-tools && bun install && bun run cover
node ../../skills/image-artifact-setup/scripts/verify-images.mjs ../../.github/assets --expect 1 --width 1280 --height 640
```

The `bun run cover` log prints the counts it used; check they match the change, then view the image before committing it.

### MCP Configuration
`.mcp.json` is local and gitignored because it holds an API key, so each contributor keeps their own. The maintainer's copy defines:
- **context7**: library documentation lookup (needs a Context7 API key)
- **chrome-devtools**: browser automation, debugging, and Lighthouse runs
- **graft**: prebuilt code graph for finding and tracing code
- **context-mode**: sandboxed execution and indexing for large outputs

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