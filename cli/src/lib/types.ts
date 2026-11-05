// Shapes shared by the CLI. Two kinds live here:
//  - files written by Claude Code (settings.json, .claude.json, .mcp.json, installed_plugins.json, hook groups): every field
//    is optional and loosely typed, because Claude tolerates a missing or wrong-typed field and so do the readers; narrow
//    with `isObject`/`list` (inventory/common) before use. Facts: docs/claude-config-sources.md.
//  - what the inventory readers and doctor produce (skills, MCP servers, hooks, plugins, findings), which are strict.

export type JsonObject = Record<string, unknown>;

/** An unreadable or invalid file, reported by a reader. Never holds file content. */
export interface ReadError {
	source: string;
	message: string;
}

// ---- files written by Claude Code ----

/** One hook entry inside a hook group. */
export interface HookEntry {
	type?: string;
	command?: string;
	[key: string]: unknown;
}

/** `{ matcher?, hooks: [...] }`; the matcher is a tool name pattern and absent means all. */
export interface HookGroup {
	matcher?: string;
	hooks?: unknown;
	[key: string]: unknown;
}

/** `{ Event: [group, ...] }`, the value of `hooks` in settings.json (or a plugin's hooks.json). */
export type HooksConfig = Record<string, unknown>;

/** settings.json / settings.local.json. */
export interface SettingsJson {
	permissions?: { allow?: unknown; deny?: unknown; ask?: unknown; [key: string]: unknown };
	enabledPlugins?: Record<string, unknown>;
	hooks?: HooksConfig;
	disableAllHooks?: boolean;
	env?: Record<string, unknown>;
	enableAllProjectMcpServers?: boolean;
	enabledMcpjsonServers?: unknown;
	disabledMcpjsonServers?: unknown;
	statusLine?: { type?: string; command?: string };
	[key: string]: unknown;
}

/** One MCP server entry as written in .mcp.json, .claude.json or a plugin. */
export interface McpServerRaw {
	type?: string;
	command?: unknown;
	args?: unknown;
	url?: unknown;
	env?: unknown;
	headers?: unknown;
	[key: string]: unknown;
}

/** .mcp.json: `{ mcpServers: { name: entry } }`. */
export interface McpJson {
	mcpServers?: Record<string, unknown>;
}

/** A project's entry in .claude.json, keyed by the main checkout root. */
export interface ClaudeProject {
	hasTrustDialogAccepted?: boolean;
	mcpServers?: Record<string, unknown>;
	disabledMcpServers?: unknown;
	enabledMcpjsonServers?: unknown;
	disabledMcpjsonServers?: unknown;
	enableAllProjectMcpServers?: boolean;
	[key: string]: unknown;
}

/** ~/.claude.json (or <CLAUDE_CONFIG_DIR>/.claude.json). */
export interface ClaudeJson {
	projects?: Record<string, unknown>;
	mcpServers?: Record<string, unknown>;
	[key: string]: unknown;
}

/** One install of a plugin in installed_plugins.json. `scope` is user, project or local. */
export interface InstalledPluginEntry {
	scope?: string;
	projectPath?: string;
	version?: string;
	installPath?: string;
	[key: string]: unknown;
}

/** plugins/installed_plugins.json: `{ plugins: { "name@marketplace": [install, ...] } }`. */
export interface InstalledPluginsJson {
	plugins?: Record<string, unknown>;
}

/** <plugin>/.claude-plugin/plugin.json; hooks, mcpServers and skills may be a path, an object or a list. */
export interface PluginManifest {
	hooks?: unknown;
	mcpServers?: unknown;
	skills?: unknown;
	[key: string]: unknown;
}

/** plugins/known_marketplaces.json: `{ name: { source: {...}, installLocation } }`. */
export interface MarketplaceEntry {
	source?: { source?: string; repo?: string; url?: string; path?: string };
	installLocation?: string;
}

// ---- inventory ----

export type Scope = "user" | "project" | "local";

/** A settings file that exists, lowest precedence first. */
export interface SettingsLayer {
	scope: Scope;
	source: string;
	json: SettingsJson;
}

export type SkillKind = "file" | "symlink" | "broken";
export type SkillState = "active" | "broken" | PluginState;

export interface SkillItem {
	name: string;
	scope: "user" | "project" | "plugin";
	source: string;
	kind: SkillKind;
	target?: string;
	shelfGroup?: string;
	state: SkillState;
	/** Estimated description tokens; null for a broken skill. */
	tokens: number | null;
	plugin?: string;
}

export interface SkippedSkills {
	path: string;
	reason: string;
	count: number;
}

export type McpScope = "local" | "project" | "user" | "plugin" | "desktop-config" | "desktop-extension";
export type McpState = "active" | "pending-approval" | "rejected" | "shadowed" | "disabled";

export interface McpServerItem {
	name: string;
	transport: string;
	scope: McpScope;
	source: string;
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	headers?: Record<string, string>;
	plugin?: string;
	loadsIn: string[];
	state: McpState;
	shadowedBy?: { name: string; scope: McpScope; source: string };
}

export type HookState = "active" | "disabled" | "untrusted" | PluginState;

export interface HookItem {
	id: string;
	event: string;
	matcher: string;
	type: string;
	command?: string;
	scope: Scope | "plugin";
	source: string;
	plugin?: string;
	state: HookState;
}

export type PluginState = "active" | "disabled" | "not-here" | "not-installed";

export interface PluginInstall {
	scope: string;
	projectPath?: string;
	version: string;
	installPath?: string;
	appliesHere: boolean;
}

export interface PluginItem {
	id: string;
	name: string;
	marketplace: string;
	installs: PluginInstall[];
	state: PluginState;
	enabledBy: { scope: string; source: string; value: boolean };
	installPath?: string;
	version?: string;
	installScope?: string;
	manifestFile?: string;
}

export interface MarketplaceItem {
	name: string;
	source: string;
	sourceType: string;
	installLocation?: string;
}

// ---- doctor ----

export type Severity = "error" | "warning" | "info";

export interface Finding {
	id: string;
	severity: Severity;
	message: string;
	file: string;
	line?: number;
	fix?: string;
}
