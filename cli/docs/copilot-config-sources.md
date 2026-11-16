# GitHub Copilot config sources

The spec for extending `agentry` setup and readers to GitHub Copilot CLI and VS Code: which files Copilot reads for
instructions, skills, agents, hooks, MCP servers and settings, with scope, precedence and the shape a writer needs.
The Claude files stay the source of truth; this file says where Copilot finds (or does not find) them.

Checked on 2026-11-14 against Copilot CLI **1.0.112** (npm install via mise, bundle unpacked at
`~/Library/Caches/copilot/pkg/darwin-arm64/1.0.112/`). Where docs and the binary differ, the binary wins.

## How facts are marked

| Mark | Meaning |
|---|---|
| **[earlier]** | Verified earlier on Copilot CLI 1.0.112 (before this file was written). |
| **[help: topic]** | Printed by `copilot help <topic>` or `copilot <cmd> --help` on 1.0.112. |
| **[changelog]** | `changelog.json` shipped in the 1.0.112 bundle (release notes, all versions up to it). |
| **[bundle]** | Read in the shipped `cli-main.js`. Much of the config logic is native (`C.*` calls), so this is partial. |
| **[probe]** | Experiment with `HOME` and `COPILOT_HOME` pointed at a temp folder, running the platform binary directly (the mise shim hangs under a fake `HOME`). Commands: `copilot mcp list/get`, `copilot skill list`. |
| **[docs: url]** | GitHub or VS Code docs, fetched through Context7. |
| **[file]** | Seen in the real files on this machine (shape only, no values). |
| **unconfirmed** | None of the above settles it. A safe default is given. |

`<ch>` below means the Copilot home: `$COPILOT_HOME`, default `~/.copilot`. `<repo>` is the git root.

## Copilot home and override (question c)

- `COPILOT_HOME` moves config and state; default `$HOME/.copilot`. `--config-dir` does the same per run.
  [help: environment, config] XDG variables do not move it. [help: environment] Cached data (downloaded CLI
  versions) lives in `COPILOT_CACHE_HOME`, default `~/Library/Caches/copilot` on macOS. [help: environment]
- Under a temp `COPILOT_HOME`, every user file below was read from there. [probe]
- A non-default `COPILOT_HOME` stops loading `~/.agents/skills`. [changelog] [probe: a skill only in
  `$HOME/.agents/skills` was listed with `COPILOT_HOME=$HOME/.copilot` and missing with `COPILOT_HOME` elsewhere]

## What Copilot reads from Claude files

| Claude file | Read by Copilot CLI | Mark |
|---|---|---|
| `<repo>/CLAUDE.md`, `.claude/CLAUDE.md` | yes, as custom instructions (also `AGENTS.md`, `GEMINI.md`) | [earlier] [help: config] |
| `<repo>/.claude/rules/**/*.md` | yes; honours `paths:` frontmatter | [earlier] [help: config] |
| `<repo>/.claude/skills`, `.claude/agents`, `.claude/commands` | yes | [earlier] [help: config] |
| `<repo>/.mcp.json` (`mcpServers`) | yes, once the folder is trusted | [earlier] [help: mcp] [probe] |
| `<repo>/.claude/settings.json`, `settings.local.json` | hooks, `disableAllHooks`, `enabledPlugins`, `extraKnownMarketplaces`, `companyAnnouncements` only | [earlier] [help: config] |
| `~/.claude/skills`, `~/.claude/agents`, `~/.claude/rules`, `~/.claude/CLAUDE.md`, `~/.claude/settings.json` | **no** | [earlier] [help: config] |

So everything agentry installs at user level for Claude needs a Copilot copy or link; repo-level Claude files mostly
work as they are.

## User and repo locations

