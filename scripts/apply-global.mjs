#!/usr/bin/env node
// Applies the repo's user-level config. The global/ folder holds settings.fragment.json, mcp.json and helpers/.
// Merges settings.fragment.json into <config>/settings.json and mcp.json into the user .claude.json, copies
// global/hooks/*.mjs to <config>/hooks/, global/helpers/* to <config>/helpers/ (mode 0755) and rules/*.md (not README.md)
// to <config>/rules/. <config> is CLAUDE_CONFIG_DIR, else <home>/.claude; with CLAUDE_CONFIG_DIR set, .claude.json lives
// inside it, else at <home>/.claude.json.
// Only adds what is missing (hooks, plugins, env, statusLine, MCP servers) and never removes anything; a changed copied
// file is replaced after a backup. Prints the plan; pass --write to apply it.
//
// Usage: node scripts/apply-global.mjs [--write] [--home <dir>] [--report <file>]
// --report writes JSON listing what this run added (hooks, settings keys, MCP servers, copied files with sha256).

import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const write = args.includes("--write");
const valueOf = (flag) => {
	const i = args.indexOf(flag);
	return i >= 0 ? args[i + 1] : undefined;
};
const home = valueOf("--home") ? resolve(valueOf("--home")) : homedir();
const reportPath = valueOf("--report") ? resolve(valueOf("--report")) : undefined;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configDir = process.env.CLAUDE_CONFIG_DIR ? resolve(process.env.CLAUDE_CONFIG_DIR) : join(home, ".claude");

const stable = (value) => JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const expand = (text) => text.replaceAll("${HOME}", home);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const fragment = JSON.parse(expand(readFileSync(join(root, "global/settings.fragment.json"), "utf8")));
const mcp = JSON.parse(readFileSync(join(root, "global/mcp.json"), "utf8"));

const settingsPath = join(configDir, "settings.json");
const mcpPath = process.env.CLAUDE_CONFIG_DIR ? join(configDir, ".claude.json") : join(home, ".claude.json");
const settings = readJson(settingsPath, {});
const userConfig = readJson(mcpPath, {});
const actions = [];
const report = { configDir, hooks: [], settings: [], mcp: [], files: [] };

for (const [event, entries] of Object.entries(fragment.hooks ?? {})) {
	settings.hooks ??= {};
	settings.hooks[event] ??= [];
	const existing = new Set(settings.hooks[event].flatMap((entry) => (entry.hooks ?? []).map((hook) => hook.command)));
	for (const entry of entries) {
		if (entry.hooks.every((hook) => existing.has(hook.command))) continue;
		settings.hooks[event].push(entry);
		actions.push(`settings.json: add ${event} hook ${entry.hooks[0].command.slice(0, 70)}`);
		for (const hook of entry.hooks) report.hooks.push({ event, command: hook.command });
	}
}

for (const key of ["enabledPlugins", "env", "extraKnownMarketplaces"]) {
	for (const [name, value] of Object.entries(fragment[key] ?? {})) {
		settings[key] ??= {};
		if (name in settings[key]) continue;
		settings[key][name] = value;
		actions.push(`settings.json: add ${key}.${name}`);
		report.settings.push({ key: `${key}.${name}`, value });
	}
}

for (const key of ["statusLine", "subagentStatusLine"]) {
	if (!fragment[key] || key in settings) continue;
	settings[key] = fragment[key];
	actions.push(`settings.json: add ${key}`);
	report.settings.push({ key, value: fragment[key] });
}

// Copied files: a changed copy replaces the old one after a backup. Hook scripts (not tests), helpers and rules.
const copies = [];
const planCopy = (label, sourceDir, targetDir, keep, mode) => {
	if (!existsSync(sourceDir)) return;
	for (const name of readdirSync(sourceDir)) {
		const source = join(sourceDir, name);
		if (!statSync(source).isFile() || !keep(name)) continue;
		const target = join(targetDir, name);
		const content = readFileSync(source);
		const current = existsSync(target) ? readFileSync(target) : null;
		if (current !== null && current.equals(content)) continue;
		copies.push({ target, content, backup: current !== null, mode });
		actions.push(`${label}/${name}: ${current === null ? "add" : "update (backup kept)"}`);
		report.files.push({ path: target, sha256: sha256(content), replaced: current !== null });
	}
};
planCopy("hooks", join(root, "global/hooks"), join(configDir, "hooks"), (n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"));
planCopy("helpers", join(root, "global/helpers"), join(configDir, "helpers"), (n) => !n.includes(".test."), 0o755);
planCopy("rules", join(root, "rules"), join(configDir, "rules"), (n) => n.endsWith(".md") && n !== "README.md");

const warnings = [];
for (const [name, server] of Object.entries(mcp.mcpServers)) {
	userConfig.mcpServers ??= {};
	const current = userConfig.mcpServers[name];
	if (!current) {
		userConfig.mcpServers[name] = server;
		actions.push(`.claude.json: add MCP server ${name}`);
		report.mcp.push(name);
	} else if (stable(current) !== stable(server)) {
		const literalKey = JSON.stringify(current).match(/ctx7sk-|sk-[A-Za-z0-9]/) ? " (contains a literal key; switch to the env var)" : "";
		warnings.push(`.claude.json: MCP server ${name} differs from global/mcp.json${literalKey}; left as is`);
	}
}

console.log(`Target home: ${home}`);
console.log(`Config dir: ${configDir}`);
for (const line of [...actions, ...warnings]) console.log(`- ${line}`);
if (actions.length === 0) console.log("Nothing to add.");

if (write && actions.length > 0) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const settingsChanged = report.hooks.length + report.settings.length > 0;
	const mcpChanged = report.mcp.length > 0;
	if (settingsChanged) {
		mkdirSync(dirname(settingsPath), { recursive: true });
		if (existsSync(settingsPath)) copyFileSync(settingsPath, `${settingsPath}.bak-${stamp}`);
		writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
	}
	if (mcpChanged) {
		mkdirSync(dirname(mcpPath), { recursive: true });
		if (existsSync(mcpPath)) copyFileSync(mcpPath, `${mcpPath}.bak-${stamp}`);
		writeFileSync(mcpPath, `${JSON.stringify(userConfig, null, 2)}\n`);
	}
	for (const { target, content, backup, mode } of copies) {
		mkdirSync(dirname(target), { recursive: true });
		if (backup) copyFileSync(target, `${target}.bak-${stamp}`);
		writeFileSync(target, content);
		if (mode) chmodSync(target, mode);
	}
	console.log("Written. Backups saved next to each file.");
} else if (!write && actions.length > 0) {
	console.log("Dry run. Re-run with --write to apply.");
}

if (reportPath) {
	mkdirSync(dirname(reportPath), { recursive: true });
	writeFileSync(reportPath, `${JSON.stringify(write ? report : { ...report, hooks: [], settings: [], mcp: [], files: [], dryRun: true }, null, 2)}\n`);
}
