# agentry setup.sh: clean bundles, then one installer for any machine

First, `bundles.tsv` is cleaned up into five topic bundles (general, web, flutter, flutter-assets, mongodb). A bundle
is a topic, never a scope, and every component gets exactly one.

Then `scripts/setup.sh` becomes the repo's only installer. You run it as
`curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh | bash`. It installs four
parts: the agentry CLI, trail, context-mode, and `config`. The `config` part is the user-level rules, the settings
fragment, the context7 MCP entry, the trail autobuild helper and its hook, and the statusline entries. Tools always
install at `@latest`, through mise if it is on PATH, else npm.

The installer lets trail and context-mode wire themselves. It records everything it does in a manifest, so uninstall
removes exactly that and nothing else. It also reports status and checks the result. Skills are not installed: at the
end it points the user to `agentry tui` and `agentry ui` to pick bundles.

When every phase is done, `scripts/install.sh` is gone, and install, status, uninstall and reinstall work on a fresh
`$HOME` from one command.

## How to use this plan

- One phase per coordinator session, in order. Tick a task's box (`[ ]` → `[x]`) in the commit that finishes it.
- Branching: one branch per phase, `bootstrap/phase-<n>` (`bootstrap/phase-1` to `bootstrap/phase-5`). When its Done
  when checks pass, squash-merge it into `main` as one commit. Never push or publish. No AI attribution in commit
  messages.
- **Model column:** haiku-5-5 for mechanical work, sonnet-5-5 for normal implementation. opus-5-5 only for:
  - Phase 1 local shelf rebuild. It deletes and rebuilds groups in the user's real `~/.claude/skill-shelf` and
    `~/.claude/skills`, outside git, next to local-only groups that must survive untouched. Deleting the wrong group
    or skipping the backup loses skills that exist nowhere else. That is hard to undo and invisible in a repo diff.
  - Phase 2 fact-finding in a temp HOME. It is the spec for the trail step, the statusline source, uninstall and the
    test fakes. A wrong fact quietly breaks every fresh machine or leaves trail hooks behind. Examples: whether trail
    writes a global statusline file, how to remove trail's user-level hooks, whether a tool prompts.
  - Phase 4 manifest-driven removal in `apply-global.mjs`. It deletes entries from the user's `settings.json`,
    `.claude.json` and `rules/`. Removing a hand-made entry, or one that changed since install, is hard to undo and
    easy to miss in review.
  - Phase 5 fresh-home rehearsal. It runs real installs and uninstalls. A leaked `HOME`, `PATH` or
    `CLAUDE_CONFIG_DIR` would rewrite or strip the author's real `~/.claude`.
- **The coordinator runs on sonnet-5-5 and never switches model** (the prompt cache is per model). sonnet-5-5 rows run
  inline.
- **haiku-5-5 and opus-5-5 rows run as subagents** with the Agent tool's `model` set. The brief must stand alone: task
  row, files, "Done when" check and, for opus-5-5, its reason. The coordinator reviews the diff, runs the test command
  (see "Run it"), then ticks the box.
- **Batch:** consecutive haiku-5-5 rows on nearby files go to one subagent; a lone one-file haiku-5-5 row runs inline.
  Subagents on the same files run one after another.
- A task runs in its own session (`start_session` with `model`, or `claude --model <id>`) only if the user wants to
  steer it.
- Ask before going beyond a phase's tasks. Log decisions and surprises in "Decisions log".

## Run it

Phase 1 test command, from the repo root:

```bash
node scripts/check-bundles.mjs \
  && node --test scripts/test/ \
  && (cd cli && npm run check && npm run typecheck && npm test)
```

From Phase 2 on, the test command adds the installer checks:

```bash
node scripts/check-bundles.mjs \
  && bash scripts/test/setup.test.sh \
  && /bin/bash scripts/test/setup.test.sh \
  && node --test scripts/test/ \
  && shellcheck scripts/setup.sh scripts/utils.sh scripts/test/*.sh global/helpers/*.sh
```

`/bin/bash` is macOS bash 3.2: the second run proves the script works there. CI's ubuntu runner has bash 5. Until
Phase 3 adds `global/helpers/`, drop `global/helpers/*.sh` from the shellcheck line. Run `cd cli && npm test` as well
in any phase that touches `cli/`.

Executor loop per phase:

1. `git switch -c bootstrap/phase-<n> main`
2. Work the rows in order (rules above), ticking each box in its commit.
3. Run the phase's Done when checks and the test command.
4. Squash-merge into `main` (`git switch main && git merge --squash bootstrap/phase-<n> && git commit`), with a
   conventional message and no AI attribution. Do not push.

## Ground rules

- **Bundles:**
  - A bundle is a topic, never a scope. Global or project is chosen when a bundle is turned on
    (`agentry shelf on <group> [--global]`).
  - Every skill, agent, rule and claude-md file has exactly one bundle line in `bundles.tsv`. Names are lowercase and
    one word, except `flutter-assets`.
  - The five bundles are `general`, `web`, `flutter`, `flutter-assets` and `mongodb`. There is no `global` bundle.
  - The layout stays flat (`skills/<name>/`), because Claude Code, `validate.mjs skills/*/`, the cover generator and
    `skill-drift.mjs` all need flat folders.
- **"global" is not a bundle.** The repo's `global/` folder is just where `settings.fragment.json`, `mcp.json` and
  (from Phase 3) `helpers/` live. The installer part that applies them is named `config`. Scope labels such as
  "global" for `~/.claude` in agentry (`catalog.ts` install labels, `shelf --global`) are scopes and stay.
- **Runtime:**
  - `scripts/setup.sh` is bash (`#!/usr/bin/env bash`, `set -euo pipefail`) and must run on macOS `/bin/bash` 3.2:
    no associative arrays, no `${x,,}`, no `mapfile`, no `declare -n`. Linux and macOS only.
  - All JSON work (settings merge and removal, manifest, diffs, bundle checks) is done in dependency-free Node scripts
    (stdlib only), since Node 24.15+ is a prerequisite anyway. Do not use `jq`.
- **Reuse:**
  - `scripts/utils.sh` supplies colors and logging. Extend it: colors only on a TTY with `NO_COLOR` and `--no-color`
    unset, plus dim and bold. Keep its `log_*` functions working.
  - Under curl piped to bash, `setup.sh` has no checkout until it clones. It downloads `utils.sh` the way `install.sh`
    does today (`curl -fsSL` raw URL to a temp file), or sources it from `--source`.
  - `scripts/apply-global.mjs` stays the engine for the `config` part.
  - `bundles.tsv` stays: agentry reads it (`cli/packages/core/src/catalog.ts` `bundleOf()` maps catalog items to shelf
    groups).
- **Layout:**
  - New files: `scripts/check-bundles.mjs` and `scripts/test/check-bundles.test.mjs` (Phase 1); `scripts/setup.sh`,
    `scripts/setup-manifest.mjs`, `scripts/test/setup.test.sh`, `scripts/test/fakes/`,
    `scripts/test/apply-global.test.mjs`, `scripts/test/setup-manifest.test.mjs`, `global/helpers/trail-autobuild.sh`
    and `rules/trail.md` (Phases 2 to 4); `.github/workflows/scripts.yml` (Phase 1, extended in Phase 2).
  - Deleted in Phase 5: `scripts/install.sh`.
  - The installer reads the repo from a `git clone --depth 1` into `mktemp -d`, removed by a trap on EXIT, INT and
    TERM, or from `--source <dir>`.
- **Testing:** outside `cli/` (vitest), there is no test framework and nothing tests the scripts. CI
  (`.github/workflows/cli.yml`) runs only on `cli/**`, and nothing in `.github/` runs
  `skills/skill-architect/scripts/validate.mjs`.
  - Use `node --test` for Node scripts and a plain bash test script with assert helpers for `setup.sh`.
  - Every installer case runs in a `mktemp -d` HOME with `CLAUDE_CONFIG_DIR="$HOME/.claude"`,
    `--source <repo root>`, and `PATH=scripts/test/fakes/<scenario>:/usr/bin:/bin`, which hides the real mise shims and
    Node.
  - Fakes for `mise`, `npm`, `node`, `git`, `trail`, `context-mode` and `agentry` log argv to `$FAKE_LOG` and act from
    env flags. A case needing real Node symlinks `$(command -v node)` into its fake dir.
  - The menu reads from `${SETUP_TTY:-/dev/tty}`. Tests point `SETUP_TTY` at a file of answers.
  - macOS has no `timeout` binary, so a case that could hang runs behind a `run_with_deadline` helper.
- **stdin under curl piped to bash:** stdin is the script itself, so a child that reads stdin eats the rest of the
  script.
  - Every external command gets `</dev/null`, and only the menu reads `$SETUP_TTY`.
  - Use the non-interactive flags: `context-mode setup --yes --no-input --agents claude-code`,
    `context-mode doctor --no-input --agents claude-code`, and trail's `--yes`, or whatever Phase 2 settles.
  - With no TTY and no args, exit 2 with a hint showing `bash -s -- install --all --yes`.
