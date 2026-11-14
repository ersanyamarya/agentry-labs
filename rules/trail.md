# Use trail first to explore code

In any repo indexed by trail (a `.trail/` folder exists), find and understand code with the `trail` CLI before `grep`, `cat`, `find` or reading whole files:

- `trail ask "<question>"`: how does X work, where is Y (answers with code inlined at file:line)
- `trail grep <pattern>`: every occurrence, grouped by enclosing symbol
- `trail callers <symbol>`: before changing or renaming a symbol (`--direction out` for what it calls)
- `trail skeleton <file>`: a file's API instead of reading it
- `trail map`: orient in an unfamiliar repo
- Fall back to grep or Read only for exact text trail cannot answer, or for the file you are about to edit.
- A `[trail]` hint in the prompt context is a reminder to do this, not noise.
