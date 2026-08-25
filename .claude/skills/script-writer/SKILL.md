---
name: script-writer
description: "Generate a new shell script in .scripts/ following the repo's script conventions (help header, utils.sh sourcing, signal trap, argument parsing). Use when adding a new .scripts/*.sh script or asking how the existing scripts are structured."
user-invocable: true
---

# Write a Shell Script

## When to Use

- Adding a new script to [scripts/](../../../scripts/)
- Asking how the existing `scripts/*.sh` scripts are structured or why they look the way they do

## Procedure

> Before writing any code, apply the implementation checklist in [CLAUDE.md](../../../CLAUDE.md): YAGNI → reuse what exists → stdlib → native platform feature → installed dependency → one line → only then the minimum that works.

1. **Confirm scope with the user** if any of these are unclear:
   - What the script does and its one-line purpose
   - Its arguments/options (positional args, flags) and their defaults
   - The kebab-case filename, e.g. `do-the-thing.sh`
   - Whether it duplicates an existing script in [scripts/](../../../scripts/) — read the directory first; reuse or extend rather than re-implement (e.g. `get-git-diff.sh` and `extract-commit-list.sh` already share the same ref-resolution logic — don't write a third copy).

2. **Create `scripts/<name>.sh`** using the template below verbatim, then fill in the header and `MAIN LOGIC` section.

   ```bash
   #!/usr/bin/env bash

   # ------------------------------------------------------------------------------
   # <name>.sh
   #
   # <One or two sentences describing what the script does and why it exists.>
   #
   # Usage:
   #   ./<name>.sh [options] [positional-arg]
   #
   # Options:
   #   -h, --help      Show this help message and exit
   #   ...             <one line per flag, aligned like the example above>
   #
   # Examples:
   #   ./<name>.sh
   #   ./<name>.sh --some-flag
   #
   # Notes:
   #   - <any non-obvious default or behavior worth calling out>
   # ------------------------------------------------------------------------------

   set -euo pipefail

   # =========================
   # SIGNAL HANDLING
   # =========================

   trap 'echo -e "\nAborted by user (Ctrl+C). Exiting."; exit 130' INT

   # =========================
   # SOURCE UTILITIES
   # =========================

   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
   UTILS_SH="$SCRIPT_DIR/utils.sh"

   if [[ ! -f "$UTILS_SH" ]]; then
      echo "[ERROR] utils.sh not found in $SCRIPT_DIR. Exiting." >&2
      exit 1
   fi
   source "$UTILS_SH"

   print_help() {
      awk 'NR == 1 && /^#!/ {next} /^#/{sub(/^# ?/,""); print; next} /^$/{if (NR>1) print ""; next} {exit}' "$0"
   }

   # =========================
   # ARGUMENT PARSING
   # =========================

   while [[ $# -gt 0 ]]; do
      case $1 in
         -h|--help)
            print_help
            exit 0
            ;;
         -*)
            log_error "Unknown option: $1"
            print_help
            exit 1
            ;;
         *)
            log_error "Unexpected positional argument: $1"
            print_help
            exit 1
            ;;
      esac
   done

   # =========================
   # MAIN LOGIC
   # =========================

   # ... script body goes here ...
   ```

3. **Follow these house rules while filling in the template:**
   - The header comment block (between the shebang and `set -euo pipefail`) _is_ the `--help` output — `print_help` extracts it verbatim via `awk`. Keep it accurate: every flag you parse must have a matching `Options:` line, every accepted usage a matching `Examples:` line. Don't put `#`-prefixed section dividers (`# ====`) inside the header — only the closing `# ---...` delimiter belongs there, matching the existing scripts.
   - Set path-related variables (`SCRIPT_DIR`, `REPO_ROOT`, `UTILS_SH`, and any other file paths the script needs) at the top of `# SOURCE UTILITIES`, before sourcing `utils.sh`. Keeping path constants at the top makes the script easy to inspect and avoids repeated `cd`/`dirname` calls later.
   - Indentation is 3 spaces per level (matches the existing scripts, not the shell default of 2 or 4).
   - Use `log_info` / `log_warn` / `log_error` from [utils.sh](../../../.scripts/utils.sh) instead of raw `echo` for status/error output. Reserve raw `echo`/`printf` for the script's actual data output (e.g. generated markdown).
   - Default a positional arg with a `HAS_POSITIONAL_ARG="false"` guard (see [get-git-diff.sh](../../../.scripts/get-git-diff.sh)) if the script accepts at most one — this gives a clear "too many arguments" error instead of silently overwriting.
   - `-*)` must come after every named flag in the `case`, so unknown flags are rejected instead of falling through to the positional-arg branch.
   - Exit 130 on `SIGINT` (via the trap, already in the template) and non-zero on any handled error path; rely on `set -euo pipefail` for everything else.
   - Only add flags/options the caller actually needs — don't pre-build options for hypothetical future use (YAGNI).

4. **Make it executable and verify:**

   ```bash
   chmod +x scripts/<name>.sh
   ./scripts/<name>.sh --help          # confirm the help text renders as intended
   shellcheck scripts/<name>.sh        # if shellcheck is installed
   ```

5. **Update [.scripts/README.md](../../../.scripts/README.md)** — add a row to the script table with the name, one-line purpose, and usage.

## Critical Rules

- Never skip sourcing `utils.sh` — every script in `scripts/` depends on its `log_info`/`log_warn`/`log_error` helpers for consistent, colorized output.
- Never hand-roll a different help/usage mechanism — the `awk`-over-header-comment approach is what every script uses; a new pattern would make `--help` inconsistent across the `scripts/` directory.
- Never reorder the four fixed sections (`SIGNAL HANDLING` → `SOURCE UTILITIES` → `ARGUMENT PARSING` → main logic) — later sections rely on earlier ones (e.g. `print_help` must exist before it's called in argument parsing).