- **Safety:**
  - The script honors `HOME` and `CLAUDE_CONFIG_DIR`. It never writes outside `$HOME`, the config dir, and its own
    temp clone and scratch folders.
  - `--dry-run` writes nothing and runs no installer. It runs only read-only probes (`--version`, doctors) and prints
    every file each step would change.
  - Every write to settings or `.claude.json` is backed up first.
  - Uninstall removes only manifest entries that still match what was installed. Anything changed by hand is kept and
    reported.
  - Never print env values or MCP headers. `CONTEXT7_API_KEY` stays a `${VAR}` placeholder.
  - The Phase 1 local shelf rebuild backs up `~/.claude/skill-shelf` and the skill symlinks before any change, and
    never touches the local-only groups `video`, `audit`, `dev-tools` and `design` (except moving `shadcn` and
    `image-artifact-setup` out of it).
- **Name clash:** in agentry, `AGENTRY_HOME` replaces the home directory (`cli/packages/core/src/paths.ts`). The
  script never sets or exports it, and runs `agentry` with it unset.
- **Trail's hook blocks the executor:** this session's trail PreToolUse hook refused a Bash command that read trail's
  shim files ("Trail's hook scripts run only from the host's hooks, never by hand"). Do not run trail's shims by hand.
  Learn their behavior from trail's installed source (`dist/claude/init.js`, `dist/claude/settings-merge.js`, and the
  uninstall code, under `npm root -g` or the mise install dir). If the hook still blocks a needed check, ask the user.
- **Facts already verified (2026-11-14):**
  - **Bundles in agentry (0.3.0):**
    - `catalog.ts` `bundleOf()` reads `bundles.tsv` and does not depend on any bundle name.
    - Its fallback, `(kind === "mcp" ? "global" : "extras")`, gives MCP servers a `global` bundle and must change.
    - `scan.ts` (around line 215) lists `<repo>/bundles.tsv` only as a cache-invalidation input file. It does not
      depend on bundle names.
    - These tests name a `global` bundle: `cli/src/test/catalog-kinds.test.ts` (lines 70 and 101),
      `cli/src/test/tui-catalog-kinds.test.ts` (line 63), `cli/src/test/doctor.test.ts` (line 389) and
      `cli/packages/web/src/test/fixtures.ts` (lines 236 and 257). `catalog.test.ts` line 148 says "global skill
      folder", which is a scope and stays.
  - **The user's local shelf:**
    - `~/.claude/skill-shelf` has groups `Flutter` (flutter-lib-refactor, flutter-logging-strategy,
      flutter-quality-gate), `global` (phased-plan, write-linkedin-post), `general` (humanize-and-unslop,
      skill-architect) and `flutter-assets` (the four asset skills).
    - Local-only groups are `audit`, `video`, `design` (figma, image-artifact-setup, shadcn), `dev-tools` and
      `web-audit` (lighthouse-audit, run-fallow).
    - `~/.claude/skills` has four symlinks into the shelf: phased-plan and write-linkedin-post into `global/`,
      humanize-and-unslop and skill-architect into `general/`.
  - **agentry shelf and catalog commands (`agentry --help`, 0.3.0):** `shelf list`, `shelf status`,
    `shelf on <target>... [--global]`, `shelf off <target>... [--global]`, `shelf shelve <skill> <group>`,
    `shelf unshelve <skill>`, `catalog refresh`, `catalog list`, and `catalog add <item>... [--group G]`, which never
    overwrites and puts a skill on the shelf, off. There is no group rename or move-between-groups command. The catalog
    is a shallow clone of GitHub `main`, so until Phase 1 is pushed it still shows the old bundle names. `catalog.ts`
    (line 260) takes the clone source from `AGENTRY_CATALOG_REPO`, so a local checkout path can serve as the catalog.
  - `shelf remove <skill>` deletes a shelved skill but keeps a copy under `~/.claude/backups/agentry/removed/` unless
    `--no-backup` is given. It refuses while the skill is linked.
  - **trail writes into the folder it runs in (trail 0.29.0).** `trail init --agents claude --no-build --dry-run` in a
    non-git folder plans repo-level writes into that folder: `.claude/settings.json`, `.trail/hook.cjs`,
    `.claude/settings.local.json` and `.trail/statusline.cjs`. It also plans global writes:
    `~/.claude/skills/trail/SKILL.md`, `~/.claude/helpers/graft-hooks.cjs`, and SessionStart, UserPromptSubmit,
    PreToolUse, PostToolUse, PostToolUseFailure, Stop and SessionEnd hooks in `~/.claude/settings.json`.
  - **trail 0.29 writes no global `helpers/trail-statusline.cjs`.** The author's copy is dated 2026-11-04, from an
    older trail.
  - **The fake-HOME dry-run hung.** The same dry-run with `HOME` set to an empty temp folder did not finish in 120 s.
  - **`trail uninstall [dir]`** removes what trail wrote to that repo. It previews unless `--yes` is given, and
    `--no-global` leaves `~/.codex` and `~/.gemini` alone. Whether it removes the `~/.claude` user-level hooks and
    skill is unknown.
  - **context-mode (2.1.10):** `setup` has `--remove`, `--agents`, `--yes`, `--no-input`, `--json`, `--dry-run` and
    `--no-color`. `doctor` has `--agents`, `--no-input` and `--json`.
  - **agentry paths and commands:**
    - It honors `CLAUDE_CONFIG_DIR`, and `.claude.json` lives inside it when it is set.
    - Fix backups go in `<config>/backups/agentry/<time>/`.
    - `agentry tui` and `agentry ui` exist.
  - **`apply-global.mjs` today:**
    - It merges `hooks` (deduped by command), `env`, `enabledPlugins`, `extraKnownMarketplaces`, and `statusLine` and
      `subagentStatusLine` (only when absent).
    - It copies `global/hooks/*.mjs`, but that folder does not exist.
    - It takes `--home` and ignores `CLAUDE_CONFIG_DIR`.
    - `expand()` rewrites only `${HOME}`, so a literal `$HOME` survives.
- **Facts still to verify:** Phase 2 row 1 settles the installer facts. Check against the tools' installed source or
  Context7 docs, not memory.

## Phase 1: Clean bundles

**Value:** every component has exactly one topic bundle, out of five, and CI fails if one is missing or wrong. The
catalog, the TUI and the user's local shelf use the same names. The installer phases build on clean bundle names.

**Done when:**
- `node scripts/check-bundles.mjs` exits 0 on the repo.
- `node --test scripts/test/` covers a missing line, a line pointing at a missing file, an unknown bundle name, a
  component with two lines, and the clean repo.
- `git grep -n -E '^global\b' bundles.tsv` and `git grep -n -i 'global bundle'` find nothing. README.md, CLAUDE.md
  and `cli/README.md` name the five bundles.
- `cd cli && npm run check && npm run typecheck && npm test` passes.
- `bun run cover` is not needed, because the component counts do not change. The executor confirms this by comparing
  the counts `bun run cover` would use (skills, agents, rules, claude-md files) before and after with
  `ls skills agents rules claude-md-files`. Regenerate only if a count changed.
- Locally, `agentry shelf list` shows exactly these groups:
  - `general`, on globally;
  - `web`, `flutter`, `flutter-assets` and `mongodb`, off;
  - the local-only `video` (28 skills), `audit` (7 skills and the slop-auditor-analyst agent), `design` (only `figma`)
    and `dev-tools` (vscode-copilot-extension), off and unchanged;
  - no group named `global`, `Flutter` or `web-audit`.
- humanize-and-unslop, skill-architect, phased-plan, write-linkedin-post and agentry are symlinks in
  `~/.claude/skills` into `skill-shelf/general/`.
- `agentry doctor` and `agentry scan ~/ws` show no new findings (the known nx@nx-claude-plugins warning in gm-stack
  stays).
- The backup folder holds the shelf, the symlinks and the before `agentry shelf list`.

