# Claude Code config sources

The spec for the `agentry` inventory readers: every file Claude Code
reads for MCP servers, skills, hooks, plugins, settings and env, with scope, precedence and the JSON shape a reader needs.

Checked on 2026-11-03 against Claude Code **2.1.316** (CLI) and the Claude desktop app on macOS.

## How facts are marked

| Mark | Meaning |
|---|---|
| **[docs]** | Stated in the Claude Code docs, fetched through Context7 (`/pjbrito/claude-code-docs`, a mirror of code.claude.com/docs). The page is named, e.g. [docs: mcp] = `docs/claude-code/mcp.md`. |
| **[probe]** | Observed by running `claude mcp get` / `claude mcp add` (2.1.316) against throwaway folders and a throwaway `CLAUDE_CONFIG_DIR`. Not in the docs; may change in a later version. |
| **[file]** | Seen in the real files on this machine (shape only). |
| **[unverified]** | Neither documented nor probed. Readers treat it as a best guess and say so in their output. |

`~` below means the home directory (`paths.home`, overridable with `AGENTRY_HOME`); `<config>` means `~/.claude`
(`paths.configDir`, overridable with `CLAUDE_CONFIG_DIR`). `<cwd>` is the folder the session starts in;
`<repo>` is the **main** repository root (see [Project identity](#project-identity)).

## Project identity

Three different folders matter, and readers must not mix them up:

| Folder | Used for | How to find it | Mark |
|---|---|---|---|
| `<cwd>` | Start of the `.mcp.json` walk; project settings | `process.cwd()` or the path argument | [probe] |
| `<repo>` | Key of the per-project entry in `.claude.json` (local-scope MCP, trust, approvals, `disabledMcpServers`) | parent of `git rev-parse --path-format=absolute --git-common-dir`; so in a **worktree** it is the main checkout, not the worktree | [probe] |
| worktree top | Not used as a key | `git rev-parse --show-toplevel` (what `paths.projectRoot()` returns) | [probe] |

- From a subfolder of a repo, `claude mcp add -s local` wrote the entry under the repo root, and an entry keyed by the
  subfolder was ignored. [probe] The real `~/.claude.json` does hold a subfolder key (`…/spectroplast-webshop/webapp`),
  probably from a session started there before it was a repo or by an older version; readers ignore such keys.
- From a worktree, `claude mcp add -s local` wrote under the main checkout, and a local server added in the main
  checkout was visible in the worktree. [probe]
- Outside a git repo the key is assumed to be `<cwd>`. [unverified]

## The global config file (`.claude.json`)

| Path | When | Mark |
|---|---|---|
| `~/.claude.json` | `CLAUDE_CONFIG_DIR` unset | [docs: mcp, settings "Global config settings"] |
| `$CLAUDE_CONFIG_DIR/.claude.json` | `CLAUDE_CONFIG_DIR` set (note: *inside* the config dir, not next to it) | [probe] |

It is **not** a settings file: keys from it are rejected in `settings.json`. [docs: settings] Shape the readers need
[docs: mcp, local scope] [file]:

```json
{
	"mcpServers": { "<name>": { "...server entry..." } },
	"projects": {
		"<repo absolute path>": {
			"mcpServers": { "<name>": { "...server entry..." } },
			"hasTrustDialogAccepted": true,
			"enabledMcpjsonServers": ["<name>"],
			"disabledMcpjsonServers": ["<name>"],
			"disabledMcpServers": ["<name>"]
		}
	}
}
```

- Top-level `mcpServers` = **user** scope; `projects[<repo>].mcpServers` = **local** scope. [docs: mcp-quickstart]
- `hasTrustDialogAccepted`: the folder is trusted. Untrusted folders don't apply project config. [docs: glossary
  "Project trust"] Trust for the home directory itself is per session only and never saved. [docs: glossary]
- `disabledMcpServers`: servers switched off with `/mcp` for this project; seen holding `graft` here. [file] Applies to
  servers of any scope, matched by name. [unverified for plugin servers: whether the name is `plugin:<p>:<s>`]
- `enabledMcpjsonServers` / `disabledMcpjsonServers` here: approval choices for `.mcp.json` servers. Honoured only
  when the project is trusted. [probe]
- Many other keys (`lastCost`, `allowedTools`, `mcpContextUris`, …) are irrelevant to the readers. [file]

## MCP servers

### Sources and precedence

When one name is defined in several places Claude Code connects once, using the **whole** entry from the
highest-precedence source; fields are never merged. [docs: mcp "Scope hierarchy and precedence"]

| # | Scope | File | Loads where | Mark |
|---|---|---|---|---|
| — | managed | `/Library/Application Support/ClaudeCode/managed-mcp.json` (macOS), `/etc/claude-code/managed-mcp.json` (Linux) | Everywhere; **exclusive**: when present, user/project/local/plugin servers and claude.ai connectors are not loaded | [docs: settings, managed-mcp] |
| 1 | local | `.claude.json` → `projects[<repo>].mcpServers` | This repo, all its worktrees | [docs: mcp] [probe] |
| 2 | project | `.mcp.json` in `<cwd>` **and every parent folder up to `/`** | Any session started at or below that folder | [docs: mcp] says "project root"; the walk is [probe] |
| 3 | user | `.claude.json` → `mcpServers` | Every project | [docs: mcp] |
| 4 | plugin | Each enabled plugin's `.mcp.json` and `plugin.json` `mcpServers` | Where the plugin is enabled | [docs: mcp, plugins-reference] |
| 5 | claude.ai | claude.ai connectors (e.g. `claude.ai Claude Docs`) | Logged-in sessions unless `ENABLE_CLAUDEAI_MCP_SERVERS=false` | [docs: mcp]; **not readable offline**, no file |

- Scopes 1–3 dedupe **by name**. Plugins and connectors dedupe **by endpoint**: one with the same URL or command as a
  server above is a duplicate. [docs: mcp]
- An **unapproved or rejected** `.mcp.json` entry does not take part: a user entry of the same name loads instead
  (`claude mcp list` showed the user command while pending, the project command once approved). [probe] Among
  `.mcp.json` files the nearest still wins even while pending, since approval is per name. [probe]
- `claude mcp list` itself warns when one name has different endpoints in several scopes. [probe] (Useful for the
  Phase 3 duplicate rule.)
- The `.mcp.json` walk [probe]:
  - files in every parent of `<cwd>` are read, past the git root and outside `~` (tested under `/private/tmp`);
  - a `.mcp.json` in a **child** folder of `<cwd>` is not read;
  - on a name clash between two `.mcp.json` files, the one **nearest** `<cwd>` wins;
  - so a stray `~/.mcp.json` applies to every session under `~` (this machine has one, with no servers [file]).
- Policy keys in managed settings (`allowedMcpServers`, `deniedMcpServers`, by `serverName`/`serverCommand`/`serverUrl`)
  filter all scopes. [docs: managed-mcp] Not read by the Phase 2 reader (none deployed here); a later phase may.

### Approval of `.mcp.json` servers

Project-scope servers need approval before they start; `claude mcp get` reports them as `Pending approval`. [docs: mcp]
[probe] A server counts as approved when:

| Approval | Where | Needs trust | Mark |
|---|---|---|---|
| `enableAllProjectMcpServers: true` | any settings file; probed in user `settings.json` | no (user settings) | [docs: settings] [probe] |
| `enabledMcpjsonServers: ["name"]` | `<top>/.claude/settings.local.json` (git root, probed outside a worktree), `<cwd>/.claude/settings.local.json`; also the `.claude.json` project entry, but that worked in one probe and not in a second | yes | [docs: settings] [probe]; `.claude.json` entry [unverified] |
| `disabledMcpjsonServers: ["name"]` | same places | — | rejected, [docs: settings] |

Readers report unapproved ones with state `pending-approval`, not as missing.

### Server entry shape

Same shape in `.claude.json`, `.mcp.json`, plugin configs and `managed-mcp.json`. [docs: mcp, agent-sdk/typescript]

```json
{ "type": "stdio", "command": "npx", "args": ["-y", "pkg"], "env": { "KEY": "<value>" } }
{ "type": "http", "url": "https://host/mcp", "headers": { "Authorization": "Bearer ${API_KEY}" } }
{ "type": "sse", "url": "https://host/sse", "headers": {} }
{ "type": "ws", "url": "wss://host/mcp", "headers": {}, "headersHelper": "<command>" }
```

- `type` may be omitted for stdio; `"streamable-http"` is an alias for `"http"`. [docs: agent-sdk/mcp]
- Other fields seen in docs: `cwd`, `timeout`, `alwaysLoad`, `headersHelper`, `oauth`. [docs: mcp]
- `.mcp.json` files wrap entries in `{ "mcpServers": { … } }`. [docs: mcp] A bare `{ "<name>": entry }` project
  `.mcp.json` is ignored by Claude Code. [probe] Plugin files are read either way. [unverified for plugins]
- `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`, `url`, `headers`. [docs: mcp] The docs say an unset
  `${VAR}` without default fails the config; `claude mcp get` showed the entry with the `${VAR}` text unexpanded
  instead. [probe] GUI-launched apps on macOS don't inherit shell-profile variables (the Context7 key case).
- `${CLAUDE_PLUGIN_ROOT}` is the plugin's install folder in plugin configs. [docs: plugins-reference]

### Secrets in server entries

Values that may hold secrets: every `env` value, every `headers` value, URL userinfo, query strings and path
segments, and `args` (`--token X`, `--api-key=X`, `KEY=X`, bare tokens). Readers mask these at read time and never put
a raw value in any return value, JSON output or error message. `${VAR}` names stay visible (they aren't secrets and
Phase 3 needs them); a `:-default` part is masked. Node's `JSON.parse` error message quotes the source text, so parse
errors are reported as "invalid JSON" plus the file path only.

## Plugins

### Files

| Path | Holds | Mark |
|---|---|---|
| `<config>/plugins/` | Plugins root. `CLAUDE_CODE_PLUGIN_CACHE_DIR` replaces this whole folder (despite its name) | [docs: env-vars] |
| `<plugins>/installed_plugins.json` | What is installed, at which scope, where | [file]; format not documented |
| `<plugins>/known_marketplaces.json` | Added marketplaces and their source | [docs: plugin-marketplaces] names it; shape [file] |
| `<plugins>/marketplaces/<marketplace>/` | Marketplace checkouts | [docs: plugin-marketplaces] |
| `<plugins>/cache/<marketplace>/<plugin>/<version>/` | Installed plugin copies; old versions orphaned, deleted after 7 days | [docs: plugins-reference, plugin-marketplaces] |
| `CLAUDE_CODE_PLUGIN_SEED_DIR` | Read-only extra plugin roots (`:`-separated), same layout | [docs: plugin-marketplaces] |
| `claude --plugin-dir <dir>` | Session-only plugin; not on disk anywhere a reader can see | [docs: plugins-reference] |

`installed_plugins.json` [file]:

```json
{
	"version": 2,
	"plugins": {
		"<plugin>@<marketplace>": [
			{
				"scope": "user",
				"installPath": "<plugins>/cache/<marketplace>/<plugin>/<version>",
				"version": "2.6.5",
				"installedAt": "<ISO date>",
				"lastUpdated": "<ISO date>",
				"gitCommitSha": "<sha>"
			},
			{ "scope": "local", "projectPath": "<absolute project path>", "installPath": "...", "version": "..." }
		]
	},
	"enabledPlugins": { "<plugin>@<marketplace>": true }
}
```

- One key can hold several installs at different scopes (here `diagram-design` is installed `user` **and** `local` for
  another project). [file]
- `local` and `project` installs carry `projectPath` (the folder `claude plugin install` ran in). [file] [probe]
  Claude Code 2.1.316 does not match it against the start folder at all, see "Probe results".
- The top-level `enabledPlugins` here is undocumented and disagrees with `settings.json` (only one entry). [file]
  Readers ignore it; settings decide. [unverified]

`known_marketplaces.json` [file]:

```json
{ "<marketplace>": { "source": { "source": "github", "repo": "owner/repo" }, "installLocation": "<plugins>/marketplaces/<marketplace>", "lastUpdated": "<ISO date>" } }
```

`source.source` is `github` (`repo`) or `git` (`url`). [file] [docs: settings `extraKnownMarketplaces`]

### Enabled or not

`enabledPlugins` in settings: `{ "<plugin>@<marketplace>": true | false }`. [docs: settings]

- Scopes: user `<config>/settings.json`, project `.claude/settings.json`, local `.claude/settings.local.json`, managed.
  Higher scope wins (local > project > user); managed can force-enable or block. [docs: settings]
- A plugin with no entry anywhere is **off**, whatever its manifest `defaultEnabled` says. [probe, 2.1.316, see "Probe
  results"] (The docs describe `defaultEnabled`; `claude plugin install` writes `false` for a manifest that sets it
  to `false` and `true` otherwise, so a missing entry only happens after hand edits.) Readers treat no entry as disabled.
- `claude plugin install --scope user|project|local` writes the `enabledPlugins` entry into the matching settings
  file. [docs: plugins-reference]
- A plugin loads when it is installed for this project (a `user` install, or a `local`/`project` install whose
  `projectPath` matches) **and** enabled. [docs] In 2.1.316 the `projectPath` part is not checked (probe); in practice
  a project-scope plugin is enabled in that project's own settings, so it still only loads there. The reader keeps
  the `projectPath` match, which differs only when such a plugin is enabled from user settings.

### Plugin layout and what it provides

[docs: plugins, plugins-reference]

```text
<installPath>/
├── .claude-plugin/plugin.json   # manifest; optional (components auto-discovered)
├── skills/<name>/SKILL.md       # skills, named <plugin>:<name>
├── commands/*.md                # legacy flat skills
├── agents/*.md
├── hooks/hooks.json             # { "hooks": { "<Event>": [ … ] } }
├── .mcp.json                    # { "mcpServers": { … } }
├── .lsp.json, monitors/, bin/, settings.json, output-styles/
```

Manifest fields that move components [docs: plugins-reference]:

| Field | Type | Effect |
|---|---|---|
| `skills` | string \| array | **Adds** to `skills/` |
| `commands`, `agents`, `outputStyles` | string \| array | **Replace** the default folder |
| `hooks` | string \| array \| object | Paths to hook files or inline config (own merge rules) |
| `mcpServers` | string \| array \| object | Paths to MCP config files or inline `{ name: entry }` (own merge rules) |

Paths are relative to the plugin root and start with `./`. [docs: plugin-structure skill] Real example: `context-mode`
has no `.mcp.json`, only an inline `plugin.json` `mcpServers` with one stdio server. [file] Readers take servers from
both `.mcp.json` and `mcpServers` (each path in a string/array, or the inline object).

Plugin MCP servers are shown by the CLI as `plugin:<plugin>:<server>` (e.g. `plugin:context-mode:context-mode`).
[probe]

## Claude desktop app (macOS)

Folder: `~/Library/Application Support/Claude/`. [file] The desktop app's Code tab runs Claude Code sessions (this
spec was written in one).

