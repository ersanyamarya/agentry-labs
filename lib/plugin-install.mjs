// `agentry plugin install <name>@<marketplace> [--scope user|project|local]` and `agentry plugin uninstall <name>`:
// run `claude plugin install|uninstall <id> --scope <scope>` through the fix engine (lib/fix.mjs), so the command is
// previewed, confirmed (or --yes) and the scope's settings file (where enabledPlugins lives) is backed up first.
// Why the claude CLI: an install also fetches the plugin into its cache and records it in installed_plugins.json, which
// is not a text edit. `agentry fix --undo` restores the settings file only when it existed (it is backed up first); the cached
// plugin and the installed_plugins.json record are left as they are, so undo an install with `plugin uninstall` and the
// reverse with `plugin install`. The engine lists the command to undo by hand.
// The marketplace must already be known to claude (claude plugin marketplace add); this tool does not add one.
// Refused (exit 1, nothing run): already installed at that scope (install), not installed at that scope (uninstall).
// Exit 2: usage, or a bare uninstall name matching several plugins or scopes. Applies to sessions started afterwards.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createFix } from "./fix.mjs";
import { createPluginsReader } from "./inventory/plugins.mjs";
import { APPLIES_NOTE, SCOPES, scopeSettingsFile } from "./plugin-toggle.mjs";

const RULE = "plugin-install";
const ID = /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/;

export const createPluginInstall = (paths, { out = console.log, err = console.error, ...fixOptions } = {}) => {
	const reader = createPluginsReader(paths);
	const tilde = (text) => (paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text));
	const runCommand =
		fixOptions.runCommand ??
		((command, options) => {
			const result = spawnSync(command[0], command.slice(1), { cwd: options.cwd, encoding: "utf8" });
			return { status: result.error ? null : result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.code };
		});

	// Is `id` installed at `scope` for the folder? (a user install, or a project/local one whose project is this one)
	const installedAt = (id, scope, cwd) => reader.read({ cwd }).plugins.find((plugin) => plugin.id === id)?.installs.some((install) => install.scope === scope && install.appliesHere) ?? false;

	const run = async ({ action, name, scope, path, yes = false, dryRun = false }) => {
		const install = action === "install";
		const cwd = resolve(path ?? process.cwd());
		if (scope !== undefined && !SCOPES.includes(scope)) {
			err(`--scope must be one of ${SCOPES.join(", ")}`);
			return 2;
		}
		let id = name;
		let chosen = scope ?? "user";
		if (install) {
			if (!ID.test(name ?? "")) {
				err("Usage: agentry plugin install <name>@<marketplace> [--scope user|project|local]");
				return 2;
			}
		} else {
			const { plugins } = reader.read({ cwd });
			const matches = plugins.filter((plugin) => plugin.installs.length > 0 && (plugin.id === name || (!String(name).includes("@") && plugin.name === name)));
			if (matches.length !== 1) {
				err(matches.length === 0 ? `No installed plugin "${name}". Installed: ${plugins.filter((plugin) => plugin.installs.length > 0).map((plugin) => plugin.id).join(", ") || "none"}` : `"${name}" matches several plugins: ${matches.map((plugin) => plugin.id).join(", ")}. Use name@marketplace.`);
				return matches.length === 0 ? 1 : 2;
			}
			[{ id }] = matches;
			const here = matches[0].installs.filter((one) => one.appliesHere).map((one) => one.scope);
			if (scope === undefined) {
				if (here.length !== 1) {
					err(here.length === 0 ? `${id} is installed only for other projects; run this in one of them.` : `${id} is installed at several scopes here (${here.join(", ")}); pick one with --scope.`);
					return here.length === 0 ? 1 : 2;
				}
				[chosen] = here;
			}
		}
		if (installedAt(id, chosen, cwd) === install) {
			if (install) {
				err(`refused: ${id} is already installed at ${chosen} scope.`);
				return 1;
			}
			err(`refused: ${id} is not installed at ${chosen} scope.`);
			return 1;
		}
		const file = scopeSettingsFile(paths, chosen, cwd);
		if (!existsSync(dirname(file))) {
			err(`refused: ${tilde(dirname(file))} does not exist, so ${chosen} scope cannot be used here.`);
			return 1;
		}
		const finding = { id: RULE, severity: "info", message: `${id} should be ${install ? "installed" : "uninstalled"} at ${chosen} scope`, file };
		const doctor = () => ({
			collect: () => ({ project: { cwd, root: paths.projectRoot(cwd) }, findings: installedAt(id, chosen, cwd) === install ? [] : [finding], errors: [] }),
		});
		const command = ["claude", "plugin", action, id, "--scope", chosen];
		const fixes = { [RULE]: () => ({ ruleId: RULE, file, describe: () => `${install ? "Install" : "Uninstall"} plugin ${id} at ${chosen} scope`, apply: () => ({ command, cwd: paths.projectRoot(cwd) }) }) };
		const code = await createFix(paths, { out, err, doctor, fixes, ...fixOptions, runCommand }).run({ path: cwd, yes, dryRun });
		if (code === 0 && !dryRun && installedAt(id, chosen, cwd) === install) {
			out(`${id} is ${install ? "installed" : "uninstalled"} at ${chosen} scope. ${APPLIES_NOTE}`);
		}
		return code;
	};

	return { run };
};
