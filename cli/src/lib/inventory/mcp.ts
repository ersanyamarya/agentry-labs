// Lists every MCP server a Claude Code session in a folder would see, where each comes from, and whether it loads.
// Sources, precedence and shapes: cli/docs/claude-config-sources.md. Secret values are masked before they leave this module.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  maskArgs,
  maskCommand,
  maskHeader,
  maskMap,
  maskUrl,
} from "../mask.js";
import type { Paths } from "../paths.js";
import type {
  ClaudeJson,
  ClaudeProject,
  McpScope,
  McpServerItem,
  McpServerRaw,
  McpState,
  PluginManifest,
  ReadError,
  SettingsJson,
} from "../types.js";
import { isObject, list, readJson } from "./common.js";
import { createPluginsReader } from "./plugins.js";

// `{ mcpServers: {...} }`. Claude Code ignores a bare `{ name: entry }` .mcp.json; plugin files may be bare (unverified).
const serverMap = (
  json: unknown,
  { bare = false }: { bare?: boolean } = {}
): Record<string, unknown> =>
  isObject(json) && isObject(json.mcpServers)
    ? json.mcpServers
    : bare && isObject(json) && !("mcpServers" in json)
      ? json
      : {};

const transportOf = (raw: McpServerRaw): string => {
  if (raw.type === "streamable-http") {
    return "http";
  }
  return raw.type ?? (raw.command === undefined ? "unknown" : "stdio");
};

// Where an entry was found; `loadsIn` and `state` default to both apps and active.
interface McpMeta {
  loadsIn?: string[];
  plugin?: string;
  scope: McpScope;
  source: string;
  state?: McpState;
}

type AddServer = (
  name: string,
  raw: unknown,
  meta: McpMeta,
  root?: string
) => void;

export interface McpResult {
  errors: ReadError[];
  servers: McpServerItem[];
}

type McpPaths = Pick<
  Paths,
  | "configDir"
  | "projectRoot"
  | "repoKey"
  | "pluginsDir"
  | "claudeJson"
  | "desktopDir"
>;