| What | User | Repo | Mark |
|---|---|---|---|
| Instructions | `<ch>/copilot-instructions.md`, `<ch>/instructions/*.instructions.md` | `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`, plus the Claude files above | [earlier] [help: config] |
| Skills | `<ch>/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md` | `.github/skills`, `.agents/skills`, `.claude/skills` | [earlier] [help: skill] |
| Agents | `<ch>/agents` | `.github/agents`, `.claude/agents` | [earlier] |
| Hooks | `<ch>/hooks/*.json`, `<ch>/settings.json` → `hooks` | `.github/hooks/*.json`, `.github/copilot/settings.json` → `hooks`, `.claude/settings*.json` | [earlier] [help: config] |
| MCP | `<ch>/mcp-config.json` | `.mcp.json` or `.github/mcp.json`, cwd up to `<repo>` | [earlier] [help: mcp] |
| Settings | `<ch>/settings.json` (strict JSON) | `.github/copilot/settings.json`, `settings.local.json` | [earlier] [help: config] [file] |
| CLI state | `<ch>/config.json` (JSONC, CLI-managed) | — | [earlier] [help: config] [file] |

- Extra instruction dirs: `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`; extra skill dirs: `COPILOT_SKILLS_DIRS` and the
  `skillDirectories` setting. [help: config, environment]
- Copilot keeps writer locks next to its files (`settings.json.lock`, `.mcp-writer.lock`,
  `mcp-config.json.copilot-mcp.lock`). [earlier] [file]

## Folder trust (question a)

- `trustedFolders` is read from `<ch>/config.json`, not `settings.json`. [help: config "trustedFolders"] Probe: a
  parent folder in `settings.json` → `trustedFolders` left the repo untrusted; the same list in `config.json`
  trusted it. [probe]
- A parent folder trusts its children ("Subfolders of a trusted folder are trusted"). [help: permissions] Probe: the
  repo `parent/child` loaded its `.mcp.json` with only `parent` listed. [probe]
- `config.json` with the real two-line `//` comment header parsed fine. [probe] On disk it starts with
  `// User settings belong in settings.json.` / `// This file is managed automatically.`; `JSON.parse` fails on
  it; today it has no `trustedFolders` key. [earlier] [file]
- Untrusted: workspace MCP servers and repo hooks are skipped (`copilot mcp list` prints a warning naming
  `config.json`). [probe] [help: permissions] `COPILOT_ALLOW_ALL=true` also trusts, but approves all tools; setup
  never sets it. [earlier] [help: environment] `--trust-folder` trusts for one `-p` run. [help]
- Project **skills** load without trust (`copilot skill list` showed a `.github/skills` skill with an empty
  `config.json`). [probe]
- Rewrite timing: the CLI writes `config.json` itself (adds a folder at the trust prompt, records logins, plugins;
  `firstLaunchAt` at startup). [help: config] [changelog] Read-only commands (`mcp list`, `skill list`) left it
  byte-identical. [probe] Whether a running session rewrites it from memory (dropping an outside edit) is
  **unconfirmed**. Safe default: edit it only while no `copilot` process runs, re-read immediately before writing,
  keep the comment header and every other key, write atomically.

## MCP servers (questions b, f)

### Entry shape

Every file holds a top-level `mcpServers` object. [help: mcp] Shapes:

```json
{ "mcpServers": {
  "local-one":  { "type": "local", "command": "npx", "args": ["-y", "pkg"], "env": { "KEY": "${KEY}" }, "tools": ["*"] },
  "remote-one": { "type": "http", "url": "https://host/mcp", "headers": { "Authorization": "Bearer ${KEY}" }, "tools": ["*"] }
} }
```

- Local: `type` `"local"` or `"stdio"`, with `command`, `args`, `env`, `cwd`. Remote: `type` `"http"` (default) or
  `"sse"`, with `url`, `headers`. `tools` defaults to `["*"]`. [help: mcp] `copilot mcp get` showed an http entry
  as `Type: http`, `URL`, masked `Headers`, `Tools: * (all)`. [probe]
