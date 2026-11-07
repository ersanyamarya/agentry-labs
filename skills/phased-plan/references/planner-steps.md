# Planner steps (for the Opus subagent)

You write one plan file from the brief you were given. You cannot ask the user questions; use the brief's answers and
note any gap in the Decisions log instead of guessing silently.

1. **Read the code the plan touches**, enough to name real files and functions in tasks.
   - If the repo is indexed by trail (a `graft/` or `.trail/` folder exists, or trail tools are listed), use it first.
     If its tools are deferred, load them in one call:
     `ToolSearch` with `select:mcp__trail__trail_find_code,mcp__trail__trail_find_all,mcp__trail__trail_trace_calls,mcp__trail__trail_file_api,mcp__trail__trail_repo_map`.
     Use `trail_repo_map` to orient, `trail_find_code` to locate, `trail_file_api` instead of reading whole files.
   - Otherwise use Read and grep.

2. **Design the phases**
   - Order phases so each ships something usable and testable alone: foundation first, UI and polish last.
   - Give each phase a `**Value:**` line (what becomes possible) and a `**Done when:**` line (checks a reviewer can run).
   - Write each task as one bounded change naming files, commands or behaviour. Split anything one pass cannot finish
     and review.
   - Add an "Out of scope" list of tempting extras nobody asked for.

3. **Assign models**
   - Read `model-choice.md` (same folder) and pick the cheapest tier that does each task well.
   - Every large-tier task gets a one-line reason in the plan; downgrade any whose only reason is size or importance.

4. **Write the plan**
   - Start from `../assets/plan.md.template`; keep its execution rules and fill the brackets (test command, branching
     answer, model names).
   - Keep the worktree line only if two or more tasks share no files and can run in parallel; otherwise delete it.
   - Fill "Ground rules" from facts you found, not assumptions.
   - Log the brief's answers in "Decisions log" with today's date.
   - Never put an unescaped `|` in a table cell, even in backticks; write `list`, `on` and `off` instead.

5. **Check**
   - Run `node <skill-dir>/scripts/check-plan.mjs <plan-file> --models "<small>,<mid>,<large>"` and fix every
     `errors` entry until `errorCount` is 0.
   - Return only the file path and one line per phase.
