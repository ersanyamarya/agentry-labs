// Shapes shared by the CLI. Two kinds live here:
//  - files written by Claude Code (settings.json, .claude.json, .mcp.json, installed_plugins.json, hook groups): every field
//    is optional and loosely typed, because Claude tolerates a missing or wrong-typed field and so do the readers; narrow
//    with `isObject`/`list` (inventory/common) before use. Facts: docs/claude-config-sources.md.
//  - what the inventory readers and doctor produce (skills, MCP servers, hooks, plugins, findings), which are strict.

import type { Paths } from "./paths.js";

export type JsonObject = Record<string, unknown>;

/** An unreadable or invalid file, reported by a reader. Never holds file content. */
export interface ReadError {
  message: string;
  source: string;
}

// ---- files written by Claude Code ----

/** One hook entry inside a hook group. */
export interface HookEntry {
  command?: string;
  type?: string;
  [key: string]: unknown;
}

/** `{ matcher?, hooks: [...] }`; the matcher is a tool name pattern and absent means all. */
export interface HookGroup {
  hooks?: unknown;
  matcher?: string;
  [key: string]: unknown;
}

/** `{ Event: [group, ...] }`, the value of `hooks` in settings.json (or a plugin's hooks.json). */
export type HooksConfig = Record<string, unknown>;

/** settings.json / settings.local.json. */
export interface SettingsJson {
  disableAllHooks?: boolean;
  disabledMcpjsonServers?: unknown;
  enableAllProjectMcpServers?: boolean;
  enabledMcpjsonServers?: unknown;
  enabledPlugins?: Record<string, unknown>;
  env?: Record<string, unknown>;
  hooks?: HooksConfig;
  permissions?: {
    allow?: unknown;
    deny?: unknown;
    ask?: unknown;
    [key: string]: unknown;
  };
  statusLine?: { type?: string; command?: string };
  [key: string]: unknown;
}

/** One MCP server entry as written in .mcp.json, .claude.json or a plugin. */
export interface McpServerRaw {
  args?: unknown;
  command?: unknown;
  env?: unknown;
  headers?: unknown;
  type?: string;
  url?: unknown;
  [key: string]: unknown;
}

/** .mcp.json: `{ mcpServers: { name: entry } }`. */
export interface McpJson {
  mcpServers?: Record<string, unknown>;
}

/** A project's entry in .claude.json, keyed by the main checkout root. */
export interface ClaudeProject {
  disabledMcpjsonServers?: unknown;
  disabledMcpServers?: unknown;
  enableAllProjectMcpServers?: boolean;
  enabledMcpjsonServers?: unknown;
  hasTrustDialogAccepted?: boolean;
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

/** ~/.claude.json (or <CLAUDE_CONFIG_DIR>/.claude.json). */
export interface ClaudeJson {
  mcpServers?: Record<string, unknown>;
  projects?: Record<string, unknown>;
  [key: string]: unknown;
}

/** One install of a plugin in installed_plugins.json. `scope` is user, project or local. */
export interface InstalledPluginEntry {
  installPath?: string;
  projectPath?: string;
  scope?: string;
  version?: string;
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
  installLocation?: string;
  source?: { source?: string; repo?: string; url?: string; path?: string };
}

// ---- inventory ----

export type Scope = "user" | "project" | "local";

/** A settings file that exists, lowest precedence first. */
export interface SettingsLayer {
  json: SettingsJson;
  scope: Scope;
  source: string;
}

export type SkillKind = "file" | "symlink" | "broken";
export type SkillState = "active" | "broken" | PluginState;

export interface SkillItem {
  kind: SkillKind;
  name: string;
  plugin?: string;
  scope: "user" | "project" | "plugin";
  shelfGroup?: string;
  source: string;
  state: SkillState;
  target?: string;
  /** Estimated description tokens; null for a broken skill. */
  tokens: number | null;
}

export interface SkippedSkills {
  count: number;
  path: string;
  reason: string;
}

export type McpScope =
  | "local"
  | "project"
  | "user"
  | "plugin"
  | "desktop-config"
  | "desktop-extension";
export type McpState =
  | "active"
  | "pending-approval"
  | "rejected"
  | "shadowed"
  | "disabled";

export interface McpServerItem {
  args?: string[];
  command?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  loadsIn: string[];
  name: string;
  plugin?: string;
  scope: McpScope;
  shadowedBy?: { name: string; scope: McpScope; source: string };
  source: string;
  state: McpState;
  transport: string;
  url?: string;
}

export type HookState = "active" | "disabled" | "untrusted" | PluginState;

export interface HookItem {
  command?: string;
  event: string;
  id: string;
  matcher: string;
  plugin?: string;
  scope: Scope | "plugin";
  source: string;
  state: HookState;
  type: string;
}

export type PluginState = "active" | "disabled" | "not-here" | "not-installed";

export interface PluginInstall {
  appliesHere: boolean;
  installPath?: string;
  projectPath?: string;
  scope: string;
  version: string;
}

export interface PluginItem {
  enabledBy: { scope: string; source: string; value: boolean };
  id: string;
  installPath?: string;
  installScope?: string;
  installs: PluginInstall[];
  manifestFile?: string;
  marketplace: string;
  name: string;
  state: PluginState;
  version?: string;
}

export interface MarketplaceItem {
  installLocation?: string;
  name: string;
  source: string;
  sourceType: string;
}

// ---- doctor ----

export type Severity = "error" | "warning" | "info";

export interface Finding {
  file: string;
  fix?: string;
  id: string;
  line?: number;
  message: string;
  severity: Severity;
}

// ---- fix engine ----

/** What a fix's `apply` returns: the new file text, a command to run (no shell), or nothing to do. */
export type ApplyResult =
  | string
  | { command: string[]; cwd?: string }
  | null
  | undefined;

/** `file` is absent for a command fix that edits nothing; `apply` gets "" for a missing file and undefined for a non-regular one. */
export interface TextFix {
  apply: (text: string | undefined) => ApplyResult;
  describe?: () => string;
  file?: string;
  ruleId: string;
}

/** A fix that cannot be made safe: the finding is listed with the reason. */
export interface UnfixableFix {
  ruleId: string;
  unfixable: string;
}

export type Fix = TextFix | UnfixableFix;

export interface FixContext {
  cwd: string;
  findings: Finding[];
  paths: Paths;
  project: { cwd: string; root: string };
}

export type FixMaker = (
  finding: Finding,
  ctx: FixContext
) => Fix | Fix[] | undefined;
export type FixRegistry = Record<string, FixMaker>;

/** The slice of the doctor the fix engine uses (a stand-in is injected by plugin/mcp/hook toggles). */
export interface DoctorLike {
  collect: (cwd?: string) => {
    project: { cwd: string; root: string };
    findings: Finding[];
    errors: ReadError[];
  };
}

export interface CommandOutcome {
  error?: string;
  status: number | null;
  stderr: string;
  stdout: string;
}

export type RunCommand = (
  argv: string[],
  options: { cwd: string }
) => CommandOutcome;

/** Injectable dependencies of `createFix`. */
export interface FixOptions {
  confirm?: (question: string) => Promise<boolean>;
  doctor?: () => DoctorLike;
  err?: (text: string) => void;
  fixes?: FixRegistry;
  isTTY?: () => boolean;
  now?: () => Date;
  out?: (text: string) => void;
  runCommand?: RunCommand;
}

/** Arguments of `createFix(...).run`. `include` and `label` are for scan --fix. */
export interface FixRunArgs {
  dryRun?: boolean;
  include?: (finding: Finding) => boolean;
  label?: string;
  path?: string;
  yes?: boolean;
}
