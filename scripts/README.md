# Scripts

Repository maintenance and installation scripts.

| Script | Purpose | Usage |
|---|---|---|
| [`setup.sh`](setup.sh) | Install, check and remove the machine setup: the agentry, trail and context-mode CLIs plus the user-level config. | `curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh \| bash`, or `bash scripts/setup.sh --help` |
| [`apply-global.mjs`](apply-global.mjs) | Merge `global/` (settings fragment, MCP file, helpers) and `rules/` into the Claude config dir; `--remove <manifest>` takes back only what setup recorded. | `node scripts/apply-global.mjs [--write] [--report <file>]`; `--copilot [--trust-file <file>]` targets `~/.copilot`; `--remove <manifest> [--part config\|copilot]` |
| [`setup-manifest.mjs`](setup-manifest.mjs) | Read and write the install manifest that `setup.sh` uses for status and uninstall. | Called by `setup.sh` |
| [`check-bundles.mjs`](check-bundles.mjs) | Check that every component has exactly one valid line in `bundles.tsv`. | `node scripts/check-bundles.mjs` |
| [`skill-drift.mjs`](skill-drift.mjs) | Compare every skill across repos after normalising project names. | `node scripts/skill-drift.mjs` |
| [`utils.sh`](utils.sh) | Shared colorized logging helpers sourced by executable scripts. | Source from another script; do not run directly. |

Tests: `node --test scripts/test/*.mjs` and `bash scripts/test/setup.test.sh` (also run it with `/bin/bash`, which is 3.2 on macOS) and `sh scripts/test/trail-autobuild.test.sh`.
