# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agentry Labs** is a collection of reusable, framework-agnostic AI agent components — Claude Code skills and guidance files, GitHub Copilot agents, Cursor rules, and MCP configurations. Designed for reuse across projects. The repo installs selected components into the current project by default, with global installation available explicitly.

## Repository Structure

```
├── skills/              # Claude Code skills (self-contained, runnable via /skill <name>)
│   ├── image-artifact-setup/   # Scaffold OG/social card generator using Playwright
│   ├── lighthouse-audit/       # Run Lighthouse, diagnose against source, produce fix plan
│   ├── humanize-and-unslop/             # Edit/detect AI-slop patterns in writing
│   └── run-fallow/             # Run fallow CLI for dead code, dupes, complexity, security
├── agents/              # Custom agent definitions
│   └── super-planner.agent.md
├── claude-md-files/     # Reusable Claude Code project guidance
│   └── BASIC_CLAUDE.md
├── rules/               # Coding standards / Cursor rules
├── scripts/             # Installation and utility scripts
└── .mcp.json           # MCP server configurations (context7, fallow, shadcn, chrome-devtools)
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

# Run skills in Claude Code
claude -p "/skill list"
claude -p "/skill run-fallow"
claude -p "/skill lighthouse-audit"
claude -p "/skill image-artifact-setup"
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
| `lighthouse-audit` | Run Lighthouse (mobile+desktop), cross-reference findings with source, write fix plan | `SKILL.md`, `scripts/summarize_report.py` |
| `humanize-and-unslop` | Edit drafts to remove AI patterns while preserving voice, or detect without rewriting | `SKILL.md` |
| `run-fallow` | Run fallow CLI (dead code, duplication, complexity, security) on any JS/TS project, condense JSON output | `SKILL.md`, `scripts/preflight.mjs`, `scripts/summarize.mjs`, `references/` |

## Development Conventions

### Skill Development
- Each skill lives in `skills/<name>/` with a `SKILL.md` frontmatter + instructions
- Reference files go in `references/` or `assets/`
- Scripts go in `scripts/`
- Skills are self-contained — they should run via `/skill <name>` after installation

### MCP Configuration
The `.mcp.json` defines servers available in this repo:
- **context7** — Library documentation lookup (requires API key)
- **fallow** — TypeScript/JavaScript static analysis
- **shadcn** — shadcn/ui component registry access
- **chrome-devtools** — Browser automation/debugging

## Adding New Components

1. Fork the repo
2. Add skill to `skills/<name>/` with `SKILL.md`
3. Submit PR

## Testing Skills Locally

Before submitting a skill, test it by copying to `~/.claude/skills/` and invoking via Claude Code:

```bash
cp -r skills/my-new-skill ~/.claude/skills/
claude -p "/skill my-new-skill"
```

## License

MIT