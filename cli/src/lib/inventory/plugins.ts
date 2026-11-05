// Lists the plugins a Claude Code session in a folder could load, where each is installed, and whether it is enabled.
// Files and the enabled rules: docs/claude-config-sources.md ("Plugins"). `projectPath` is matched here; Claude Code 2.1.316 does not check it (docs/claude-config-sources.md, "Probe results").

import { join } from "node:path";
import type { Paths } from "../paths.js";
import type { InstalledPluginEntry, InstalledPluginsJson, MarketplaceEntry, MarketplaceItem, PluginInstall, PluginItem, PluginManifest, ReadError, Scope } from "../types.js";
import { isObject, list, projectDirs, readJson, settingsLayers } from "./common.js";

export interface PluginsResult {
	plugins: PluginItem[];
	marketplaces: MarketplaceItem[];
	errors: ReadError[];
}

export const createPluginsReader = (paths: Pick<Paths, "configDir" | "projectRoot" | "repoKey" | "pluginsDir">) => {
	const read = ({ cwd = process.cwd() }: { cwd?: string } = {}): PluginsResult => {
		const errors: ReadError[] = [];
		const layers = settingsLayers(paths, cwd, errors);
		const here = new Set([paths.repoKey(cwd), ...projectDirs(paths, cwd)]);

		// enabledPlugins per id: local > project > user, so the last layer that names the plugin decides.
		const decisions = new Map<string, { enabled: boolean; scope: Scope; source: string }>();
		for (const { scope, source, json } of layers) {
			for (const [id, value] of Object.entries(isObject(json.enabledPlugins) ? json.enabledPlugins : {})) {
				decisions.set(id, { enabled: value !== false, scope, source });
			}
		}

		const installed = readJson<InstalledPluginsJson>(join(paths.pluginsDir, "installed_plugins.json"), errors)?.plugins;
		const plugins: PluginItem[] = [];
		for (const [id, installs] of Object.entries(isObject(installed) ? installed : {})) {
			const entries = list(installs).filter(isObject) as InstalledPluginEntry[];
			const mapped: PluginInstall[] = entries.map((entry) => ({
				scope: entry.scope ?? "user",
				...(entry.projectPath !== undefined && { projectPath: entry.projectPath }),
				version: entry.version ?? "unknown",
				installPath: entry.installPath,
				appliesHere: entry.scope === "user" || entry.scope === undefined || here.has(entry.projectPath as string),
			}));
			// A project-scoped install beats a user one for the same plugin.
			const active = mapped.find((entry) => entry.appliesHere && entry.scope !== "user") ?? mapped.find((entry) => entry.appliesHere);
			const manifestFile = active?.installPath ? join(active.installPath, ".claude-plugin", "plugin.json") : undefined;
			const manifest = manifestFile ? readJson<PluginManifest>(manifestFile, errors) : undefined;
			const decision = decisions.get(id);
			// Probed on 2.1.316: with no enabledPlugins entry anywhere a plugin is off, whatever its manifest `defaultEnabled` says.
			const enabled = decision?.enabled ?? false;
			const at = id.lastIndexOf("@");
			plugins.push({
				id,
				name: at === -1 ? id : id.slice(0, at),
				marketplace: at === -1 ? "" : id.slice(at + 1),
				installs: mapped,
				// "not-here": installed only for other projects, so it does not load in this folder.
				state: !active ? "not-here" : enabled ? "active" : "disabled",
				enabledBy: decision ? { scope: decision.scope, source: decision.source, value: decision.enabled } : { scope: "default", source: manifestFile ?? "", value: enabled },
				...(active ? { installPath: active.installPath, version: active.version, installScope: active.scope } : {}),
				...(manifestFile && isObject(manifest) ? { manifestFile } : {}),
			});
		}
		// enabledPlugins entries for plugins that are not installed at all.
		for (const [id, decision] of decisions) {
			if (!plugins.some((plugin) => plugin.id === id)) {
				const at = id.lastIndexOf("@");
				plugins.push({ id, name: at === -1 ? id : id.slice(0, at), marketplace: at === -1 ? "" : id.slice(at + 1), installs: [], state: "not-installed", enabledBy: { scope: decision.scope, source: decision.source, value: decision.enabled } });
			}
		}

		const marketplaces: MarketplaceItem[] = [];
		const known = readJson(join(paths.pluginsDir, "known_marketplaces.json"), errors);
		for (const [name, raw] of Object.entries(isObject(known) ? known : {})) {
			const entry = raw as MarketplaceEntry | null | undefined;
			const source: NonNullable<MarketplaceEntry["source"]> = isObject(entry?.source) ? entry.source : {};
			marketplaces.push({ name, source: source.repo ?? source.url ?? source.path ?? "", sourceType: source.source ?? "unknown", ...(entry?.installLocation && { installLocation: entry.installLocation }) });
		}
		return { plugins, marketplaces, errors };
	};

	return { read };
};