- `.vscode/mcp.json` is not read; VS Code's `servers` key loads nothing. [help: mcp]
- The real `~/.copilot/mcp-config.json` has one local `context7` entry run with `bunx`; agentry's
  `global/mcp.json` uses `type: http` with a `${CONTEXT7_API_KEY}` header. [earlier] [file]

### `${VAR}` expansion

- `env` values are literal; `${NAME}` references a host variable. [changelog: "Interactive CLI sessions pass local
  MCP server environment values literally; use ${NAME} …"] [docs: github.com/github/copilot-cli changelog]
- `${COPILOT_SESSION_CWD}` expands in local MCP server configs. [help: environment] [changelog]
- `args`, `env` and `headers` all expand `${VAR}` at launch. [probe] How checked: real `HOME` (for sign-in), temp
  `COPILOT_HOME` holding a local server (a script logging its argv and env) and an http server pointed at a
  127.0.0.1 listener logging `Authorization`; `copilot -p … --trust-folder` launched both. The script got
  `args: ["${FAKE_ARG}"]` → `argvalue` and `env.E: "${FAKE_KEY}"` → the value; the listener got
  `Authorization: Bearer <value>`.
- `copilot mcp get` shows the unexpanded text (`${FAKE_ARG}`) and masks headers and env; it is display only. [probe]
- The GitHub docs' `${VAR}` rules with `COPILOT_MCP_` names are for the cloud coding agent, not the CLI. [docs:
  docs.github.com/en/copilot, MCP for coding agent]
- `command` and `url`: not probed, so no expansion is assumed. `copilot-mcp.ts` refuses a secret in either field
  instead of writing it. **unconfirmed**
- So setup can install context7 as `type: http` with a `CONTEXT7_API_KEY: "${CONTEXT7_API_KEY}"` header, as
  `global/mcp.json` does, without a literal key. Not probed: an unset variable (Claude Code leaves the text as is);
  Copilot needs the variable in its own environment, and GUI-launched VS Code does not read shell rc files.

### Precedence and disabling

- Same name in several sources: the **later** one wins, in order user `mcp-config.json`, workspace files, plugins,
  `--additional-mcp-config`. [help: mcp] Probe: `dup` in both user and `.mcp.json` resolved to the workspace
  command (`Source: Workspace`). [probe] Docs agree ("MCP servers use last-wins precedence"). [docs:
  docs.github.com/en/copilot, Copilot CLI plugins]
- Among workspace files, the one nearest the cwd wins; `.github/mcp.json` is ignored where the same folder has
  `.mcp.json`. [help: mcp]
- `disabledMcpServers` (in `settings.json`) matches by **name** and applies to any source: a user setting turned
  off a workspace server (`dup (local, disabled)`). [probe] [help: mcp] A server disabled by repo settings cannot be
  enabled with `/mcp enable`. [help: mcp] `--disable-mcp-server` / `--enable-mcp-server` override for one run.

## Skills and agents precedence (question f)

- Skills, probed with one name in four places [probe]: `.github/skills` > `.claude/skills` > `<ch>/skills` >
  `~/.agents/skills`. Project beats personal. Docs: "Agents and skills use first-found-wins precedence". [docs:
  docs.github.com/en/copilot, Copilot CLI plugins]
- `disabledSkills` (user or trusted repo `settings.json`) turns a skill off by name; a name in either list stays off.
  [help: config]
- Agents: docs say a user-level (`~/.copilot/agents`) agent overrides a repository-level one. [docs:
  docs.github.com/en/copilot/reference/custom-agents-configuration] No CLI command lists agents, so on 1.0.112 this
  is **unconfirmed**. Safe default: never install a user agent whose name matches a repo agent.

## Instructions frontmatter (question e)

