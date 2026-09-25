# Fallow command map

Append `--format json` to every analysis command and pipe the file through `scripts/summarize.mjs`.

| Intent                                            | Command                                                  |
| ------------------------------------------------- | -------------------------------------------------------- |
| Full sweep (dead code + dupes + health)           | `fallow`                                                 |
| Unused files/exports/deps/types                   | `fallow dead-code`                                       |
| Prove a symbol is safe to delete                  | `fallow dead-code --trace <file>:<export>`               |
| Prove exact TypeScript symbol consumers           | `fallow dead-code --type-aware --symbol-impact <file>:<export>` |
| Prove a dependency is unused                      | `fallow dead-code --trace-dependency <name>`             |
| How one module reaches another                    | `fallow trace --path <from> <to>`                        |
| Duplication / copy-paste                          | `fallow dupes`                                           |
| Plan consolidation of one clone                   | `fallow dupes --trace dup:<fingerprint>`                 |
| Complexity + maintainability                      | `fallow health`                                          |
| Rank what to refactor first                       | `fallow health --hotspots --targets`                     |
| Explain why a function scores high                | `fallow health --complexity-breakdown`                   |
| File-level risk scores                            | `fallow health --file-scores`                            |
| Untested-but-reachable code                       | `fallow health --coverage-gaps`                          |
| Project-specific complexity limit                 | `fallow health --max-cyclomatic <N> --complexity`        |
| Gate a PR / changed files (exits 1 on fail)       | `fallow audit --base <ref>`                              |
| Orientation brief for a diff (always exits 0)     | `fallow review --base <ref> --brief`                     |
| Architecture rules before editing a file          | `fallow guard <files>`                                   |
| Security candidates (unverified)                  | `fallow security`                                        |
| Feature flags in use                              | `fallow flags`                                           |
| Inspect one file/symbol before editing            | `fallow inspect --file <path>`                           |
| Project shape (entry points, plugins, boundaries) | `fallow list --entry-points --files --boundaries`        |
| Explain an issue type without analysis            | `fallow explain <issue-type>`                            |

## Scoping flags

- `--changed-since <ref>`: limit to files changed since a ref. Prefer this over a full sweep for small edits.
- `--workspace <glob>` / `--changed-workspaces <ref>`: limit a monorepo run to some packages.

## Output formats

`human`, `json`, `sarif`, `compact`, `markdown`. Use `markdown` only when the output goes straight into a doc a human reads, such as a PR comment.