export const createMcpReader = (
  paths: McpPaths,
  { platform = process.platform }: { platform?: NodeJS.Platform } = {}
) => {
  const pluginsReader = createPluginsReader(paths);
  const read = ({ cwd = process.cwd() }: { cwd?: string } = {}): McpResult => {
    const errors: ReadError[] = [];
    const start = resolve(cwd);
    const key = paths.repoKey(start);
    const top = paths.projectRoot(start);
    const claudeJson = readJson<ClaudeJson>(paths.claudeJson, errors) ?? {};
    const projectEntry = claudeJson.projects?.[key];
    const project = (
      isObject(projectEntry) ? projectEntry : {}
    ) as ClaudeProject;
    const trusted = project.hasTrustDialogAccepted === true;

    const projectDirs = [...new Set([top, start])];
    const userSettings =
      readJson<SettingsJson>(join(paths.configDir, "settings.json"), errors) ??
      {};
    const projectSettings = projectDirs.map(
      (dir) =>
        readJson<SettingsJson>(join(dir, ".claude", "settings.json"), errors) ??
        {}
    );
    const localSettings = projectDirs.map(
      (dir) =>
        readJson<SettingsJson>(
          join(dir, ".claude", "settings.local.json"),
          errors
        ) ?? {}
    );
    // Project-level approvals only count in a trusted folder; user settings always count.
    const approvers = [
      userSettings,
      ...(trusted ? [project, ...projectSettings, ...localSettings] : []),
    ];
    const rejecters = [
      userSettings,
      project,
      ...projectSettings,
      ...localSettings,
    ];
    const disabled = new Set(list(project.disabledMcpServers));

    const servers: McpServerItem[] = [];
    const endpoints = new WeakMap<McpServerItem, string>();
    const add: AddServer = (name, raw, meta, root) => {
      if (!isObject(raw)) {
        errors.push({
          source: meta.source,
          message: `server "${name}" is not an object`,
        });
        return;
      }
      const expand = (text: unknown): unknown =>
        root && typeof text === "string"
          ? text.replaceAll("${CLAUDE_PLUGIN_ROOT}", root)
          : text;
      const command = expand(raw.command);
      const args = list(raw.args).map(expand);
      // loadsIn and state are set below, before the server is used.
      const server = {
        name,
        transport: transportOf(raw),
        scope: meta.scope,
        source: meta.source,
      } as McpServerItem;
      if (raw.command !== undefined) {
        server.command = maskCommand(command);
        server.args = maskArgs(args);
      }
      if (raw.url !== undefined) {
        server.url = maskUrl(raw.url);
      }
      if (raw.env !== undefined) {
        server.env = maskMap(raw.env);
      }
      if (raw.headers !== undefined) {
        server.headers = maskMap(raw.headers, maskHeader);
      }
      if (meta.plugin) {
        server.plugin = meta.plugin;
      }
      server.loadsIn = meta.loadsIn ?? ["cli", "desktop"];
      server.state = meta.state ?? "active";
      endpoints.set(
        server,
        typeof raw.url === "string"
          ? `url:${raw.url}`
          : JSON.stringify([command, ...args])
      );
      servers.push(server);
    };

    // 1. local, 2. .mcp.json from the start folder up to the filesystem root (nearest first), 3. user.
    for (const [name, raw] of Object.entries(
      serverMap({ mcpServers: project.mcpServers })
    )) {
      add(name, raw, { scope: "local", source: paths.claudeJson });
    }
    for (let dir = start; ; dir = dirname(dir)) {
      const file = join(dir, ".mcp.json");
      for (const [name, raw] of Object.entries(
        serverMap(readJson(file, errors))
      )) {
        const rejected = rejecters.some((settings) =>
          list(settings.disabledMcpjsonServers).includes(name)
        );
        const approved = approvers.some(
          (settings) =>
            settings.enableAllProjectMcpServers === true ||
            list(settings.enabledMcpjsonServers).includes(name)
        );
        add(name, raw, {
          scope: "project",
          source: file,
          state: rejected
            ? "rejected"
            : approved
              ? "active"
              : "pending-approval",
        });
      }
      if (dirname(dir) === dir) {
        break;
      }
    }
    for (const [name, raw] of Object.entries(
      serverMap({ mcpServers: claudeJson.mcpServers })
    )) {
      add(name, raw, { scope: "user", source: paths.claudeJson });
    }

    // 4. plugins installed for this project and not just enabled elsewhere; the Plugins reader decides which and whether enabled.
    const pluginResult = pluginsReader.read({ cwd: start });
    errors.push(...pluginResult.errors);
    for (const plugin of pluginResult.plugins) {
      if (!plugin.installPath) {
        continue;
      }
      const { id } = plugin;
      const enabled = plugin.state === "active";
      const root = plugin.installPath;
      const manifestFile = join(root, ".claude-plugin", "plugin.json");
      const manifest: PluginManifest =
        readJson<PluginManifest>(manifestFile, errors) ?? {};
      const [pluginName] = id.split("@");
      const meta = (source: string): McpMeta => ({
        scope: "plugin",
        source,
        plugin: id,
        state: enabled ? "active" : "disabled",
      });
      const files = new Set([join(root, ".mcp.json")]);
      const inline: Record<string, unknown>[] = [];
      for (const item of typeof manifest.mcpServers === "string"
        ? [manifest.mcpServers]
        : Array.isArray(manifest.mcpServers)
          ? manifest.mcpServers
          : [manifest.mcpServers]) {
        if (typeof item === "string") {
          files.add(resolve(root, item));
        } else if (isObject(item)) {
          inline.push(item);
        }
      }
      for (const map of inline) {
        for (const [name, raw] of Object.entries(
          serverMap(map, { bare: true })
        )) {
          add(`plugin:${pluginName}:${name}`, raw, meta(manifestFile), root);
        }
      }
      for (const file of files) {
        for (const [name, raw] of Object.entries(
          serverMap(readJson(file, errors), { bare: true })
        )) {
          add(`plugin:${pluginName}:${name}`, raw, meta(file), root);
        }
      }
    }

    // Precedence: the first definition of a name wins; plugin servers lose to any earlier server with the same endpoint.
    // An unapproved or rejected .mcp.json entry doesn't load: it still hides farther .mcp.json entries of its name,
    // but a user entry of that name loads instead.
    const winners = new Map<string, McpServerItem>();
    const unapproved = new Map<string, McpServerItem>();
    const byEndpoint = new Map<string, McpServerItem>();
    const endpointOf = (server: McpServerItem): string =>
      endpoints.get(server) as string;
    for (const server of servers) {
      const byName =
        winners.get(server.name) ??
        (server.scope === "project" ? unapproved.get(server.name) : undefined);
      const winner =
        server.scope === "plugin"
          ? (byName ?? byEndpoint.get(endpointOf(server)))
          : byName;
      if (winner) {
        server.state = "shadowed";
        server.shadowedBy = {
          name: winner.name,
          scope: winner.scope,
          source: winner.source,
        };
        continue;
      }
      if (server.state === "pending-approval" || server.state === "rejected") {
        unapproved.set(server.name, server);
        continue;
      }
      winners.set(server.name, server);
      byEndpoint.set(
        endpointOf(server),
        byEndpoint.get(endpointOf(server)) ?? server
      );
      if (disabled.has(server.name)) {
        server.state = "disabled";
      }
    }

    if (platform === "darwin") {
      readDesktop(paths.desktopDir, errors, add);
    }
    return { servers, errors };
  };

  return { read };
};

// The desktop app's own config and its installed extensions; both load in the desktop app, not in the terminal CLI.
const readDesktop = (
  dir: string,
  errors: ReadError[],
  add: AddServer
): void => {
  const configFile = join(dir, "claude_desktop_config.json");
  for (const [name, raw] of Object.entries(
    serverMap({
      mcpServers: readJson<{ mcpServers?: unknown }>(configFile, errors)
        ?.mcpServers,
    })
  )) {
    add(name, raw, {
      scope: "desktop-config",
      source: configFile,
      loadsIn: ["desktop"],
    });
  }
  const extensionsDir = join(dir, "Claude Extensions");
  if (!existsSync(extensionsDir)) {
    return;
  }
  for (const entry of readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const root = join(extensionsDir, entry.name);
    const manifestFile = join(root, "manifest.json");
    const manifest = readJson<{
      display_name?: string;
      name?: string;
      server?: { mcp_config?: unknown };
    }>(manifestFile, errors);
    const config = manifest?.server?.mcp_config;
    if (!(manifest && isObject(config))) {
      continue;
    }
    const settings =
      readJson<{ isEnabled?: boolean }>(
        join(dir, "Claude Extensions Settings", `${entry.name}.json`),
        errors
      ) ?? {};
    const expand = (text: unknown): unknown =>
      typeof text === "string" ? text.replaceAll("${__dirname}", root) : text;
    const raw = {
      ...config,
      command: expand(config.command),
      args: list(config.args).map(expand),
    };
    add(manifest.display_name ?? manifest.name ?? entry.name, raw, {
      scope: "desktop-extension",
      source: manifestFile,
      loadsIn: ["desktop"],
      state: settings.isEnabled === false ? "disabled" : "active",
    });
  }
};