| Path | Holds | Loaded by | Mark |
|---|---|---|---|
| `claude_desktop_config.json` | `{ "mcpServers": { … }, "preferences": { … } }`, same entry shape | Desktop chat. Imported into the CLI only by `claude mcp add-from-claude-desktop` | [docs: mcp] [file]; whether the **Code tab** loads these: **[unverified]** (empty here) |
| `Claude Extensions/<id>/manifest.json` | Installed desktop extension (`.mcpb`): `name`, `display_name`, `version`, `server: { type, entry_point, mcp_config: { command, args, env? } }`, optional `user_config` | Desktop chat **and Code-tab sessions** | [file]; Code tab [probe: this session lists `mcp__DaVinci_Resolve_Studio__*` tools]; the CLI does not (`claude mcp get` lists no extension) [probe] |
| `Claude Extensions Settings/<id>.json` | `{ "isEnabled": true, … }`; may hold user-config values (treat as secret) | — | [file] |
| `extensions-installations.json` | `{ "extensions": { "<id>": { id, version, hash, installedAt, manifest, signatureInfo: { status }, source } } }` | — | [file] |

- `mcp_config` paths use `${__dirname}` = the extension folder. [file]
- The Code tab names an extension's server after `display_name` with spaces as `_` (`DaVinci_Resolve_Studio`). [probe]
- The Code tab also injects servers that exist in no file: app built-ins (`ccd_*`, browser, simulator, computer-use,
  scheduled tasks) and claude.ai connectors. **Not readable offline**; readers say so instead of guessing.

