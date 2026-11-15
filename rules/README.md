# Rules

User-level Claude Code rules. `scripts/setup.sh` installs every rule here (except this README) into `<config>/rules/`, so they apply in every project. With the `copilot` part, each rule is also written to `~/.copilot/instructions/<name>.instructions.md` (generated; edit the rule here).

| Rule | Purpose |
|---|---|
| `context7.md` | When and how to fetch current library docs with the Context7 MCP |
| `trail.md` | Use the trail CLI before grep or reading whole files in indexed repos |
