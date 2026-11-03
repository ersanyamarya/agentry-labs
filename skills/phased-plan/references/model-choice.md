# Choosing a model per task

Pick the cheapest tier that does the task well. Tiers, cheapest first: small (Haiku), mid (Sonnet), large (Opus). Use
the versions the user names; otherwise the latest of each family.

## Small tier (Haiku)

The task is mechanical and fully specified by its row:

- Config and manifest files with known fields (`package.json` scripts, a `bin` entry, CI matrix entries).
- Thin wrappers, renames, moving code without changing behaviour, deleting a deprecated path.
- Docs that describe what already shipped: README sections, help text copied from the implementation, changelog.
- Small flags on an existing command (`--dry-run`, `--all`) where the pattern already exists nearby.
- Fixture or test cases that follow an existing test's pattern.

## Mid tier (Sonnet), the default

Normal implementation that needs reading code and making local design choices:

- New commands, modules, readers, parsers, UI screens and their tests.
- Bug fixes with a known cause.
- Rule or check implementations once their spec exists.
- Integrations with a documented API.

## Large tier (Opus), only with a stated reason

Use it only when a mistake is costly **and** hard to catch in review. Write the reason into the plan's
"How to use this plan" section; a large-tier row without a reason is a plan defect. Typical reasons:

- **Spec other tasks build on:** researching and writing down facts that must be verified (file formats, precedence
  rules, protocol behaviour), where an error silently spreads into every later task.
- **Writes that are hard to undo:** code that edits user files, data or many repos at once (fix engines, migrations).
- **Security-sensitive handling:** secrets, auth, permission boundaries.
- **Cross-cutting design** that several later phases depend on and that would be expensive to redo.

Not reasons on their own: "it's long", "it's important", "it has many steps", UI structure, defining a data shape,
or writing explanatory text. Those are mid tier.

## Batching

Consecutive rows with the same model that touch nearby files run in one sub-session. Never start a sub-session for a
one-file mechanical row on its own: startup and orientation cost more than the work.