## Skills

[docs: skills, features-overview]

| Scope | Path | Notes |
|---|---|---|
| Managed | managed settings location | enterprise |
| Personal | `<config>/skills/<name>/SKILL.md` | `<config>/skills/synced/` is managed by claude.ai (plan) |
| Project | `.claude/skills/<name>/SKILL.md` | [docs] doesn't say which folder; [unverified] whether `<cwd>`, `<repo>` or nested `.claude/skills` in subfolders count |
| Plugin | `<installPath>/skills/<name>/SKILL.md` + manifest `skills` paths | named `<plugin>:<name>` |
| Legacy | `.claude/commands/*.md`, `<config>/commands/*.md` | a skill beats a command of the same name |

Same name at several levels: managed > personal > project; plugin skills are namespaced and never clash. [docs:
skills] Skills may be symlinks (the shelf links them in); the reader reports file / symlink / broken. Each skill costs
its frontmatter `description` in every session (`lib/tokens.mjs`).

## Hooks

[docs: hooks, hooks-guide]

| Source | Path |
|---|---|
| User | `<config>/settings.json` → `hooks` |
| Project | `.claude/settings.json` → `hooks` |
| Local | `.claude/settings.local.json` → `hooks` |
| Managed | managed settings → `hooks` |
| Plugin | `<installPath>/hooks/hooks.json`, or manifest `hooks` |
| Skill / agent | `hooks` in the component's frontmatter, only while it is active |