- `*.instructions.md` take YAML frontmatter `applyTo` (string or array; unquoted globs like `**/*.ts` work) and
  `excludeAgent`; parse errors keep the `applyTo` or `paths` list. [changelog] `description` is used by existing
  files here (`applyTo: "**/*.sh"` + `description: "..."`). [earlier] [file]
- Files with a specific `applyTo` are listed in a table, not inlined, until they apply. [changelog]
- Mapping from `.claude/rules/*.md`: `paths: [a, b]` → `applyTo: ["a", "b"]` (or the comma string `"a,b"`);
  `description` copied when present. A rule with no frontmatter (`rules/context7.md`, `rules/trail.md` [earlier])
  → `applyTo: "**"`. Whether a user-level file with no `applyTo` is always applied is **unconfirmed**, so setup
  writes `applyTo: "**"` explicitly.

## Hooks

- Hook files take PascalCase event names; the stdin payload is snake_case and includes `cwd`. [earlier] Claude-named
  events and matchers (`PreToolUse`, `Bash`, `Edit`, …) map onto Copilot's. [help: config]
- The same hook at user and repo level runs **twice**. [earlier] `SessionStart` `additionalContext` is not injected.
  [earlier] A command `PreToolUse` hook that errors blocks the tool. [earlier]
- Repo hooks run only in trusted folders (see above). `disableAllHooks` and `disabledHooks` (content-hash keys)
  switch them off. [earlier] [help: config]
- `global/helpers/trail-autobuild.sh` handles both: Claude via `$CLAUDE_PROJECT_DIR`, Copilot via `cwd` in the stdin
  JSON. [earlier]

## Attribution (questions d, g)

- `includeCoAuthoredBy` (default `true`) in `<ch>/settings.json` controls the `Co-authored-by` trailer. [earlier]
  [help: config] The Claude equivalent is the `attribution` key `global/settings.fragment.json` installs. [earlier]
