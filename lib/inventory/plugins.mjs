// Lists the plugins a Claude Code session in a folder could load, where each is installed, and whether it is enabled.
// Files and the enabled rules: docs/claude-config-sources.md ("Plugins"). Matching `projectPath` against the folder is unverified.

import { join } from "node:path";
import { isObject, list, projectDirs, readJson, settingsLayers } from "./common.mjs";

export const createPluginsReader = (paths) => {
	const read = ({ cwd = process.cwd() } = {}) => {
		const errors = [];
		const layers = settingsLayers(paths, cwd, errors);
		const here = new Set([paths.repoKey(cwd), ...projectDirs(paths, cwd)]);

		// enabledPlugins per id: local > project > user, so the last layer that names the plugin decides.
		const decisions = new Map();
		for (const { scope, source, json } of layers) {
			for (const [id, value] of Object.entries(isObject(json.enabledPlugins) ? json.enabledPlugins : {})) {
				decisions.set(id, { enabled: value !== false, scope, source });
			}
		}

		const installed = readJson(join(paths.pluginsDir, "installed_plugins.json"), errors)?.plugins;
		const plugins = [];
		for (const [id, installs] of Object.entries(isObject(installed) ? installed : {})) {
			const entries = list(installs).filter(isObject);
			const mapped = entries.map((entry) => ({
				scope: entry.scope ?? "user",
				...(entry.projectPath !== undefined && { projectPath: entry.projectPath }),
				version: entry.version ?? "unknown",
				installPath: entry.installPath,
				appliesHere: entry.scope === "user" || entry.scope === undefined || here.has(entry.projectPath),
			}));
			// A project-scoped install beats a user one for the same plugin.
			const active = mapped.find((entry) => entry.appliesHere && entry.scope !== "user") ?? mapped.find((entry) => entry.appliesHere);
			const manifestFile = active?.installPath ? join(active.installPath, ".claude-plugin", "plugin.json") : undefined;
			const manifest = manifestFile ? readJson(manifestFile, errors) : undefined;
			const decision = decisions.get(id);
			const enabled = decision?.enabled ?? (isObject(manifest) && manifest.defaultEnabled === false ? false : true);
			const at = id.lastIndexOf("@");
			plugins.push({
				id,
				name: at === -1 ? id : id.slice(0, at),
				marketplace: at === -1 ? "" : id.slice(at + 1),
				installs: mapped,
				// "not-here": installed only for other projects, so it does not load in this folder.
				state: !active ? "not-here" : enabled ? "active" : "disabled",
				enabledBy: decision ? { scope: decision.scope, source: decision.source, value: decision.enabled } : { scope: "default", source: manifestFile ?? "", value: enabled },
				...(active && { installPath: active.installPath, version: active.version, installScope: active.scope }),
				...(manifestFile && isObject(manifest) && { manifestFile }),
			});
		}
		// enabledPlugins entries for plugins that are not installed at all.
		for (const [id, decision] of decisions) {
			if (!plugins.some((plugin) => plugin.id === id)) {
				const at = id.lastIndexOf("@");
				plugins.push({ id, name: at === -1 ? id : id.slice(0, at), marketplace: at === -1 ? "" : id.slice(at + 1), installs: [], state: "not-installed", enabledBy: { scope: decision.scope, source: decision.source, value: decision.enabled } });
			}
		}

		const marketplaces = [];
		const known = readJson(join(paths.pluginsDir, "known_marketplaces.json"), errors);
		for (const [name, entry] of Object.entries(isObject(known) ? known : {})) {
			const source = isObject(entry?.source) ? entry.source : {};
			marketplaces.push({ name, source: source.repo ?? source.url ?? source.path ?? "", sourceType: source.source ?? "unknown", ...(entry?.installLocation && { installLocation: entry.installLocation }) });
		}
		return { plugins, marketplaces, errors };
	};

	return { read };
};