- Hooks **merge**: every matching hook from every source fires. [docs: features-overview]
- `disableAllHooks: true` turns them off (managed hooks keep running unless it is set there); `allowManagedHooksOnly`
  blocks user, project and plugin hooks except plugins force-enabled by managed settings. [docs: hooks]
- Project hooks run only in trusted folders. [docs: glossary]
- Shape (settings and `hooks.json` alike) [docs: plugins-reference]:

```json
{ "hooks": { "<Event>": [ { "matcher": "Write|Edit", "hooks": [ { "type": "command", "command": "...", "timeout": 10 } ] } ] } }
```

  `type` is `command`, `prompt` (and others); `matcher` may be absent or `*`. [docs] Some plugins' `hooks.json` omit the
  outer `"hooks"` key (the plugin-dev skill example). [docs: hook-development skill] Readers accept both.

## Settings and env

[docs: settings, iam]

| Precedence | Source | Path (macOS) |
|---|---|---|
| 1 | Managed | server-managed > MDM (`com.anthropic.claudecode` domain) > `/Library/Application Support/ClaudeCode/managed-settings.json` + `managed-settings.d/*.json`; see "Managed sources" |
| 2 | CLI flags | `--settings <file-or-json>` and others; session only |
| 3 | Local project | `.claude/settings.local.json` |
| 4 | Shared project | `.claude/settings.json` |
| 5 | User | `<config>/settings.json` |

