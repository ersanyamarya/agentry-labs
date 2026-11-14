#!/usr/bin/env node
// Install manifest for scripts/setup.sh: <config>/agentry/install-manifest.json records what setup added, per part
// (agentry, trail, context-mode, config), so uninstall removes exactly that.
//
// Shape: { version: 1, updatedAt, parts: { <part>: { tools?: {manager, packages:{name:version}}, hooks?: [{event, command}],
//   settings?: [{key, value}], mcp?: [name], files?: [{path, sha256}], settingsFile?: <path>, wired?: true } } }
//
// Usage: node scripts/setup-manifest.mjs [--config <dir>] <command>
//   record <part> <json-file>     merge entries from the JSON file into that part (arrays are unioned, objects merged)
//   diff-settings <before> <after>  print the hook entries and top-level keys added between two settings.json files
//   show                          print the manifest
//   forget <part>                 drop a part (after its uninstall)
//   config-status                 print which recorded config entries are present, missing or changed (JSON)

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const manifestPath = (configDir) => join(configDir, "agentry", "install-manifest.json");
export const defaultConfigDir = () => (process.env.CLAUDE_CONFIG_DIR ? resolve(process.env.CLAUDE_CONFIG_DIR) : join(homedir(), ".claude"));

export function load(configDir) {
	const path = manifestPath(configDir);
	if (!existsSync(path)) return { version: 1, updatedAt: null, parts: {} };
	return JSON.parse(readFileSync(path, "utf8"));
}

function save(configDir, manifest) {
	const path = manifestPath(configDir);
	mkdirSync(dirname(path), { recursive: true });
	manifest.updatedAt = new Date().toISOString();
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
	renameSync(tmp, path);
}

const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(current, incoming) {
	if (Array.isArray(current) && Array.isArray(incoming)) {
		const seen = new Set(current.map((x) => JSON.stringify(x)));
		return [...current, ...incoming.filter((x) => !seen.has(JSON.stringify(x)))];
	}
	if (isPlain(current) && isPlain(incoming)) {
		const out = { ...current };
		for (const [k, v] of Object.entries(incoming)) out[k] = k in current ? merge(current[k], v) : v;
		return out;
	}
	return incoming;
}

export function record(configDir, part, entries) {
	const manifest = load(configDir);
	manifest.parts[part] = merge(manifest.parts[part] ?? {}, entries);
	save(configDir, manifest);
	return manifest;
}

export function forget(configDir, part) {
	const manifest = load(configDir);
	delete manifest.parts[part];
	save(configDir, manifest);
	return manifest;
}

// Hook entries (event + command) and top-level keys present in `after` but not in `before`.
export function diffSettings(before, after) {
	const commandsOf = (settings, event) => new Set((settings.hooks?.[event] ?? []).flatMap((entry) => (entry.hooks ?? []).map((h) => h.command)));
	const hooks = [];
	for (const event of Object.keys(after.hooks ?? {})) {
		const had = commandsOf(before, event);
		for (const command of commandsOf(after, event)) if (!had.has(command)) hooks.push({ event, command });
	}
	const keys = Object.keys(after).filter((k) => k !== "hooks" && !(k in before));
	return { hooks, keys };
}

// Which entries recorded for the config part are still in place: files (and whether they changed), hooks, settings keys, MCP servers.
export function configStatus(configDir, home = homedir()) {
	const entries = load(configDir).parts.config;
	if (!entries) return { recorded: false, total: 0, present: 0, missing: [], changed: [] };
	const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
	const settings = readJson(join(configDir, "settings.json"));
	const userConfig = readJson(process.env.CLAUDE_CONFIG_DIR ? join(configDir, ".claude.json") : join(home, ".claude.json"));
	const missing = [];
	const changed = [];
	let total = 0;
	for (const f of entries.files ?? []) {
		total++;
		if (!existsSync(f.path)) missing.push(f.path);
		else if (createHash("sha256").update(readFileSync(f.path)).digest("hex") !== f.sha256) changed.push(f.path);
	}
	for (const h of entries.hooks ?? []) {
		total++;
		const has = (settings.hooks?.[h.event] ?? []).some((e) => (e.hooks ?? []).some((x) => x.command === h.command));
		if (!has) missing.push(`${h.event} hook`);
	}
	for (const k of entries.settings ?? []) {
		total++;
		const [head, ...rest] = k.key.split(".");
		const value = rest.length ? settings[head]?.[rest.join(".")] : settings[head];
		if (value === undefined) missing.push(k.key);
		else if (JSON.stringify(value) !== JSON.stringify(k.value)) changed.push(k.key);
	}
	for (const name of entries.mcp ?? []) {
		total++;
		if (!userConfig.mcpServers?.[name]) missing.push(`mcp ${name}`);
	}
	return { recorded: true, total, present: total - missing.length, missing, changed };
}

function main(argv) {
	const args = [...argv];
	let configDir = defaultConfigDir();
	const ci = args.indexOf("--config");
	if (ci >= 0) {
		configDir = resolve(args[ci + 1]);
		args.splice(ci, 2);
	}
	const [command, a, b] = args;
	const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
	switch (command) {
		case "record":
			record(configDir, a, readJson(b));
			return;
		case "diff-settings":
			console.log(JSON.stringify(diffSettings(existsSync(a) ? readJson(a) : {}, existsSync(b) ? readJson(b) : {}), null, 2));
			return;
		case "show":
			console.log(JSON.stringify(load(configDir), null, 2));
			return;
		case "config-status":
			console.log(JSON.stringify(configStatus(configDir)));
			return;
		case "forget":
			forget(configDir, a);
			return;
		default:
			console.error("usage: setup-manifest.mjs [--config <dir>] record <part> <file> | diff-settings <before> <after> | show | forget <part>");
			process.exit(2);
	}
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
