# Routing workflow steps

Map every step of the workflow to one owner. Code owns what it can do exactly; the model owns judgment.

1. **Browser and UI tasks (browser MCP)**
   - Triggers: scraping single-page apps, screenshots, UI testing, clicking through flows.
   - Action: use a browser MCP (Chrome DevTools, Playwright) instead of a custom scraper. Tell the skill to check the MCP's tools are available and to stop with a clear message when they are not.

2. **App integrations (existing MCPs)**
   - Triggers: Jira tickets, Postgres queries, Slack posts, GitHub pull requests, Notion pages.
   - Action: use the integration's MCP tools. Never assume the MCP is installed; name it, check for it, and give a CLI or manual fallback (for example `gh` for GitHub).

3. **Deterministic logic (`.mjs` scripts)**
   - Triggers: reading and transforming files or JSON, running a CLI and condensing its output, counting, exact-match checks, simple `fetch()` calls.
   - Action: write a standalone Node `.mjs` script in `scripts/`, using only the standard library (`node:fs`, `node:path`, `node:util` `parseArgs`). Use Bash only for a few chained commands.
   - Output: print only what the model needs, capped (top N items, truncated strings). Never print a raw tool payload.

4. **Model reasoning (`SKILL.md`)**
   - Triggers: judging quality, summarizing, rewriting, deciding between options, tracing a finding to its cause.
   - Action: write explicit instructions for acting on the condensed script or MCP output.

## When a script is worth it

- **Script it** when the check is precise: every hit is a real problem (a banned word, a missing file, a syntax error, a threshold).
- **Leave it to the model** when a pattern match would be noisy or incomplete: tone, structure, "does this fit the project", phrasing that varies. A regex that flags many false positives makes the model sort noise and costs more than it saves.
- **Use a script as the final check** even for judgment-heavy skills: the model does the work, the script confirms the mechanical rules pass.
- **Skip the script** for tiny inputs where one tool call costs more than reading.
