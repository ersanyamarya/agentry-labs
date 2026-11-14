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
//        node scripts/apply-global.mjs --remove <manifest> [--write] [--home <dir>]
// --report writes JSON listing what this run added (hooks, settings keys, MCP servers, copied files with sha256).
// --remove undoes the `config` part of an install manifest (scripts/setup-manifest.mjs). It removes only listed entries
// that still match what was installed: a hook (event + command) still present, a settings key whose value still equals
// the recorded one, an MCP server still equal to global/mcp.json, a copied file whose sha256 is unchanged. Anything
// changed since is kept and reported; anything not listed is never touched. A settings.json or .claude.json left as {}
// and a folder left empty by a removed file are deleted. Before writing, every file it changes is
// backed up to <config>/backups/agentry-setup/<stamp>/ (manifest.json plus files/<absolute path>). Preview by default;
// --write applies. Exits 2 when the manifest is missing or has no config part.

import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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

if (args.includes("--remove")) {
	removeInstalled(valueOf("--remove"));
	process.exit(0);
}

function removeInstalled(manifestFile) {
	const usage = (why) => {
		console.error(`apply-global: ${why}`);
		console.error("usage: node scripts/apply-global.mjs --remove <manifest> [--write] [--home <dir>]");
		process.exit(2);
	};
	if (!manifestFile || manifestFile.startsWith("--")) usage("--remove needs a manifest path");
	const manifestAbs = resolve(manifestFile);
	if (!existsSync(manifestAbs)) usage(`manifest not found: ${manifestAbs}`);
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(manifestAbs, "utf8"));
	} catch {
		usage(`manifest is not valid JSON: ${manifestAbs}`);
	}
	const part = manifest?.parts?.config;
	if (!part || typeof part !== "object") usage(`manifest has no config part: ${manifestAbs}`);

	const removed = [];
	const kept = [];
	const gone = [];
	let settingsChanged = false;
	let mcpChanged = false;
	const filesToDelete = [];

	// Hooks: drop each listed (event, command) still present; then empty entries, events and the hooks object.
	const hookKeys = new Set((part.hooks ?? []).map((h) => `${h.event}\n${h.command}`));
	for (const { event, command } of part.hooks ?? []) {
		const list = settings.hooks?.[event];
		const present = Array.isArray(list) && list.some((entry) => (entry.hooks ?? []).some((hook) => hook.command === command));
		if (!present) gone.push(`${event} hook ${command.slice(0, 70)}`);
	}
	for (const [event, list] of Object.entries(settings.hooks ?? {})) {
		if (!Array.isArray(list)) continue;
		const next = [];
		for (const entry of list) {
			const hooks = entry.hooks ?? [];
			const left = hooks.filter((hook) => !hookKeys.has(`${event}\n${hook.command}`));
			for (const hook of hooks) if (!left.includes(hook)) removed.push(`settings.json: remove ${event} hook ${hook.command.slice(0, 70)}`);
			if (left.length === hooks.length) next.push(entry);
			else if (left.length > 0) next.push({ ...entry, hooks: left });
		}
		if (next.length === list.length && next.every((e, i) => e === list[i])) continue;
		settingsChanged = true;
		if (next.length > 0) settings.hooks[event] = next;
		else delete settings.hooks[event];
	}
	if (settingsChanged && settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;

	// Settings keys: `parent.child` (split at the first dot) or a top-level key. Removed only when unchanged.
	const recorded = new Map();
	for (const { key, value } of part.settings ?? []) recorded.set(key, [...(recorded.get(key) ?? []), stable(value)]);
	for (const [key, values] of recorded) {
		const dot = key.indexOf(".");
		const parentKey = dot >= 0 ? key.slice(0, dot) : null;
		const childKey = dot >= 0 ? key.slice(dot + 1) : key;
		const holder = parentKey === null ? settings : settings[parentKey];
		if (!holder || typeof holder !== "object" || !(childKey in holder)) {
			gone.push(key);
			continue;
		}
		if (!values.includes(stable(holder[childKey]))) {
			kept.push(`${key} changed since install`);
			continue;
		}
		delete holder[childKey];
		if (parentKey !== null && Object.keys(holder).length === 0) delete settings[parentKey];
		settingsChanged = true;
		removed.push(`settings.json: remove ${key}`);
	}

	// MCP servers: removed only when still equal to the entry in global/mcp.json.
	for (const name of new Set(part.mcp ?? [])) {
		const current = userConfig.mcpServers?.[name];
		const source = mcp.mcpServers?.[name];
		if (current === undefined) gone.push(`MCP server ${name}`);
		else if (!source || stable(current) !== stable(source)) kept.push(`MCP server ${name} changed since install`);
		else {
			delete userConfig.mcpServers[name];
			mcpChanged = true;
			removed.push(`.claude.json: remove MCP server ${name}`);
		}
	}
	if (mcpChanged && Object.keys(userConfig.mcpServers).length === 0) delete userConfig.mcpServers;

	// Copied files: removed only when the content still matches a recorded sha256. Never a .bak-* file.
	const shas = new Map();
	for (const { path, sha256: sum } of part.files ?? []) if (path) shas.set(path, [...(shas.get(path) ?? []), sum]);
	for (const [path, sums] of shas) {
		if (/\.bak-/.test(path)) kept.push(`${path} is a backup file`);
		else if (!existsSync(path)) gone.push(path);
		else if (!statSync(path).isFile()) kept.push(`${path} is not a file`);
		else if (!sums.includes(sha256(readFileSync(path)))) kept.push(`${path} was edited`);
		else {
			filesToDelete.push(path);
			removed.push(`remove ${path}`);
		}
	}

	console.log(`Target home: ${home}`);
	console.log(`Config dir: ${configDir}`);
	for (const line of removed) console.log(`- ${line}`);
	for (const line of kept) console.log(`- kept: ${line}`);
	for (const line of gone) console.log(`- already gone: ${line}`);
	if (removed.length === 0) {
		console.log("Nothing to remove.");
		return;
	}
	if (!write) {
		console.log("Dry run. Re-run with --write to apply.");
		return;
	}

	// Back up every existing file this run changes, before any write.
	const touched = [...(settingsChanged ? [settingsPath] : []), ...(mcpChanged ? [mcpPath] : []), ...filesToDelete].filter((p) => existsSync(p));
	const createdAt = new Date().toISOString();
	const backupDir = join(configDir, "backups", "agentry-setup", createdAt.replace(/[:.]/g, "-"));
	const entries = [];
	for (const path of touched) {
		const backup = join(backupDir, "files", path.replace(/^\/+/, ""));
		mkdirSync(dirname(backup), { recursive: true });
		copyFileSync(path, backup);
		entries.push({ path, realPath: realpathSync(path), kind: "file", backup, sha256: sha256(readFileSync(path)) });
	}
	mkdirSync(backupDir, { recursive: true });
	writeFileSync(join(backupDir, "manifest.json"), `${JSON.stringify({ version: 1, tool: "agentry-labs-setup", createdAt, cwd: process.cwd(), status: "applied", files: entries }, null, 2)}\n`);

	// A JSON file left as {} and a folder left empty are deleted too (both are in the backup or hold nothing).
	const save = (path, value) => (Object.keys(value).length === 0 ? unlinkSync(path) : writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`));
	if (settingsChanged) save(settingsPath, settings);
	if (mcpChanged) save(mcpPath, userConfig);
	for (const path of filesToDelete) unlinkSync(path);
	for (const dir of new Set(filesToDelete.map((p) => dirname(p)))) {
		if (dir === configDir || dir === home) continue;
		try {
			rmdirSync(dir);
		} catch {}
	}
	console.log(`Removed. Backup saved in ${backupDir}`);
}

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
