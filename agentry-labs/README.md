# Agentry Labs

Reusable skills, workflows, and tooling for AI agents

## What is Agentry Labs?
A collection of framework-agnostic AI agent components — Claude Code skills, GitHub Copilot agents, Cursor rules, MCP configs, prompts, and workflows. Designed for reuse across projects.

## Installation

### One-line Installer
```bash
curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash
```

### Manual Copy
1. Clone this repo
2. Copy skills to your Claude Code directory:
   ```bash
   cp -r agentry-labs/skills/* ~/.claude/skills/
   ```

## Usage
1. Install skills/workflows
2. Invoke via Claude Code:
   ```bash
   claude -p "/skill list"
   claude -p "/skill improve-ux"
   ```

## Adding New Components
1. Fork this repo
2. Add your skill/workflow to the appropriate directory
3. Submit a PR

## License
MIT