# Logic Routing & MCP Matrix

Use this matrix when mapping a workflow to offload implementation work.

1. **Browser and UI Tasks (Playwright or Chrome MCP)**
   - **Triggers:** Scraping single-page applications, taking screenshots, testing UIs, or clicking buttons.
   - **Action:** Do not write custom scraping scripts. Instruct the generated `SKILL.md` to use a browser MCP.

2. **Enterprise App Integrations (Standard MCPs)**
   - **Triggers:** Modifying Jira tickets, querying Postgres, pushing to Slack, managing GitHub pull requests, or reading Notion pages.
   - **Action:** Assume the relevant MCP is installed. Instruct the generated skill to use its native MCP tools.

3. **Deterministic Logic (`.mjs` or Bash Scripts)**
   - **Triggers:** Manipulating local files, parsing with regular expressions, transforming JSON, formatting data, or polling unauthenticated endpoints with simple `fetch()` calls.
   - **Action:** Write standalone `.mjs` scripts in the generated skill's `scripts/` directory.

4. **LLM Reasoning (`SKILL.md`)**
   - **Triggers:** Qualitative grading, summarization, drafting emails, or contextual decision-making.
   - **Action:** Write explicit instructions in `SKILL.md` for processing condensed outputs from MCPs and scripts.