- Scalars: higher wins. Arrays (permission rules, …) merge across layers. [docs: glossary "Settings layers"]
- The docs say project settings load only from the folder Claude starts in. [docs: large-codebases] Yet for
  `enabledMcpjsonServers`, `<repo>/.claude/settings.local.json` was honoured from a subfolder too. [probe] Which
  folders count for other settings (hooks, `enabledPlugins`): **[unverified]**, the Hooks and Plugins readers must
  probe it.
- `env` in any settings file: `{ "NAME": "value" }`, set for the session and its tools. [docs: settings] Values may
  be secrets: mask them. This machine sets `TRAIL_INVOKED_AS` there. [file]
- MCP-related settings keys: `enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`
  (settings); `allowedMcpServers`, `deniedMcpServers`, `allowAllClaudeAiMcps` (managed only). [docs: settings, managed-mcp]
- Env vars that move files: `CLAUDE_CONFIG_DIR` (everything under `~/.claude`, plus `.claude.json` moves inside it
  [probe]), `CLAUDE_CODE_PLUGIN_CACHE_DIR`, `CLAUDE_CODE_PLUGIN_SEED_DIR`. [docs: env-vars]

## Reader contract (MCP, implemented in `lib/inventory/mcp.mjs`)

`createMcpReader(paths, { platform } = {})` → `{ read({ cwd }) }` → `{ servers, errors }`. Masking helpers live in
`lib/mask.mjs` for the other readers (hook commands, settings `env`). Settings are read from `<top>` (the working-tree
root, `paths.projectRoot`) and `<cwd>`; the `.claude.json` entry from `<repo>` (`paths.repoKey`). `loadsIn`: `cli` is
the terminal `claude`, `desktop` the desktop app including its Code tab.

Each server:

