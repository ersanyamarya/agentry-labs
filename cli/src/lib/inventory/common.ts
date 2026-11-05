// @ts-nocheck
// Helpers shared by the inventory readers: safe JSON reads and the settings files a session in a folder loads.
// Settings locations and precedence: docs/claude-config-sources.md ("Settings and env").

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const list = (value) => (Array.isArray(value) ? value : []);

// Node's JSON.parse message quotes the file's text, which may hold a secret, so it is never passed on.
export const readJson = (file, errors) => {
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

// The folders a session started in `cwd` reads project settings from: the working-tree root and `cwd` itself.
// Which of the two Claude Code really uses for hooks and enabledPlugins is unverified; both are read.
export const projectDirs = (paths, cwd) => [...new Set([paths.projectRoot(resolve(cwd)), resolve(cwd)])];

// Settings files that exist, lowest precedence first: user, project, local (later wins for scalars and per-key maps).
export const settingsLayers = (paths, cwd, errors) => {
	const layers = [];
	const add = (scope, file) => {
		const json = readJson(file, errors);
		if (json !== undefined) {
			layers.push({ scope, source: file, json: isObject(json) ? json : {} });
		}
	};
	add("user", join(paths.configDir, "settings.json"));
	const dirs = projectDirs(paths, cwd);
	for (const dir of dirs) {
		add("project", join(dir, ".claude", "settings.json"));
	}
	for (const dir of dirs) {
		add("local", join(dir, ".claude", "settings.local.json"));
	}
	return layers;
};

// The project's entry in .claude.json (keyed by the main checkout root) tells whether the folder is trusted.
export const isTrusted = (paths, cwd, errors) => {
	const project = readJson(paths.claudeJson, errors)?.projects?.[paths.repoKey(resolve(cwd))];
	return isObject(project) && project.hasTrustDialogAccepted === true;
};

// Readers that share settings files hit the same unreadable file more than once; report it once.
export const uniqueErrors = (errors) => errors.filter((error, index) => errors.findIndex((other) => other.source === error.source && other.message === error.message) === index);