| Done | Task | Model |
|---|---|---|
| [x] | Rewrite `bundles.tsv`. The header comment says a bundle is a topic (scope is chosen with `agentry shelf on <group> [--global]`), that `agentry catalog` reads this file for shelf groups, and lists the five bundles. It no longer mentions `install.sh --bundle` or a global bundle. One line per component: **general:** skills agentry, generate-commit-message, humanize-and-unslop, phased-plan, skill-architect, sync-docs-from-diff, write-linkedin-post and write-project-readme, plus `agents/super-planner.agent.md`, `claude-md-files/BASIC_CLAUDE.md`, `rules/commit-attribution.md` and `rules/context7.md`. **web:** shadcn, lighthouse-audit, run-fallow and image-artifact-setup. **flutter:** flutter-lib-refactor, flutter-logging-strategy, flutter-quality-gate, theme-hardcoding-audit and acquire-codebase-knowledge. **flutter-assets:** flutter-brand-icons, flutter-bundle-google-fonts, flutter-device-scripts-setup and flutter-store-assets. **mongodb:** mongodb-data-modeling and mongoose-schema-docs. Lines are grouped by bundle. | haiku-5-5 |
| [x] | Add `scripts/check-bundles.mjs` (stdlib Node, run from any cwd, repo root found from the script path). Read `bundles.tsv` (skip `#` and blank lines; tab-separated bundle and selector). Fail with one line per problem and exit 1 when: a `skills/*/` folder with `SKILL.md`, an `agents/*.agent.md`, a `rules/*.md` other than `README.md`, or a `claude-md-files/*.md` has no line; has more than one line; a line points at a missing path; or a bundle name is not in the allowed list, defined once at the top of the script (`general`, `web`, `flutter`, `flutter-assets`, `mongodb`). Print `bundles.tsv ok (N components, 5 bundles)` on success. Add `scripts/test/check-bundles.test.mjs` (`node:test`, temp repo copies via `fs.mkdtempSync` and `--root <dir>`) covering each failure and the clean case. | sonnet-5-5 |
| [x] | Add `.github/workflows/scripts.yml`. It runs on push and pull_request for paths `scripts/**`, `global/**`, `rules/**`, `skills/**`, `agents/**`, `claude-md-files/**` and `bundles.tsv`, on ubuntu-latest with Node 26. It runs `node scripts/check-bundles.mjs`, `node --test scripts/test/` and `node skills/skill-architect/scripts/validate.mjs skills/*/`. Phase 2 adds the shell checks. | haiku-5-5 |
| [x] | agentry code and tests. In `cli/packages/core/src/catalog.ts`, change the MCP fallback bundle from `"global"` to `"general"` and update the comment. Keep the scope labels (`label: "global"` for `~/.claude` installs). Confirm `scan.ts` uses `bundles.tsv` only as a cache input (no change expected). Update the fixtures that use a `global` bundle to `general`: `cli/src/test/catalog-kinds.test.ts` (lines 70 and 101), `cli/src/test/tui-catalog-kinds.test.ts` (line 63), `cli/src/test/doctor.test.ts` (line 389) and `cli/packages/web/src/test/fixtures.ts` (lines 236 and 257). Search `cli/` for any other `global` bundle or group assertion (`git grep -n '"global"' cli`, judging each hit as bundle or scope). Run `cd cli && npm run check && npm run typecheck && npm test`. | sonnet-5-5 |
| [x] | Docs that name bundles. `README.md`: "Bundles and syncing" lists the five bundles, says a bundle is a topic and that scope is picked with `agentry shelf on <group> [--global]`. Replace the line saying `image-artifact-setup`, `lighthouse-audit` and the flutter-assets skills "are in no bundle" (they are now in `web` and `flutter-assets`). Keep `install.sh` examples until Phase 5, only fixing `--bundle global` to `--bundle general`. `CLAUDE.md`: the Skills Quick Reference bundle column gets the new names (no `global`, no `shelf`), the architecture line for `bundles.tsv` lists the five bundles, the image-artifact-setup and lighthouse-audit "shelf-only, in no bundle" notes are updated, the Bundles convention says every component gets a line with one of the five topics and that `node scripts/check-bundles.mjs` checks it, and the paragraph defining `shelf` is replaced. `rules/README.md` and `cli/README.md`: fix any bundle-name mention (the `shelf on video` example is a local group and stays). | haiku-5-5 |
| [x] | Local shelf clean rebuild, run on `main` after the repo rows are merged. **(1) Back up:** `B=~/.claude/backups/bundle-cleanup-$(date +%Y%m%d-%H%M%S)`, then `mkdir -p "$B/skills"`, `cp -a ~/.claude/skill-shelf "$B/"`, and `find ~/.claude/skills -maxdepth 1 -type l -exec cp -a {} "$B/skills/" \;`. Save `agentry shelf list > "$B/shelf-list-before.txt"` and `agentry shelf status > "$B/shelf-status-before.txt"`. **(2) Check commands:** confirm each name and flag with `agentry --help`, `agentry shelf --help` and `agentry catalog --help`, and prefer them over manual moves. **(3) Remove the old repo-derived groups:** `agentry shelf off --all --global`, then `agentry shelf remove <skill>` (keeps a copy under `backups/agentry/removed/`) for every skill in `Flutter`, `flutter-assets`, `general`, `global` and `web-audit`, for `shadcn` and `image-artifact-setup` in `design`, and for any other repo skill found by `agentry shelf list` outside the local-only groups. Then remove the empty group folders. **(4) Rebuild from a local catalog:** `AGENTRY_CATALOG_REPO=/Users/sanyam.arya/ws/aryantriki/agentry-labs agentry catalog refresh`, so the rebuild uses the merged `bundles.tsv` and not GitHub. If the cached clone keeps its old origin, check `catalog.ts` around line 260 and move the cache aside first. Then for each bundle `agentry catalog add <skills of that bundle> --group <bundle> --dry-run`, then without `--dry-run`, passing `--group` explicitly for `general`, `web`, `flutter`, `flutter-assets` and `mongodb`. Add only skills (agents, rules and claude-md files stay as they are). **(5) Turn on:** `agentry shelf on general --global` only; everything else stays off. **(6) Keep the local-only groups untouched and off:** `video`, `audit` (including its agent), `design` (now only `figma`) and `dev-tools`. Never delete or rename them. **(7) Verify** every Phase 1 local Done when bullet, save `agentry shelf list` to `$B/shelf-list-after.txt`, and log the before and after in the Decisions log. If anything fails, stop and undo. **Undo:** `agentry shelf off --all --global`, `rm -rf ~/.claude/skill-shelf`, `cp -a "$B/skill-shelf" ~/.claude/`, remove the symlinks in `~/.claude/skills` that point into the shelf, `cp -a "$B/skills/." ~/.claude/skills/`, then `agentry shelf status`, which must match `$B/shelf-status-before.txt`. After Phase 1 is pushed, run `agentry catalog refresh` without `AGENTRY_CATALOG_REPO` so the catalog follows GitHub again. | opus-5-5 |

## Phase 2: Installer facts, output engine, menu and tool install

**Value:** `setup.sh` runs from curl piped to bash or `--source`. It shows the menu on a terminal or acts on flags,
prints its numbered plan, and installs agentry, trail and context-mode at `@latest` through mise or npm. `--dry-run`
changes nothing. The output engine and argument handling every later step uses are tested.

**Done when:**
- The test command passes. It covers these cases:
  - mise present: the fake `mise` gets
    `use -g npm:@ersanyamarya/agentry-cli@latest npm:@trailhq/trail-code@latest npm:context-mode@latest`.
  - mise absent with npm: the fake `npm` gets `install -g` with the same specs.
  - neither present: exit 1 with a message naming Node 24.15 or mise.
  - Node 24.14: exit 1 before any install.
  - `--dry-run`: the fake log is empty and the temp HOME's `find` listing is unchanged.
  - NO_COLOR, `--no-color` and non-TTY output: no `\033` bytes.
  - A failing fake `npm`: the run stops at that step and prints the re-run hint.
  - A second run with tools present: the step reports already done.
  - Menu through `SETUP_TTY`: "Install everything", then "Choose parts" with `1 3`, then "Quit". Each choice runs the
    same steps as the matching flags.
  - No TTY and no args: exit 2 with the `bash -s --` hint.
  - `--only bogus`: exit 2 listing the valid parts.
  - The temp clone is gone after success, after a failure and after INT.
- `bash scripts/setup.sh --source . install --all --dry-run` on the author's machine exits 0 and lists every step.
- The Phase 2 findings are in the Decisions log.