| Field | Meaning |
|---|---|
| `name` | As Claude Code shows it (`plugin:<plugin>:<server>` for plugins, the extension's `display_name` for desktop extensions) |
| `transport` | `stdio`, `http`, `sse`, `ws` (`streamable-http` → `http`; no type + `command` → `stdio`) |
| `command`, `args` | stdio only; masked |
| `url` | remote only; masked |
| `env`, `headers` | `{ key: masked value }` |
| `scope` | `local`, `project`, `user`, `plugin`, `desktop-config`, `desktop-extension` |
| `source` | Absolute path of the file the entry came from |
| `plugin` | `<plugin>@<marketplace>` for plugin servers |
| `loadsIn` | `["cli", "desktop"]` for Claude Code scopes; `["desktop"]` for desktop sources |
| `state` | `active`, `shadowed`, `pending-approval`, `rejected`, `disabled` |
| `shadowedBy` | `{ scope, source }` of the entry that wins, when `shadowed` |

`errors`: `[{ source, message }]` for unreadable or invalid files, never containing file content.

Not read by the MCP reader: managed MCP and policy (none deployed here), claude.ai connectors, app built-in servers
(no file), `--mcp-config`/`--plugin-dir` (session flags).

## Managed sources (MDM, server-managed)

[docs: managed-settings, admin-setup, claude-apps-gateway-config; checked with Context7]

- Order, highest first: remote (server-managed from claude.ai, or a Claude apps gateway) > MDM/OS policy (macOS plist,
  Windows HKLM) > managed files (`managed-settings.d/*.json` merged with `managed-settings.json`) > Windows HKCU.
  A plist or registry policy **replaces** the file instead of merging with it (apart from a few keys read from every
  source).
- macOS MDM: the `com.anthropic.claudecode` managed preferences domain (a configuration profile). It uses the same
  top-level keys as `managed-settings.json`; nested settings are dictionaries, lists are arrays. So plugins forced on or
  off are the `enabledPlugins` dictionary of that domain, key `name@marketplace`, value boolean.
- `agentry plugin enable|disable` reads `defaults read com.anthropic.claudecode enabledPlugins` (`readDefaults` is
  injectable) and refuses, exit 1 and nothing written, when the plugin id is a key there. No domain, no key or not macOS
  means no policy. A profile installed on this machine could not be tested here (the domain does not exist on this Mac);
  the reader is covered by a fixture test with a fake `defaults`. Only the `enabledPlugins` key is read.
- Server-managed settings are fetched from Anthropic's servers and kept in a local cache Claude Code manages; there is
  no documented file to read, so the tool cannot see them offline. Documented as unreadable; the toggle may then edit a
  plugin the server pins, and Claude Code still applies the server value.

## Probe results

Claude Code 2.1.316, throwaway `CLAUDE_CONFIG_DIR` and `HOME` under a temp folder, a local directory marketplace with
four test plugins, a git repo with a subfolder and a `git worktree`. Read-only commands only (`plugin list --json`,
`mcp list`, `plugin details`); nothing ran against the real home. `mcp list` is the load check: plugin servers show
up there only for plugins that load.

| Question | Result |
|---|---|
| `projectPath` for subfolders and worktrees | **Not matched.** A `project` install for `<repo>` loaded in `<repo>`, `<repo>/sub`, a worktree and an unrelated folder when `enabledPlugins` named it in **user** settings. With the entry only in `<repo>/.claude/settings.json` it loaded in `<repo>` and not in the subfolder or worktree: that is the settings file (read from the start folder only), not `projectPath`. `plugin list` shows the same `enabled` everywhere. |
| `defaultEnabled` default | **No entry means disabled.** With `enabledPlugins` emptied, plugins with no `defaultEnabled`, `defaultEnabled: true` and `defaultEnabled: false` all listed `enabled: false`. `plugin install` writes the entry itself (`false` when the manifest says `defaultEnabled: false`, with "disabled by default" in its output, else `true`). |
| Hooks of a disabled plugin | **Could not be probed.** Needs a running session with a login; the throwaway home has none. `plugin details` counts the hooks of a plugin regardless of its state. A disabled plugin's MCP server did not load (`mcp list`), and the hooks reader keeps flagging a disabled plugin's hooks as inactive, which is consistent with that but unproven. |
| Bare-map plugin `.mcp.json` (`{ "name": {command...} }`, no `mcpServers` key) | **Loaded.** `claude mcp list` showed `plugin:p1:bare`. The MCP reader already accepts bare maps in plugin files. |
