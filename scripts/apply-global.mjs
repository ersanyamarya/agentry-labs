#!/usr/bin/env node
// Merges global/settings.fragment.json into ~/.claude/settings.json and global/mcp.json into ~/.claude.json.
// Only adds what is missing and never removes anything. Prints the plan; pass --write to apply it.
//
// Usage: node scripts/apply-global.mjs [--write] [--home <dir>]

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const write = args.includes("--write");
const homeIndex = args.indexOf("--home");
const home = homeIndex >= 0 ? resolve(args[homeIndex + 1]) : homedir();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const stable = (value) => JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const expand = (text) => text.replaceAll("${HOME}", home);
const fragment = JSON.parse(expand(readFileSync(join(root, "global/settings.fragment.json"), "utf8")));
const mcp = JSON.parse(readFileSync(join(root, "global/mcp.json"), "utf8"));

const settingsPath = join(home, ".claude/settings.json");
const mcpPath = join(home, ".claude.json");
const settings = readJson(settingsPath, {});
const userConfig = readJson(mcpPath, {});
const actions = [];

for (const [event, entries] of Object.entries(fragment.hooks ?? {})) {
	settings.hooks ??= {};
	settings.hooks[event] ??= [];
	const existing = new Set(settings.hooks[event].flatMap((entry) => (entry.hooks ?? []).map((hook) => hook.command)));
	for (const entry of entries) {
		if (entry.hooks.every((hook) => existing.has(hook.command))) continue;
		settings.hooks[event].push(entry);
		actions.push(`settings.json: add ${event} hook ${entry.hooks[0].command.slice(0, 70)}`);
	}
}

for (const key of ["enabledPlugins", "extraKnownMarketplaces"]) {
	for (const [name, value] of Object.entries(fragment[key] ?? {})) {
		settings[key] ??= {};
		if (name in settings[key]) continue;
		settings[key][name] = value;
		actions.push(`settings.json: add ${key}.${name}`);
	}
}

const warnings = [];
for (const [name, server] of Object.entries(mcp.mcpServers)) {
	userConfig.mcpServers ??= {};
	const current = userConfig.mcpServers[name];
	if (!current) {
		userConfig.mcpServers[name] = server;
		actions.push(`.claude.json: add MCP server ${name}`);
	} else if (stable(current) !== stable(server)) {
		const literalKey = JSON.stringify(current).match(/ctx7sk-|sk-[A-Za-z0-9]/) ? " (contains a literal key; switch to the env var)" : "";
		warnings.push(`.claude.json: MCP server ${name} differs from global/mcp.json${literalKey}; left as is`);
	}
}

console.log(`Target home: ${home}`);
for (const line of [...actions, ...warnings]) console.log(`- ${line}`);
if (actions.length === 0) console.log("Nothing to add.");

if (write && actions.length > 0) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	for (const path of [settingsPath, mcpPath]) if (existsSync(path)) copyFileSync(path, `${path}.bak-${stamp}`);
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
	writeFileSync(mcpPath, `${JSON.stringify(userConfig, null, 2)}\n`);
	console.log("Written. Backups saved next to each file.");
} else if (!write) {
	console.log("Dry run. Re-run with --write to apply.");
}