| Done | Task | Model |
|---|---|---|
| [x] | Fact-finding in a temp HOME (`HOME=$(mktemp -d)`, `CLAUDE_CONFIG_DIR=$HOME/.claude`, stdin `</dev/null`, a kill deadline instead of `timeout`), using the installed trail, context-mode and mise, and reading trail's `dist/` source. Record in the Decisions log: (a) why the fake-HOME `trail init --dry-run` hung, and the flags that do not hang; (b) exactly what `trail init --agents claude --no-build` with those flags writes to the temp config dir and to a `mktemp -d` scratch cwd, with `find` listings of the real `~/.claude` and the repo before and after showing nothing else changed; (c) whether trail 0.29 writes a global statusline file, and whether the scratch `.trail/statusline.cjs` still works when copied to `<config>/helpers/trail-statusline.cjs` and run from any project, judged from its source; (d) how to remove trail's user-level hooks, `skills/trail/` and `helpers/graft-hooks.cjs` safely: does `trail uninstall --yes` from a scratch dir do it, or must setup remove exactly the entries diffed before and after `trail init`; (e) what `context-mode setup --yes --no-input --agents claude-code` writes, whether `setup --remove` can be limited to `--agents claude-code`, and what `context-mode doctor --no-input --agents claude-code` exits with before setup, after setup and after remove; (f) whether trail and context-mode honor `CLAUDE_CONFIG_DIR` or only `HOME`; (g) whether `mise unuse -g npm:<pkg>` exists in the installed mise, and the npm equivalent `npm uninstall -g`; (h) the backup-set layout agentry's `backups list` and `fix --undo` expect in `<config>/backups/agentry/` (from `cli/packages/core/src`), and whether setup can write a compatible set or needs a sibling folder. Change no repo file except the Decisions log. | opus-5-5 |
| [x] | Extend `scripts/utils.sh` without breaking its callers. Color variables are set only when stdout is a TTY and neither `NO_COLOR` nor `SETUP_NO_COLOR` is set. Add `DIM` and `BOLD`. Add glyph variables, UTF-8 (`✓ ↷ ✗ ▸`) when `LC_ALL`, `LC_CTYPE` or `LANG` says UTF-8, else ASCII (`ok skip FAIL >`). Use `printf '%b'` instead of `echo -e`. Keep `log_info`, `log_warn` and `log_error`, and stay POSIX-safe for bash 3.2. | haiku-5-5 |
| [x] | Write the `scripts/setup.sh` skeleton. Add a help header with examples for curl piped to bash and `bash -s -- <args>`, and the `SETUP_TTY` test hook. Commands are `install`, `uninstall` and `status`, and flags are `--all`, `--only <part>` (repeatable; parts `agentry`, `trail`, `context-mode`, `config`), `--yes`, `--dry-run`, `--no-color`, `--remove-tools`, `--source <dir>` and `-h`. The menu and help describe `config` as "user-level rules, settings, hooks, status line and MCP entry", never as a bundle. Source `utils.sh` from `--source`, or download it with curl to a temp file. Build the repo source: `--source` dir, or `git clone --depth 1` into `mktemp -d`, removed by a trap on EXIT, INT and TERM. With no arguments on a TTY, show the menu from `$SETUP_TTY`: 1 Install everything, 2 Choose parts (numbered parts, answer like `1 3`), 3 Status, 4 Uninstall (everything or chosen parts), 5 Quit. Each choice maps to the same internal call as its flags. With no TTY and no args, exit 2 with the hint. The step engine keeps parallel indexed arrays (title, changes text, function). It prints the full numbered plan first. `run_step` prints `[n/N] title`, the exact command (dim) and the files it changes, then `done`, `skipped: <reason>` or `failed`; a step function returns 0 done, 3 skipped, other failed. Stop at the first failure with `Failed at step n: <title>. Fix the error above, then re-run: <command>`. Print the final summary `N done, N skipped, N failed` and a next-steps block. Exit 0 ok, 1 failed, 2 usage. Register install steps check prerequisites, install tools, wire context-mode, wire trail, apply config, write manifest and verify, with the last five as stubs returning skipped `not implemented yet`. | sonnet-5-5 |
| [x] | In `scripts/setup.sh` implement **check prerequisites** and **install tools**. **Check prerequisites:** require `node` and `npm` (even with mise, since the npm backend needs them), and `node --version` of at least 24.15.0, using a pure-bash dotted-version compare. Otherwise fail with `Install Node 24.15 or newer (or mise), then run this again.` Fail on old Node before installing anything. Need `git` only without `--source`. **Install tools:** for the selected tool parts, if `mise` is on PATH run `mise use -g npm:<pkg>@latest ...`, else `npm install -g <pkg>@latest ...`. Packages are `@ersanyamarya/agentry-cli`, `@trailhq/trail-code` and `context-mode`. Afterwards check each binary with `--version` and record the manager used (`mise` or `npm`) for the manifest. The step is skipped `already installed` when every selected binary is on PATH. Never install mise, never build agentry or `npm link`. | sonnet-5-5 |
| [x] | Add `scripts/test/setup.test.sh` and `scripts/test/fakes/`: assert helpers, a temp HOME per case, the PATH-injected fakes (`mise`, `npm`, `node` with a settable version, `git`, `agentry`, `trail`, `context-mode`), `SETUP_TTY` answer files and `run_with_deadline`. Cover every Phase 2 Done when case. Run it under `bash` and `/bin/bash`. | sonnet-5-5 |
| [x] | Extend `.github/workflows/scripts.yml` (from Phase 1) with `shellcheck scripts/setup.sh scripts/utils.sh scripts/test/*.sh` (shellcheck is preinstalled on the runner) and `bash scripts/test/setup.test.sh`. Fix every shellcheck finding. | haiku-5-5 |

## Phase 3: Machine-only pieces into the repo, wiring and verify

**Value:** `setup.sh install --all --yes` gives a fresh machine the full setup: the tools wired by their own commands,
then the `config` part (user-level rules, settings fragment, autobuild helper and hook, statusline entries, MCP entry).
It then verifies the result and points to `agentry tui` and `agentry ui` for bundles. A second run reports every step
as already done.

**Done when:**
- `node --test scripts/test/` passes. It covers these `apply-global.mjs` cases:
  - First run into an empty temp HOME: adds the SessionStart hook, `statusLine`, `subagentStatusLine`,
    `env.TRAIL_INVOKED_AS`, the context7 MCP server, `helpers/trail-autobuild.sh` and every `rules/*.md` except
    `README.md`.
  - Second run: prints `Nothing to add.` and leaves the files byte-identical.
  - A settings file seeded with the author's real SessionStart entry (command exactly
    `sh "$HOME/.claude/helpers/trail-autobuild.sh"`) gets no duplicate.
  - An existing different `statusLine` is left as is.
  - A changed helper or rule is replaced, and a `.bak-*` copy is kept.
  - With `CLAUDE_CONFIG_DIR` set, everything lands inside it.
  - `--report <file>` writes JSON listing exactly what was added.
- `node scripts/check-bundles.mjs` passes with `rules/trail.md` on a `general` line.
- The test command passes with these new `setup.sh` cases:
  - A full install with fakes runs the wiring steps in order with the exact argv.
  - The scratch dir is gone afterwards.
  - A second run reports the steps already done.
  - A failing fake `agentry doctor` makes verify fail with exit 1.
  - `agentry scan` is skipped when `$HOME/ws` is absent.
  - The next-steps block lists only commands that the fake `agentry --help` names.
- `node scripts/apply-global.mjs` (dry run) on the author's machine prints `Nothing to add.`, or only differences the
  executor reports to the user before any `--write`.

| Done | Task | Model |
|---|---|---|
| [x] | Copy `~/.claude/helpers/trail-autobuild.sh` byte for byte to `global/helpers/trail-autobuild.sh`, mode 0755. Copy `~/.claude/rules/trail.md` to `rules/trail.md`, and add `general	rules/trail.md` to `bundles.tsv` in the general group. Run `node scripts/check-bundles.mjs` and `shellcheck global/helpers/trail-autobuild.sh`, fixing only real findings. The helper's behavior must stay the same: POSIX sh, background `trail build`, always exit 0. | haiku-5-5 |
| [x] | Extend `global/settings.fragment.json`. Add `hooks.SessionStart` with one entry whose single command hook is exactly `sh "$HOME/.claude/helpers/trail-autobuild.sh"`: literal `$HOME` with no braces, so `expand()` leaves it and it matches the existing entry. Add `statusLine` and `subagentStatusLine`, both `{"type":"command","command":"node \"$HOME/.claude/helpers/trail-statusline.cjs\""}`. Keep `env.TRAIL_INVOKED_AS` and the tab indentation. | haiku-5-5 |
| [x] | Extend `scripts/apply-global.mjs` (install side). Resolve the config dir as `CLAUDE_CONFIG_DIR` or `<home>/.claude`, and `.claude.json` inside the config dir when `CLAUDE_CONFIG_DIR` is set, else at `<home>/.claude.json`, mirroring `cli/packages/core/src/paths.ts`. Copy every `global/helpers/*` (not tests) to `<config>/helpers/` with mode 0755, and every `rules/*.md` except `README.md` to `<config>/rules/`, reusing the existing compare, backup and replace logic. Rules are always-on user rules, not chosen by bundle. Add `--report <file>`: JSON of what this run added (hook entries by event and command, settings keys with values, MCP server names, copied files with sha256). Print `Nothing to add.` and exit 0 when there is nothing to do. Update the header comment, describing `global/` as the folder for the settings fragment, MCP file and helpers. Change no existing merge rule. | sonnet-5-5 |
| [x] | Add `scripts/test/apply-global.test.mjs` (`node:test`, `node:assert`, `fs.mkdtempSync`). Spawn the script with `--home` or `CLAUDE_CONFIG_DIR` and cover every apply-global Done when case. | sonnet-5-5 |
| [x] | Steps in `scripts/setup.sh`. **Wire context-mode:** skipped `already wired` when `context-mode doctor --no-input --agents claude-code` exits 0; else run `context-mode setup --yes --no-input --agents claude-code </dev/null`. **Wire trail:** skipped `already wired` when the files and hooks Phase 2 listed already exist. Otherwise save a copy of `<config>/settings.json`, then `cd "$(mktemp -d)"` and run `trail init --agents claude --no-build` with the Phase 2 non-interactive flags and `</dev/null`. If trail wrote no global statusline file, copy the scratch `.trail/statusline.cjs` to `<config>/helpers/trail-statusline.cjs` when missing. Remove the scratch dir in the trap, and keep the before copy for the manifest diff. **Apply config:** `node <src>/scripts/apply-global.mjs --write --report <tmp>`, skipped `already applied` on `Nothing to add.`. Pass `CLAUDE_CONFIG_DIR` through to every step. Under `--dry-run`, run the doctors and `apply-global.mjs` without `--write` and show their plan lines indented. Leave trail's graft-named files and the `mcp__graft__` matcher alone. | sonnet-5-5 |
| [x] | Step **verify** and the next-steps block in `scripts/setup.sh`. With `AGENTRY_HOME` unset, check only the selected parts and report each line ok or failed: `agentry doctor` run from `$HOME`, `agentry scan "$HOME/ws"` (skipped `no ~/ws` when absent), `context-mode doctor --no-input --agents claude-code`, and `command -v trail`. Run all checks, list the failed ones, and exit 1 if any failed. Next steps: open a new Claude Code session, then pick bundles with `agentry tui` (terminal UI) or `agentry ui` (web UI), or `agentry catalog list`, `agentry catalog add <item>`, `agentry shelf list` and `agentry shelf on <group> [--global]`. Print each command only if `agentry --help` lists it. | sonnet-5-5 |
| [x] | Extend `scripts/test/setup.test.sh` and the fakes for every Phase 3 setup case. The fake `trail` writes the files and hooks Phase 2 recorded into its cwd and `<config>`; fake doctors exit from env flags; real Node is symlinked in for `apply-global.mjs`. Assert that no file appears outside the temp HOME. | sonnet-5-5 |

