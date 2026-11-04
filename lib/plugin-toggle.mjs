// `agentry plugin enable|disable <name>`: flips the plugin's `enabledPlugins` entry in the settings file of the right scope.
// It edits the file text with lib/json-edit.mjs (formatting stays) and runs the edit through the fix engine (lib/fix.mjs),
// so the preview is the engine's masked diff, a backup set is written first, and `agentry fix --undo` restores it.
// Why files and not `claude plugin enable|disable`: that command picks its scope by "auto-detect" and runs a process the
// engine cannot back up or preview, while the settings file is what the Plugins reader (and Claude Code) read anyway.
// Scopes: user <config>/settings.json, project <repo>/.claude/settings.json, local <repo>/.claude/settings.local.json;
// local > project > user. Without --scope the file of the layer that decides today is edited, else the install scope's.
// Refused (exit 1, nothing written): not installed or not installed for this folder, managed settings name the plugin,
// or a higher scope also names it (the edit would be overridden). Exit 2: ambiguous bare name. The change applies to
// sessions started afterwards.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createFix } from "./fix.mjs";
import { isObject, readJson, settingsLayers } from "./inventory/common.mjs";
import { createPluginsReader } from "./inventory/plugins.mjs";
import { createJsonEdit } from "./json-edit.mjs";

export const SCOPES = ["user", "project", "local"];
export const APPLIES_NOTE = "Applies to sessions started after this; a running session keeps its plugins until restarted.";

const RULE = "plugin-toggle";

// The settings file of a scope: user <config>/settings.json, project <repo>/.claude/settings.json, local .../settings.local.json.
export const scopeSettingsFile = (paths, scope, cwd) => (scope === "user" ? join(paths.configDir, "settings.json") : join(paths.projectRoot(cwd), ".claude", scope === "project" ? "settings.json" : "settings.local.json"));

export const createPluginToggle = (paths, { out = console.log, err = console.error, ...fixOptions } = {}) => {
	const reader = createPluginsReader(paths);
	const tilde = (text) => (paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text));

	const managedFiles = () => {
		const dir = paths.managedDir;
		const dropIns = existsSync(join(dir, "managed-settings.d")) ? readdirSync(join(dir, "managed-settings.d")).filter((name) => name.endsWith(".json")).sort() : [];
		return [join(dir, "managed-settings.json"), ...dropIns.map((name) => join(dir, "managed-settings.d", name))];
	};

	const settingsFile = (scope, cwd) => scopeSettingsFile(paths, scope, cwd);

	// Everything that decides whether and where the edit can happen. → { id, enable, scope, file, already?, refusal?, code? }
	const inspect = ({ name, enable, scope, path }) => {
		const cwd = resolve(path ?? process.cwd());
		const refuse = (refusal, code = 1) => ({ refusal, code });
		if (scope !== undefined && !SCOPES.includes(scope)) {
			return refuse(`--scope must be one of ${SCOPES.join(", ")}`, 2);
		}
		const errors = [];
		const { plugins } = reader.read({ cwd });
		const matches = plugins.filter((plugin) => plugin.id === name || (!name.includes("@") && plugin.name === name));
		if (matches.length === 0) {
			return refuse(`No plugin "${name}". Plugins: ${plugins.map((plugin) => plugin.id).join(", ") || "none"}`);
		}
		if (matches.length > 1) {
			return refuse(`"${name}" matches several plugins: ${matches.map((plugin) => plugin.id).join(", ")}. Use name@marketplace.`, 2);
		}
		const [plugin] = matches;
		const verb = enable ? "enabled" : "disabled";
		if (plugin.state === "not-here" || plugin.state === "not-installed") {
			return refuse(`${plugin.id} is ${plugin.state === "not-here" ? "installed only for other projects, so it does not load in this folder" : "not installed"}; install it with claude plugin install first.`);
		}
		for (const file of managedFiles()) {
			if (isObject(readJson(file, errors)?.enabledPlugins) && readJson(file, errors).enabledPlugins[plugin.id] !== undefined) {
				return refuse(`${plugin.id} is set by managed settings (${tilde(file)}), which this tool cannot change.`);
			}
		}
		const named = settingsLayers(paths, cwd, errors)
			.filter((layer) => isObject(layer.json.enabledPlugins) && layer.json.enabledPlugins[plugin.id] !== undefined)
			.map((layer) => ({ scope: layer.scope, source: layer.source, value: layer.json.enabledPlugins[plugin.id] !== false }));
		const chosen = scope ?? named.at(-1)?.scope ?? (SCOPES.includes(plugin.installScope) ? plugin.installScope : "user");
		const higher = named.filter((layer) => SCOPES.indexOf(layer.scope) > SCOPES.indexOf(chosen));
		if (higher.length > 0) {
			return refuse(`${higher.at(-1).scope} settings (${tilde(higher.at(-1).source)}) also set ${plugin.id} and win over ${chosen}; use --scope ${higher.at(-1).scope}.`);
		}
		const file = named.findLast((layer) => layer.scope === chosen)?.source ?? settingsFile(chosen, cwd);
		if (!existsSync(dirname(file))) {
			return refuse(`${tilde(dirname(file))} does not exist, so ${chosen} settings cannot be created there.`);
		}
		const base = { id: plugin.id, enable, scope: chosen, file, cwd };
		if ((plugin.state === "active") === enable) {
			return { ...base, already: `${plugin.id} is already ${verb}${plugin.enabledBy.scope === "default" ? " (by default)" : ` (${plugin.enabledBy.scope} settings)`}.` };
		}
		return base;
	};

	// The text after setting enabledPlugins[id]; a missing or empty file gets a fresh one with a tab indent.
	const editText = (text, id, enable) => {
		if (text === undefined || text.trim() === "") {
			return `${JSON.stringify({ enabledPlugins: { [id]: enable } }, null, "\t")}\n`;
		}
		const doc = createJsonEdit(text);
		if (doc.get(["enabledPlugins"]) === undefined) {
			doc.set(["enabledPlugins"], { [id]: enable });
		} else {
			doc.set(["enabledPlugins", id], enable);
		}
		return doc.text;
	};

	const run = async ({ name, enable, scope, path, yes = false, dryRun = false }) => {
		const found = inspect({ name, enable, scope, path });
		if (found.refusal) {
			err(`refused: ${found.refusal}`);
			return found.code;
		}
		if (found.already) {
			out(found.already);
			return 0;
		}
		const { id, file, cwd } = found;
		const message = `${id} should be ${enable ? "enabled" : "disabled"}`;
		const finding = { id: RULE, severity: "info", message, file };
		// A stand-in for doctor: reports the one finding until the plugin reads back in the wanted state.
		const doctor = () => ({
			collect: () => ({ project: { cwd, root: paths.projectRoot(cwd) }, findings: inspect({ name: id, enable, scope: found.scope, path: cwd }).already ? [] : [finding], errors: [] }),
		});
		const fixes = { [RULE]: () => ({ ruleId: RULE, file, describe: () => `${enable ? "Enable" : "Disable"} ${id} in ${found.scope} settings`, apply: (text) => editText(text, id, enable) }) };
		const code = await createFix(paths, { out, err, doctor, fixes, ...fixOptions }).run({ path: cwd, yes, dryRun });
		if (code === 0) {
			out(APPLIES_NOTE);
		}
		return code;
	};

	return { inspect, run };
};
