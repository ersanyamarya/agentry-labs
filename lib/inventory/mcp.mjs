// Lists every MCP server a Claude Code session in a folder would see, where each comes from, and whether it loads.
// Sources, precedence and shapes: docs/claude-config-sources.md. Secret values are masked before they leave this module.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { maskArgs, maskCommand, maskHeader, maskMap, maskUrl } from "../mask.mjs";

// Node's JSON.parse message quotes the file's text, which may hold a secret, so it is never passed on.
const readJson = (file, errors) => {
	if (!existsSync(file)) {
		return undefined;
	}
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch (error) {
		errors.push({ source: file, message: error instanceof SyntaxError ? "invalid JSON" : `unreadable (${error.code ?? "error"})` });
		return undefined;
	}
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// `{ mcpServers: {...} }`, or a bare `{ name: entry }` map.
const serverMap = (json) => (isObject(json?.mcpServers) ? json.mcpServers : isObject(json) && !("mcpServers" in json) ? json : {});

const transportOf = (raw) => {
	if (raw.type === "streamable-http") {
		return "http";
	}
	return raw.type ?? (raw.command !== undefined ? "stdio" : "unknown");
};

const list = (value) => (Array.isArray(value) ? value : []);

export const createMcpReader = (paths, { platform = process.platform } = {}) => {
	const read = ({ cwd = process.cwd() } = {}) => {
		const errors = [];
		const start = resolve(cwd);
		const key = paths.repoKey(start);
		const top = paths.projectRoot(start);
		const claudeJson = readJson(paths.claudeJson, errors) ?? {};
		const project = isObject(claudeJson.projects?.[key]) ? claudeJson.projects[key] : {};
		const trusted = project.hasTrustDialogAccepted === true;

		const projectDirs = [...new Set([top, start])];
		const userSettings = readJson(join(paths.configDir, "settings.json"), errors) ?? {};
		const projectSettings = projectDirs.map((dir) => readJson(join(dir, ".claude", "settings.json"), errors) ?? {});
		const localSettings = projectDirs.map((dir) => readJson(join(dir, ".claude", "settings.local.json"), errors) ?? {});
		// Project-level approvals only count in a trusted folder; user settings always count.
		const approvers = [userSettings, ...(trusted ? [project, ...projectSettings, ...localSettings] : [])];
		const rejecters = [userSettings, project, ...projectSettings, ...localSettings];
		const disabled = new Set(list(project.disabledMcpServers));

		const servers = [];
		const endpoints = new WeakMap();
		const add = (name, raw, meta, root) => {
			if (!isObject(raw)) {
				errors.push({ source: meta.source, message: `server "${name}" is not an object` });
				return;
			}
			const expand = (text) => (root && typeof text === "string" ? text.replaceAll("${CLAUDE_PLUGIN_ROOT}", root) : text);
			const command = expand(raw.command);
			const args = list(raw.args).map(expand);
			const server = { name, transport: transportOf(raw), scope: meta.scope, source: meta.source };
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
			endpoints.set(server, typeof raw.url === "string" ? `url:${raw.url}` : JSON.stringify([command, ...args]));
			servers.push(server);
		};

		// 1. local, 2. .mcp.json from the start folder up to the filesystem root (nearest first), 3. user.
		for (const [name, raw] of Object.entries(serverMap({ mcpServers: project.mcpServers }))) {
			add(name, raw, { scope: "local", source: paths.claudeJson });
		}
		for (let dir = start; ; dir = dirname(dir)) {
			const file = join(dir, ".mcp.json");
			for (const [name, raw] of Object.entries(serverMap(readJson(file, errors)))) {
				const rejected = rejecters.some((settings) => list(settings.disabledMcpjsonServers).includes(name));
				const approved = approvers.some((settings) => settings.enableAllProjectMcpServers === true || list(settings.enabledMcpjsonServers).includes(name));
				add(name, raw, { scope: "project", source: file, state: rejected ? "rejected" : approved ? "active" : "pending-approval" });
			}
			if (dirname(dir) === dir) {
				break;
			}
		}
		for (const [name, raw] of Object.entries(serverMap({ mcpServers: claudeJson.mcpServers }))) {
			add(name, raw, { scope: "user", source: paths.claudeJson });
		}

		// 4. plugins installed for this project; enabledPlugins: local > project > user.
		// Minimal on purpose: the Plugins reader replaces this check (see docs/claude-config-sources.md, Plugins).
		const enabledPlugins = Object.assign({}, ...[userSettings, ...projectSettings, ...localSettings].map((settings) => (isObject(settings.enabledPlugins) ? settings.enabledPlugins : {})));
		const installed = readJson(join(paths.pluginsDir, "installed_plugins.json"), errors)?.plugins ?? {};
		const projectPaths = new Set([key, top, start]);
		for (const [id, installs] of Object.entries(installed)) {
			const install = list(installs).find((entry) => entry.scope !== "user" && projectPaths.has(entry.projectPath)) ?? list(installs).find((entry) => entry.scope === "user");
			if (!install?.installPath) {
				continue;
			}
			const root = install.installPath;
			const manifestFile = join(root, ".claude-plugin", "plugin.json");
			const manifest = readJson(manifestFile, errors) ?? {};
			const enabled = enabledPlugins[id] ?? manifest.defaultEnabled ?? true;
			const pluginName = id.split("@")[0];
			const meta = (source) => ({ scope: "plugin", source, plugin: id, state: enabled ? "active" : "disabled" });
			const files = new Set([join(root, ".mcp.json")]);
			const inline = [];
			for (const item of typeof manifest.mcpServers === "string" ? [manifest.mcpServers] : Array.isArray(manifest.mcpServers) ? manifest.mcpServers : [manifest.mcpServers]) {
				if (typeof item === "string") {
					files.add(resolve(root, item));
				} else if (isObject(item)) {
					inline.push(item);
				}
			}
			for (const map of inline) {
				for (const [name, raw] of Object.entries(serverMap(map))) {
					add(`plugin:${pluginName}:${name}`, raw, meta(manifestFile), root);
				}
			}
			for (const file of files) {
				for (const [name, raw] of Object.entries(serverMap(readJson(file, errors)))) {
					add(`plugin:${pluginName}:${name}`, raw, meta(file), root);
				}
			}
		}

		// Precedence: the first definition of a name wins; plugin servers lose to any earlier server with the same endpoint.
		const winners = new Map();
		const byEndpoint = new Map();
		for (const server of servers) {
			const winner = server.scope === "plugin" ? (winners.get(server.name) ?? byEndpoint.get(endpoints.get(server))) : winners.get(server.name);
			if (winner) {
				server.state = "shadowed";
				server.shadowedBy = { name: winner.name, scope: winner.scope, source: winner.source };
				continue;
			}
			winners.set(server.name, server);
			byEndpoint.set(endpoints.get(server), byEndpoint.get(endpoints.get(server)) ?? server);
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
const readDesktop = (dir, errors, add) => {
	const configFile = join(dir, "claude_desktop_config.json");
	for (const [name, raw] of Object.entries(serverMap({ mcpServers: readJson(configFile, errors)?.mcpServers }))) {
		add(name, raw, { scope: "desktop-config", source: configFile, loadsIn: ["desktop"] });
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
		const manifest = readJson(manifestFile, errors);
		const config = manifest?.server?.mcp_config;
		if (!isObject(config)) {
			continue;
		}
		const settings = readJson(join(dir, "Claude Extensions Settings", `${entry.name}.json`), errors) ?? {};
		const expand = (text) => (typeof text === "string" ? text.replaceAll("${__dirname}", root) : text);
		const raw = { ...config, command: expand(config.command), args: list(config.args).map(expand) };
		add(manifest.display_name ?? manifest.name ?? entry.name, raw, { scope: "desktop-extension", source: manifestFile, loadsIn: ["desktop"], state: settings.isEnabled === false ? "disabled" : "active" });
	}
};