## Phase 4: Manifest, status and uninstall

**Value:** the user can see what is installed and what is missing, and remove everything or chosen parts. Uninstall
takes away exactly what setup added, with backups first. Hand-made settings and changed files stay.

**Done when:**
- `node --test scripts/test/` covers these cases:
  - The manifest round trip.
  - The settings diff, given the before and after copies around `trail init`.
  - `apply-global.mjs --remove <manifest>` deletes only listed entries that still match.
  - A hand-added hook, a hand-edited rule and a changed `statusLine` survive the removal and are reported.
- The test command covers these `setup.sh` cases:
  - Install, uninstall, install again ends with the same files and settings as one install.
  - Uninstall with `--all --yes` leaves a seeded hand-made settings entry and MCP server untouched.
  - Uninstall makes a backup set before any write.
  - `uninstall --dry-run` changes nothing.
  - `uninstall --only trail` on a machine without trail reports `not installed` and exits 0.
  - Tools stay unless `--remove-tools` is given or the final prompt is answered yes (the default is keep), and are then
    removed with the recorded manager.
  - `status` lists each part as installed, missing or partial, from the manifest plus live checks.

| Done | Task | Model |
|---|---|---|
| [x] | Add `scripts/setup-manifest.mjs` (stdlib Node) and `scripts/test/setup-manifest.test.mjs`. It handles `<config>/agentry/install-manifest.json`, which holds a version field, timestamp, and per part: tools with manager and version, copied files with sha256, settings keys and hook entries added (from `apply-global --report`), trail's hook entries from a diff of `settings.json` before and after `trail init`, trail's files, and context-mode wiring. Subcommands: `record <part> <json-file>` merges entries into the manifest, `diff-settings <before> <after>` prints the added hook entries and keys as JSON, `show` prints the manifest, and `forget <part>` drops a part after its uninstall. Writes are atomic (temp file then rename). | sonnet-5-5 |
| [x] | Add `--remove <manifest>` to `scripts/apply-global.mjs` with its tests. Remove a hook entry only when its command matches the manifest, a settings key only when its value equals the recorded one, an MCP server only when it equals `global/mcp.json`, and a copied file only when its sha256 matches. Report each kept item with the reason. Back up every touched file first into the backup layout Phase 2 chose under `<config>/backups/`. Preview without `--write`. Never touch an entry the manifest does not list. | opus-5-5 |
| [x] | Steps in `scripts/setup.sh`. **Write manifest:** after install, record the tools, the `apply-global --report` and the trail settings diff with `setup-manifest.mjs`; skipped `nothing new` when no step changed anything. **status:** print per part installed, missing or partial, with what is missing: the binary and version on PATH, the doctor result, and the manifest entries still present in settings and files. Exit 0 always. | sonnet-5-5 |
| [x] | Uninstall steps in `scripts/setup.sh`, each part in reverse install order. A part with no manifest entry and no live trace is skipped `not installed`. **config:** `apply-global.mjs --remove`. **trail:** remove the wiring by the method Phase 2 chose (`trail uninstall --yes` from a scratch dir, or `--remove` of the recorded trail entries and files). **context-mode:** `context-mode setup --remove` with the flags Phase 2 found, limited to claude-code if possible. **Tools:** last; ask on `$SETUP_TTY` with the default keep. `--remove-tools` or `--yes --remove-tools` removes them with the recorded manager (`mise unuse -g` or `npm uninstall -g`, per Phase 2). Forget each part in the manifest after it is removed. `--dry-run` prints every removal and runs only previews. | sonnet-5-5 |
| [x] | Extend `scripts/test/setup.test.sh` and the fakes (the fake `trail uninstall`, `context-mode setup --remove`, `mise unuse` and `npm uninstall` log and undo their fake writes) to cover every Phase 4 setup case, including the menu path Uninstall, then Choose parts, through `SETUP_TTY`. | sonnet-5-5 |

## Phase 5: Delete install.sh, docs, cover and a fresh-home rehearsal

**Value:** the repo has one installer, documented with a one-liner at the top of the README. It has been run end to
end (install, status, uninstall, install) against an empty home with real packages, without touching the real
`~/.claude`.

**Done when:**
- `git grep -n 'install\.sh'` matches nothing outside `docs/` plans.
- `git grep -n -i 'global bundle'` finds nothing.
- The rehearsal log is in the Decisions log, with before-and-after checksums of the real `~/.claude/settings.json`,
  `~/.claude.json`, `~/.claude/rules/` and `~/.config/mise/config.toml` matching.
- `cd scripts/image-gen-tools && bun install && bun run cover` prints a rules count one higher than before
  (`trail.md`), and
  `node ../../skills/image-artifact-setup/scripts/verify-images.mjs ../../.github/assets --expect 1 --width 1280 --height 640`
  passes. The executor views `.github/assets/cover.jpg` before committing.
- `node skills/skill-architect/scripts/validate.mjs skills/*/`, `cd cli && npm test` and the test command pass.

