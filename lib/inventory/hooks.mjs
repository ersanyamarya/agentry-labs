// Lists every hook a Claude Code session in a folder would run: user, project and local settings plus enabled plugins.
// Hooks merge, so each one is reported with its event, matcher, command and owner. Hook output is not measurable offline.
// Sources and shapes: docs/claude-config-sources.md ("Hooks"). Commands are masked before they leave this module.

import { join, resolve } from "node:path";
import { maskShell } from "../mask.mjs";
import { isObject, isTrusted, list, uniqueErrors, readJson, settingsLayers } from "./common.mjs";
import { createPluginsReader } from "./plugins.mjs";

export const createHooksReader = (paths) => {
	const pluginsReader = createPluginsReader(paths);

	const read = ({ cwd = process.cwd() } = {}) => {
		const errors = [];
		const hooks = [];
		const layers = settingsLayers(paths, cwd, errors);
		const trusted = isTrusted(paths, cwd, errors);
		const disableAll = layers.reduce((value, { json }) => (typeof json.disableAllHooks === "boolean" ? json.disableAllHooks : value), false);

		// `{ hooks: { Event: [...] } }`; some plugin hooks.json files omit the outer key.
		const addFrom = (json, meta, root) => {
			const events = isObject(json?.hooks) ? json.hooks : isObject(json) && !("hooks" in json) ? json : {};
			for (const [event, groups] of Object.entries(events)) {
				for (const group of list(groups)) {
					for (const hook of list(group?.hooks)) {
						if (!isObject(hook)) {
							continue;
						}
						const command = typeof hook.command === "string" ? maskShell(root ? hook.command.replaceAll("${CLAUDE_PLUGIN_ROOT}", root) : hook.command) : undefined;
						hooks.push({
							event,
							matcher: typeof group.matcher === "string" && group.matcher !== "" ? group.matcher : "*",
							type: hook.type ?? "command",
							...(command !== undefined && { command }),
							scope: meta.scope,
							source: meta.source,
							...(meta.plugin && { plugin: meta.plugin }),
							state: disableAll ? "disabled" : (meta.state ?? "active"),
						});
					}
				}
			}
		};

		for (const { scope, source, json } of layers) {
			// Project hooks run only in trusted folders (docs: glossary).
			addFrom(json, { scope, source, state: scope !== "user" && !trusted ? "untrusted" : "active" });
		}

		const pluginResult = pluginsReader.read({ cwd });
		errors.push(...pluginResult.errors);
		for (const plugin of pluginResult.plugins) {
			if (!plugin.installPath) {
				continue;
			}
			const meta = (source) => ({ scope: "plugin", source, plugin: plugin.id, state: plugin.state });
			const manifest = plugin.manifestFile ? (readJson(plugin.manifestFile, errors) ?? {}) : {};
			const files = new Set([join(plugin.installPath, "hooks", "hooks.json")]);
			const inline = [];
			for (const item of typeof manifest.hooks === "string" ? [manifest.hooks] : list(manifest.hooks).length > 0 ? manifest.hooks : [manifest.hooks]) {
				if (typeof item === "string") {
					files.add(resolve(plugin.installPath, item));
				} else if (isObject(item)) {
					inline.push(item);
				}
			}
			for (const item of inline) {
				addFrom(item, meta(plugin.manifestFile), plugin.installPath);
			}
			for (const file of files) {
				addFrom(readJson(file, errors), meta(file), plugin.installPath);
			}
		}
		errors.splice(0, errors.length, ...uniqueErrors(errors));
		return { hooks, disableAllHooks: disableAll, trusted, errors };
	};

	return { read };
};