- A trusted repo's `.github/copilot/settings.json` **does** override it: `copilot -p` merges repo settings with
  `userSettingsMergeRepoValue` before reading `includeCoAuthoredBy`, and the interactive path merges repo settings
  when the repo is trusted. [bundle] [changelog: "copilot -p honors trusted repositories' includeCoAuthoredBy
  setting"] Not run end to end (needs a signed-in session).
- VS Code: `git.addAICoAuthor` with `off` (default), `chatAndAgent`, `all` adds a `Co-authored-by:` trailer to
  commits with AI changes. [docs: code.visualstudio.com/docs/sourcecontrol/staging-commits] It is a VS Code user or
  workspace setting, separate from the CLI's.

## VS Code

- Chat harnesses: Copilot, Local (deprecated), Claude. Local honours `chat.agentSkillsLocations`,
  `chat.useClaudeHooks`, `chat.useClaudeMdFile`, `chat.instructionsFilesLocations`. [earlier]

## Setup assumptions

1. Resolve the Copilot home as `$COPILOT_HOME`, else `~/.copilot`; install personal skills into `<ch>/skills`,
   since `~/.agents/skills` is skipped under a non-default `COPILOT_HOME`.
2. Write `trustedFolders` only to `<ch>/config.json`, as an append to the existing list; never to `settings.json`;
   never set `COPILOT_ALLOW_ALL`.
3. Edit `config.json` as JSONC: keep the comment header and all keys, re-read before writing, write atomically, and
   refuse (or warn) while a `copilot` process runs.
4. Trusting a parent folder trusts every repo under it; prefer trusting the exact repo root.
5. Never write a literal secret into `mcp-config.json`; write keys as `${VAR}` (expands in `headers`, `args` and
   `env`), so context7 can be installed as the same http entry as `global/mcp.json`, plus `"tools": ["*"]`.
6. Workspace MCP entries override user ones of the same name; don't duplicate a repo's server name in
   `mcp-config.json`, and use `disabledMcpServers` (by name) to switch one off.
7. Project skills beat personal ones; agent precedence is unconfirmed, so avoid name clashes between user and repo
   agents and skills.
8. Convert each user rule to `<ch>/instructions/<name>.instructions.md` with `applyTo` from `paths:` (or `"**"`
   when it has none) and `description` when present.
9. Install a hook at user level or repo level, never both (it would run twice); don't depend on `SessionStart`
   `additionalContext`; make `PreToolUse` command hooks exit 0 on their own errors.
10. Set attribution in `<ch>/settings.json` → `includeCoAuthoredBy`, mirroring the Claude `attribution` choice;
    a trusted repo's `.github/copilot/settings.json` can override it; for VS Code, `git.addAICoAuthor`.
11. Keep `<ch>/settings.json` strict JSON and merge keys; never replace the file.

## Reader contract

`createCopilotReader(paths).read({ cwd })` (`packages/core/src/inventory/copilot.ts`) returns a `CopilotInventory`
(`types.ts`). It only reads; `agentry status` shows it as the `copilot` block (null when `<ch>` does not exist; the
reader's `errors` join the top-level list).

| Field | Meaning |
|---|---|
| `present` | `<ch>` exists. Repo files are read either way. |
| `signedIn` | `true` when `<ch>/config.json` has a non-empty `loggedInUsers` list or a `lastLoggedInUser` value (read as JSONC; only the key names were checked, never the values). [file] Other keys seen there: `firstLaunchAt`, `host`, `installedPlugins`, `kind`, `login`, `reasoningSummariesCleanupDone`, `trustedFolders`. [file] The sign-in check is agentry's rule, not a Copilot API: unconfirmed whether a token that has expired still counts. |
| `skills[]` | `name`, `scope` (`user`: `<ch>/skills`, `~/.agents/skills`; `repo`: `.github/skills`, `.claude/skills`), `source` (the skill folder), `state` (`ok`, or `broken` for a dead link or a folder without `SKILL.md`), `target` (link target), `shadowed` (a same-named skill from an earlier folder wins; order is `.github` > `.claude` > `<ch>` > `~/.agents`). `~/.agents/skills` is skipped when `COPILOT_HOME` is not `~/.copilot`. |
| `instructions[]` | `file`, `scope`, `applyTo`: the comma-joined `applyTo` of `<ch>/instructions` and `.github/instructions` files, or `paths` of `.claude/rules/*.md`; `null` when none. |
| `hooks[]` | `event`, `scope`, `source` file, `id` (`hookId`, same as Claude hooks), `command` (masked). From `<ch>/hooks/*.json`, `<ch>/settings.json`, `.github/hooks/*.json`, `.github/copilot/settings.json`, `.claude/settings.json`. |
| `mcp[]` | One entry per name: `name`, `scope` (`user` or `workspace`), `source`, `transport`, masked `command`/`args`/`url`/`env`/`headers`, `disabled` (name in `disabledMcpServers` of user or repo settings), `overrides` (the user file a workspace entry replaced). Workspace file: `.mcp.json`, else `.github/mcp.json`. |
| `agents[]` | `name` (frontmatter `name`, else the file name), `scope`, `source`, from `<ch>/agents`, `.github/agents`, `.claude/agents`. |
| `includeCoAuthoredBy` | Effective value: `true`, then `<ch>/settings.json`, then, only when `trusted`, `.github/copilot/settings.json` and `settings.local.json`. |
| `trusted` | The repo root or a parent is in `trustedFolders` of `<ch>/config.json` (read as JSONC); a missing key is `false`. |
| `errors[]` | `source` and a fixed message (`invalid JSON`, `unreadable (CODE)`); never file text. |

Masking: MCP `url` keeps scheme and host and shows `<masked>` for userinfo, query values and token-shaped path
segments; `env` and `headers` values and secret-looking `args` are masked (`${VAR}` references stay readable); hook
commands go through `maskShell`. Raw secrets never reach the inventory or `status --json`.