| Done | Task | Model |
|---|---|---|
| [ ] | Delete `scripts/install.sh` and fix every reference found by `git grep -n 'install\.sh'`. In `skills/agentry/SKILL.md` line 11, the missing-agentry hint becomes the `setup.sh` one-liner with `bash -s -- install --only agentry --yes`, dropping the `npm link` advice. In `scripts/README.md`, the `install.sh` row becomes `setup.sh`, and add rows for `apply-global.mjs` and `check-bundles.mjs`. Check `.github/` and `scripts/skill-drift.mjs` (no reference found on 2026-11-14). In the `bundles.tsv` header, drop any leftover installer wording. | haiku-5-5 |
| [ ] | `README.md`. At the top, add the one-liner (curl of the raw `scripts/setup.sh` URL piped to bash, in a code block) with examples: `bash -s -- install --all --yes`, `bash -s -- status`, `bash -s -- uninstall --all --yes` and `bash -s -- install --only trail --dry-run`. Describe the four parts (agentry, trail, context-mode, config), the Node 24.15 and mise-or-npm requirement, and that skills come as bundles from `agentry tui` and `agentry ui`. Rewrite "Getting started", "One-line Installer", "Manual Copy" and "Bundles and syncing" around `setup.sh` and agentry's catalog and shelf, keeping the five topic bundles from Phase 1. Remove every `install.sh` example. List `rules/trail.md` in the rules list and update "Requirements". Do not write "global bundle" anywhere; "global" appears only as the `--global` scope or the `global/` folder. | haiku-5-5 |
| [ ] | `CLAUDE.md`. Architecture: `scripts/` lists `setup.sh`, `setup-manifest.mjs`, `check-bundles.mjs`, `test/`, `utils.sh`, `apply-global.mjs`, `skill-drift.mjs` and `image-gen-tools/`; `global/` is described as the settings fragment, `mcp.json` and `helpers/` that the `config` part applies; `rules/` lists `trail`. "Common Commands" uses the `setup.sh` one-liner, status, uninstall and the script tests. Replace the "Check install changes with install.sh" line in Bundles with `node scripts/check-bundles.mjs`. Add "Keeping the docs current" rows for `scripts/setup.sh` (README one-liner and examples change with its commands or parts) and `global/` (fragment or helpers change what the `config` part installs). `rules/README.md`: add `trail.md` and say `setup.sh` installs every rule as a user-level rule. `cli/README.md`: fix only a line that mentions `install.sh`, if any. Do not reintroduce "global bundle". | haiku-5-5 |
| [ ] | Regenerate the README cover, since `rules/trail.md` changes the rules count: `cd scripts/image-gen-tools && bun install && bun run cover`, then `node ../../skills/image-artifact-setup/scripts/verify-images.mjs ../../.github/assets --expect 1 --width 1280 --height 640`. Check the printed counts (rules +1, others unchanged), view the image, and commit `.github/assets/cover.jpg` with the docs. | haiku-5-5 |
| [ ] | Fresh-home rehearsal with real packages. Checksum the real `~/.claude/settings.json`, `~/.claude.json`, `~/.claude/rules/` and `~/.config/mise/config.toml`. Set `T=$(mktemp -d)`, `HOME=$T`, `CLAUDE_CONFIG_DIR=$T/.claude` and `NPM_CONFIG_PREFIX=$T/npm`, and `PATH=$T/npm/bin:<dir of real node>:/usr/bin:/bin` with no mise shims and no `~/.local/bin`. From the branch checkout run `bash scripts/setup.sh --source . install --all --yes </dev/null`, then `status`, then `uninstall --all --yes --remove-tools`, then `install --all --yes` again, and once `install --all --dry-run`. Confirm: the second install's result matches the first, status matches each state, and uninstall leaves `$T/.claude` with only backups and files no step listed. Re-check the checksums. Fix any bug in `scripts/setup.sh` with a matching test case, and log the run summary and fixes in the Decisions log. Never point a variable at the real home. | opus-5-5 |

## Out of scope

- An `agentry bootstrap` command, and agentry CLI changes beyond the Phase 1 bundle-name fix in `catalog.ts` and its
  tests.
- Nesting skills in bundle folders, or dropping `bundles.tsv`.
- A `global` bundle, or any bundle that stands for a scope.
- Changing the user's local-only shelf groups (`video`, `audit`, `design` apart from its two repo skills,
  `dev-tools`), or moving them into the repo.
- Installing mise, Node, git or Homebrew. The script stops and says what to install.
- A pin or versions file. Tools always install at `@latest`.
- Building agentry locally, `npm link`, or shipping repo files inside the npm package.
- Installing skills, agents or CLAUDE.md templates from `setup.sh`. Those go through `agentry tui`, `agentry ui`,
  `agentry catalog` and `agentry shelf`.
- Copying all of `~/.claude`, other plugins or MCP servers, or per-repo `.claude` folders.
- Hand-copying trail's or context-mode's hooks into the repo. Each tool wires itself. The only trail file setup
  places is the statusline file trail just generated in the scratch folder.
- Renaming or removing trail's graft-named files (`graft-hooks.cjs`, the `mcp__graft__` matcher) on install.
- Windows, or fish or zsh-only syntax.
- Changes in other repos under `/Users/sanyam.arya/ws`.
- Pushing, tagging or publishing to npm.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-14 | Bundle cleanup runs first (Phase 1). A bundle is a topic, never a scope; scope is chosen with `agentry shelf on <group> [--global]`. There is no `global` bundle. Each skill, agent, rule and claude-md file has exactly one bundle. Names are lowercase and one word, except `flutter-assets`. |
| 2026-11-14 | Five bundles. **general:** skills agentry, generate-commit-message, humanize-and-unslop, phased-plan, skill-architect, sync-docs-from-diff, write-linkedin-post and write-project-readme, plus super-planner, BASIC_CLAUDE, and rules commit-attribution, context7 and (from Phase 3) trail. **web:** shadcn, lighthouse-audit, run-fallow and image-artifact-setup. **flutter:** flutter-lib-refactor, flutter-logging-strategy, flutter-quality-gate, theme-hardcoding-audit and acquire-codebase-knowledge. **flutter-assets:** flutter-brand-icons, flutter-bundle-google-fonts, flutter-device-scripts-setup and flutter-store-assets. These are one-off generators kept apart from flutter, because turning a group on loads all its skills. **mongodb:** mongodb-data-modeling and mongoose-schema-docs. |
| 2026-11-14 | `acquire-codebase-knowledge` may move to `general` later. That is a one-line change in `bundles.tsv`: change its bundle column. |
| 2026-11-14 | Keep `bundles.tsv` and the flat `skills/<name>/` layout. Claude Code, CI's `skills/*/` validation, the cover generator and `skill-drift.mjs` need flat folders, and agentry's `catalog.ts` reads `bundles.tsv` for shelf groups. `scan.ts` only watches the file as a cache input and does not depend on names. |
| 2026-11-14 | agentry's MCP catalog items fall back to bundle `general` instead of `global`. Scope labels ("global" meaning `~/.claude`) stay. |
| 2026-11-14 | Bundle check: `scripts/check-bundles.mjs`, run by a new `.github/workflows/scripts.yml`, because nothing in `.github/` validates skills or bundles today (`cli.yml` triggers only on `cli/**`). The same workflow also runs `validate.mjs skills/*/`. |
| 2026-11-14 | Local shelf: a clean rebuild instead of renaming in place. Back up the shelf, the symlinks and `agentry shelf list` to `~/.claude/backups/bundle-cleanup-<timestamp>/`. Remove the repo-derived groups (`Flutter`, `flutter-assets`, `general`, `global`, `web-audit`) and the repo skills in `design` (shadcn, image-artifact-setup) with `agentry shelf remove`. Rebuild them with `agentry catalog add --group <bundle>` from a local catalog (`AGENTRY_CATALOG_REPO` pointing at the checkout), because GitHub `main` has the old names until a push. Turn on only `general` globally. It replaces today's two on groups, so humanize-and-unslop, skill-architect, phased-plan and write-linkedin-post stay active, and agentry joins them as part of `general`. The undo commands are in the Phase 1 row. |
| 2026-11-14 | Local-only groups stay untouched and off: `video` (28 skills), `audit` (7 skills and the slop-auditor-analyst agent), `design` (only `figma` once the two repo skills move to `web`) and `dev-tools` (vscode-copilot-extension). They exist only on this machine. Moving them into the repo is a possible future plan. |
| 2026-11-14 | The README cover is not regenerated in Phase 1, because no component count changes (verified by counting). It is regenerated in Phase 5, because `rules/trail.md` raises the rules count. |
| 2026-11-14 | One installer, `scripts/setup.sh`, run as curl piped to bash, or with `bash -s -- <args>` for flags. It replaces the earlier `bootstrap.sh` idea. `scripts/install.sh` is deleted in Phase 5. `scripts/utils.sh` (colors and logging) and `scripts/apply-global.mjs` (the `config` part engine) are kept and extended. |
| 2026-11-14 | The installer part that applies the user-level rules, settings fragment, hook, helper, status line and MCP entry is named `config`, not "global files", to avoid confusion with bundles. The repo's `global/` folder is just where `settings.fragment.json`, `mcp.json` and `helpers/` live. The `config` part copies every `rules/*.md` (except `README.md`) as user-level rules, whatever their bundle; the bundle line only drives agentry's catalog. |
| 2026-11-14 | Interactive menu (Install everything, Choose parts, Status, Uninstall, Quit) on a terminal with no arguments. It reads from `/dev/tty` because stdin is the pipe under curl, and `SETUP_TTY` overrides that for tests. With no TTY and no args, it exits 2 with a flags hint. |
| 2026-11-14 | Parts: `agentry`, `trail`, `context-mode`, `config`. |
| 2026-11-14 | Tools always install at `@latest`, through `mise use -g npm:<pkg>@latest` when mise is on PATH, else `npm install -g`. There is no pin file. A breaking change in trail or context-mode is handled by updating the installer when it happens. mise is never installed. Node 24.15+ is checked first, because context-mode needs it. |
| 2026-11-14 | agentry comes from npm only. No local build and no `npm link`, because the temp clone is deleted and a link would dangle. |
| 2026-11-14 | The repo is read from a `git clone --depth 1` into `mktemp -d`, deleted by a trap on EXIT, INT and TERM even on failure. `--source <dir>` uses a checkout instead (tests, local runs). |
| 2026-11-14 | Wiring: `context-mode setup --agents claude-code`, then `trail init --agents claude --no-build` once from a throwaway scratch folder, then `apply-global.mjs`. Every tool call gets `</dev/null` and non-interactive flags. |
| 2026-11-14 | Finding: trail still writes repo-level files into the scratch folder (`.claude/settings.json`, `.trail/hook.cjs`, `.claude/settings.local.json`, `.trail/statusline.cjs`). That is harmless because the folder is deleted. |
| 2026-11-14 | Gap: trail 0.29 writes no global `helpers/trail-statusline.cjs`. The author's copy is a leftover from an older trail, so on a fresh machine the `statusLine` entry would point at a missing file. Planned fix, pending Phase 2: copy the scratch folder's freshly generated `.trail/statusline.cjs` to `<config>/helpers/trail-statusline.cjs`. trail's file is not committed to this repo. |
| 2026-11-14 | Finding: `trail init --dry-run` with an empty temp HOME hung for over 120 s. Phase 2 finds the cause and the flags that avoid it. |
| 2026-11-14 | Uninstall is driven by `<config>/agentry/install-manifest.json` (files with sha256, settings keys and hook entries, trail's entries from a before-and-after diff, tools with mise or npm, timestamp). It removes only listed entries that still match and backs up first under `<config>/backups/` (exact layout from Phase 2 row 1h). Tools are kept unless `--remove-tools` is given or the final prompt is answered yes. A part that is not installed reports `not installed` and succeeds. |
| 2026-11-14 | `trail uninstall` is per repo. Phase 2 checks whether running it from a scratch dir also clears the `~/.claude` user-level hooks and skill. If not, setup removes exactly the entries recorded from the `settings.json` diff around `trail init`. |
| 2026-11-14 | Skills are not installed by `setup.sh`. The next-steps block points to `agentry tui`, `agentry ui`, `agentry catalog list` and `add`, and `agentry shelf list` and `on`, all confirmed in `agentry --help` (0.3.0). The script prints only the ones the installed `agentry --help` lists. |
| 2026-11-14 | `AGENTRY_HOME` means "home dir" to agentry, so `setup.sh` never sets it and runs `agentry` with it unset. |
| 2026-11-14 | Tests: `node --test` for the Node scripts and a plain bash test script with PATH-injected fakes and a temp HOME for `setup.sh`. There is no script test framework, and vitest lives only in `cli/`. |
| 2026-11-14 | Output: full numbered plan first, then `[n/N]` per step with the command and the files it changes, and done, skipped or failed after. Then a summary and a next-steps block. Color only on a TTY, honoring `NO_COLOR` and `--no-color`, with ASCII glyphs outside UTF-8 locales. Stop at the first failure with a re-run hint. Re-runs report already done. |
| 2026-11-14 | Verify: `agentry doctor`, `agentry scan ~/ws` (skipped if absent), `context-mode doctor --agents claude-code` (other agents report FAIL for tools not in use), and `trail` on PATH. Any failure exits non-zero. |
| 2026-11-14 | Branching: `bootstrap/phase-1` to `bootstrap/phase-5`, each squash-merged into `main` when its checks pass. Nothing pushed or published, and no AI attribution. |
| 2026-11-14 | Phase 1 result: local shelf rebuilt. Backup `~/.claude/backups/bundle-cleanup-20261114-144243` (also holds the old `catalog-cache/`). Groups now: `general` (8, on globally), `web`, `flutter`, `flutter-assets`, `mongodb` (off), plus untouched `video`, `audit`, `design` (figma), `dev-tools` (off). Surprises: (1) `catalog refresh` ignores `AGENTRY_CATALOG_REPO` when the cache already has a `.git`, so the cache was moved aside; the new cache's origin is the local checkout, so after pushing run `git -C ~/.claude/cache/agentry/catalog remote set-url origin https://github.com/ersanyamarya/agentry-labs.git` then `agentry catalog refresh`. (2) Turning on all 8 `general` skills (plan expected 5 links) adds 8 duplicate-skill scan warnings against project-level copies in mqtizermqtt_client and wemoveapp (generate-commit-message, sync-docs-from-diff, write-project-readme) and gentlemans-stack and immich-photo-cleaner (generate-commit-message). (3) The shelved `flutter-store-assets` lacks the uncommitted `detect-project.mjs` edit, because the catalog clones committed HEAD. (4) `mcp/trail` no longer appears in the catalog. Undo also needs `$B/catalog-cache` moved back to `~/.claude/cache/agentry/catalog`. |
| 2026-11-14 | Phase 2 fact (a): the hang is mise, not trail. With `HOME` set to an empty temp dir, the mise shim (`~/.local/share/mise/shims/trail`, a symlink to `mise`) finds no `~/.config/mise/config.toml` and no data dir under the temp HOME. Observed: it spins at ~95% CPU and never returns, and `MISE_DEBUG=1` prints nothing before the kill. A re-exec loop is the likely cause, but it was not traced. Even `trail --version` and `context-mode --version` hang that way. `MISE_DATA_DIR` alone fails fast with `trail is not a mise bin`. The cure is to put the real bin dirs on `PATH` instead of the shims: `PATH=<mise>/installs/npm-trailhq-trail-code/<v>/bin:<mise>/installs/npm-context-mode/<v>/bin:<mise>/installs/node/<v>/bin:/usr/bin:/bin`. `MISE_DATA_DIR` plus `MISE_GLOBAL_CONFIG_FILE` pointed at the real ones also works. With that, `trail init --agents claude --no-build --dry-run </dev/null` exits 0 in 0.2 s. trail itself never prompts: with no TTY and an explicit `--agents`, there is no picker. The look-back only calls `claude` on a TTY, and `--dry-run` returns before it writes anything. Setup on a real machine runs with the real HOME and has no such hang, but the tests and the Phase 5 rehearsal must use real bin dirs and never shims. `DO_NOT_TRACK=1` stops trail's telemetry file and its flush. |
| 2026-11-14 | Phase 2 fact (b): `HOME=$T CLAUDE_CONFIG_DIR=$T/.claude DO_NOT_TRACK=1 trail init --agents claude --no-build </dev/null`, run in a `mktemp -d` cwd `$W`, exits 0. **In `$HOME`:** `.claude/settings.json` (hooks only: SessionStart, UserPromptSubmit, Stop, SessionEnd with no matcher; PreToolUse `Write\|Edit\|MultiEdit` and `Bash`; PostToolUse `Write\|Edit\|MultiEdit` and `Bash\|mcp__graft__\|mcp__trail__\|Read\|Grep\|Glob\|Skill`; PostToolUseFailure `Bash`; each command is `node "<abs $HOME>/.claude/helpers/graft-hooks.cjs" <event> \|\| exit 0`, with an absolute path, not `$HOME`). Also `.claude/helpers/graft-hooks.cjs`, `.claude/skills/trail/SKILL.md`, `.trail/{README.md,install.json,init/local/<cwd-slug>.json,repos/local/<cwd-slug>/past-sessions.json}`. That is the exact list from a fresh `$T` with `DO_NOT_TRACK=1`. Without `DO_NOT_TRACK`, an earlier run also wrote `.graft/{telemetry.json,update-check.json}` and `.npm/{_cacache,_logs}`, the latter from the update check. `install.json` holds `claudeDist`, the versioned install path. **In `$W`:** `.claude/settings.json` (a SessionStart hook to `.trail/hook.cjs`), `.claude/settings.local.json` (`statusLine` and `subagentStatusLine` running `node "${CLAUDE_PROJECT_DIR:-.}/.trail/statusline.cjs"`, `footerLinksRegexes`, `permissions.allow` with the trail and graft Bash rules), `.trail/{hook.cjs,statusline.cjs,.gitignore,cache/.cache/wiring-stamp.json}`. The real `~/.claude`: `settings.json` sha1 is unchanged, and the file-list diff shows only `projects/<this repo>` transcripts and `backups/.claude.json.backup.*` rotation from the live sessions. `~/.claude.json` changed by that same live-session rotation, at a cadence of about 1 minute before and during the runs; every test run had `CLAUDE_CONFIG_DIR` set to a temp dir. The real `~/.claude.json` has no `/var/folders/` paths, and `~/.claude/plugins/*.json` have mtimes before the runs. The repo: `git status` and `find -newermt` show only this doc, commit `85ab2bd` (made by other work during these runs), and `.trail/cache/*` from the live session. None of trail's scratch files are in it. |
| 2026-11-14 | Phase 2 fact (c): trail 0.29 writes no global statusline file. Its dry-run plan and the real run list only repo `.trail/statusline.cjs`. That file does not depend on where it lives: it never uses `__dirname`, sets `dir = CLAUDE_PROJECT_DIR \|\| cwd`, and finds trail's `dist/claude/statusline.js` through `~/.trail/install.json` (`claudeDist`, owner-only check), then `<dir>/node_modules`, then node's `../lib`, then `trail` or `graft` on PATH, then `npm root -g`. It imports the highest version found, and an import that fails is a no-op. Tested: copied to `$T/.claude/helpers/trail-statusline.cjs` and run with node from another empty project, with JSON on stdin, it printed `◤ trail · not built · run trail build` and exited 0, both with `install.json` and with it moved away (PATH lookup). So the planned copy works while `install.json` is valid. But with `claudeDist` pointing at a missing dir and only the mise shims on PATH, it printed nothing: blank, exit 0. The shim resolves to the `mise` binary, and `npm root -g` has no trail-code. So once a mise upgrade prunes the old version dir, the statusline goes blank, and likely so do the `graft-hooks.cjs` hooks, which use the same lookup (not tested). Consequence: after any trail install or upgrade, setup must re-run `trail init` from a scratch dir to refresh `install.json`, rather than skip it as already wired. |
| 2026-11-14 | Phase 2 fact (d): `trail uninstall --yes </dev/null`, run from any fresh `mktemp -d` dir, also removes the user-level wiring (`[machine-wide]`): it deletes `helpers/graft-hooks.cjs` and `skills/trail/SKILL.md`, and strips only trail's hook entries from `settings.json`. Tested with a hand-added `model`, `statusLine`, a SessionStart hook and a PreToolUse `Bash` hook, plus extra files in `helpers/` and `skills/`: all survived. With nothing else left, it deletes `settings.json` and the empty `$HOME/.claude`. It leaves `~/.trail/` and `~/.graft/`. Without `--yes` it previews and exits 0. **Caveat:** `--yes` also removes trail's wiring for other agents that setup never installed. After `trail init --agents claude codex gemini`, the preview listed `~/.codex/config.toml` (`[mcp_servers.graft]`), `~/.codex/hooks.json` and `~/.codex/hooks/graft/graft-hooks.cjs` as `[machine-wide]` too. `--no-global` skips every machine-wide path, `~/.claude` included ("nothing to remove"), so it cannot scope the removal to Claude. Recommendation: run `trail uninstall </dev/null` (preview) from a scratch dir first. Run `--yes` only when every `[machine-wide]` path is under `$HOME/.claude`. Otherwise remove only the entries recorded from the before-and-after diff of `trail init` (hooks whose command names `helpers/graft-hooks.cjs`, that file, and `skills/trail/`), and say why. |
| 2026-11-14 | Phase 2 fact (e): `context-mode setup --yes --no-input --agents claude-code </dev/null` needs the real `claude` on PATH. Without it, both setup and `doctor --no-input --agents claude-code` show `SKIPPED claude not on PATH` and **exit 0**. So the "already wired" gate and verify must read `doctor --json` and require the claude-code status to be PASS, not trust exit 0. Setup should also fail early if `claude` is not on PATH. With `claude` present it runs `claude plugin marketplace add <context-mode pkg dir>` (a local directory, no network) and `claude plugin install context-mode@context-mode`, then verifies with an MCP handshake and a hook call. It writes `<config>/settings.json` (`extraKnownMarketplaces.context-mode` with source `directory` set to the versioned mise package path, and `enabledPlugins["context-mode@context-mode"]: true`), `<config>/plugins/{installed_plugins.json,known_marketplaces.json,cache/context-mode/context-mode/2.1.10/}`, `<config>/.claude.json` plus `<config>/backups/.claude.json.backup.<ms>` (written by claude), and `$HOME/.context-mode/backups/<ISO>/manifest.json`. A re-run is idempotent: PASS, and no new backup run. `setup --remove` ignores `--agents`: it undoes every recorded run for every agent (`runRemove` reads all `~/.context-mode/backups/*/manifest.json`). Here that means `claude plugin uninstall context-mode@context-mode`, after which the manifest is renamed `manifest.removed.json`. The marketplace entry (settings and `known_marketplaces.json`), `enabledPlugins: {}` and the plugin cache stay. `--remove` needs `--yes` with no TTY, or it exits 2. `doctor --no-input --agents claude-code` exits 1 before setup (`FAIL not set up`), 0 after setup (PASS, with a WARN that the hook has not been seen yet), and 1 after remove. One run with a fresh `CLAUDE_CONFIG_DIR` took over 120 s, so give it a deadline of at least 180 s. |
| 2026-11-14 | Phase 2 fact (f): trail uses only `HOME`. With `CLAUDE_CONFIG_DIR=$T/cfg`, `trail init` still wrote `$T/.claude/{settings.json,helpers/graft-hooks.cjs,skills/trail/SKILL.md}`, and `trail uninstall --yes` removed them from `$T/.claude`. (trail reads `CLAUDE_CONFIG_DIR` only for transcripts, skills discovery and its prompt hook.) context-mode honors `CLAUDE_CONFIG_DIR` (`claudeDirOf`, and it passes the variable to `claude`): it wrote `$T/cfg/{settings.json,.claude.json,plugins/*}`. Its own backups stay in `$HOME/.context-mode/`. So when `CLAUDE_CONFIG_DIR` differs from `$HOME/.claude`, trail's wiring lands in `$HOME/.claude`, which Claude Code is not reading. Setup should warn in that case. |
| 2026-11-14 | Phase 2 fact (g): the installed mise is 2025.9.6, and it has `mise unuse` (aliases `rm`, `remove`) with `-g/--global`, `--no-prune`, `-y` and `-q`. Tested on an isolated mise config: `mise unuse -g -y 'npm:@trailhq/trail-code'` removed the line from `~/.config/mise/config.toml` and exited 0, and it prunes the install unless `--no-prune` is given. Unusing a tool that is not listed also exits 0. The global config lists `"npm:context-mode"`, `"npm:@trailhq/trail-code"` and `"npm:@ersanyamarya/agentry-cli"` as `latest`, so the argv is `mise unuse -g -y npm:<pkg>`. The npm equivalent is `npm uninstall -g <pkg>` (npm 11.19.1). |
| 2026-11-14 | Phase 2 fact (h): agentry's backups dir is `<config>/backups/agentry/` (`paths.ts`: `configDir` is `CLAUDE_CONFIG_DIR` or `~/.claude`). `backups list` shows every direct subfolder except `removed/` and `updated/` that holds a `manifest.json` as id `fix/<folder>`. `removed/<time>/<label>` and `updated/<time>/<label>` with `meta.json` are the other kinds. `fix --undo` loads the same sets, sorts them by `createdAt`, and undoes the newest unless given a timestamp (`fix --undo <stamp>`, `--list`, `--dry-run`, `--force`). It does not check `tool` or `status`. Format (`fix.ts`): folder `<ISO with : and . replaced by ->[-n]`, mode 0700; `manifest.json` `{version:1, tool, createdAt, cwd, status:"done", files:[{path, realPath, kind:"file"\|"directory"\|"symlink"\|"missing", backup:"files/<abs path without leading slash>"\|null, linkTarget?, mtimeMs, mode, sha256, writtenSha256 (for result "written"), gitTracked, ruleIds, result}], commands:[]}`. Undo restores the backup, or deletes `realPath` for `missing`, and reports a conflict if the current sha differs from `writtenSha256`. Setup could write a compatible set (`tool: "agentry-setup <v>"`), but it would then become the newest set, which a bare `agentry fix --undo` picks, and it would show as a "fix set". Recommendation: setup writes its backups to a sibling folder, `<config>/backups/agentry-setup/<stamp>/`, in the same manifest shape so a later version can merge them. |
| 2026-11-14 | Phase 3 result: context-mode's gate is `context-mode doctor --json --no-input --agents claude-code` with claude-code status PASS (plain exit 0 is not enough: it exits 0 without `claude`), and setup fails early with a Claude Code hint when `claude` is missing. trail's wiring is skipped only when its user-level files exist and `~/.trail/install.json` claudeDist still exists (otherwise it re-runs `trail init`, because the copied statusline needs that dir); it runs in a scratch dir with `DO_NOT_TRACK=1`, uses `$HOME/.claude` only (trail ignores `CLAUDE_CONFIG_DIR`), and the scratch `.trail/statusline.cjs` is copied to `<config>/helpers/trail-statusline.cjs`. Test fakes must use the real node binary (`node -p process.execPath`), not the mise shim, which hangs under a fake HOME. Author's machine: `setup.sh --source . install --all --dry-run` reports every step already done or applied. |
| 2026-11-14 | Phase 4 result: manifest at `<config>/agentry/install-manifest.json`; setup records only what this run added (tools it installed, apply-global report, trail hook diff and statusline copy, context-mode wiring), so tools or config already present before setup are never removed. Setup backups go to `<config>/backups/agentry-setup/<stamp>-<label>/files/<abs path>` (sibling of agentry's `fix` backups, so a bare `agentry fix --undo` never undoes them). `apply-global --remove` also deletes a settings file left as `{}` and emptied parent folders; hooks match by (event, command); an MCP server is kept if `global/mcp.json` changed since install. trail uninstall uses `trail uninstall --yes` only when every machine-wide path is under `$HOME/.claude`, otherwise it prints the other-agent paths and leaves trail alone. `context-mode setup --remove` ignores `--agents` and undoes every agent. Setup now clones the repo for every command (manifest and apply-global live in it), except dry runs. |
