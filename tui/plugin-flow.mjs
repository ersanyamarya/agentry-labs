// Starts the confirm step for enabling or disabling a plugin: the preview is lib/plugin-toggle.mjs's own dry run
// (diff, backup location, refusals), and nothing is written until y.

export const startPluginToggle = async ({ api, dir, flow, row }) => {
	const enable = !row.enabled;
	const preview = await api.previewPlugin({ dir, id: row.plugin, enable });
	flow.begin({
		kind: "confirm",
		title: `${enable ? "Enable" : "Disable"} ${row.plugin} (preview)`,
		text: preview.text,
		appliable: preview.appliable,
		apply: () => api.applyPlugin({ dir, id: row.plugin, enable }),
		done: `${row.plugin} ${enable ? "enabled" : "disabled"}. Applies to new sessions; undo with agentry fix --undo.`,
	});
};

const PLUGIN_ID = /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/;

// Confirm step for `claude plugin install|uninstall`: the preview is lib/plugin-install.mjs's dry run (the command, the settings
// file it backs up); nothing runs until y. `fix --undo` restores the settings file only (see the lib header).
const confirmInstall = async ({ api, dir, action, name, scope }) => {
	const args = { dir, action, name, scope };
	const preview = await api.previewPluginInstall(args);
	const verb = action === "install" ? "Install" : "Uninstall";
	return {
		kind: "confirm",
		title: `${verb} ${name} at ${scope} scope (preview)`,
		text: preview.text,
		appliable: preview.appliable,
		apply: () => api.applyPluginInstall(args),
		done: `${name} is ${action}ed at ${scope} scope. Applies to new sessions.`,
	};
};

// Install form: type name@marketplace → pick the scope → preview → y. The marketplace must already be added to claude.
export const startPluginInstall = ({ api, dir, flow }) =>
	flow.begin({
		kind: "name",
		title: "Install plugin",
		label: "Plugin (name@marketplace)",
		intro: ["The marketplace must already be added to claude (claude plugin marketplace add)."],
		onSubmit: (name) =>
			PLUGIN_ID.test(name)
				? { kind: "pick", title: `Install ${name}: scope`, intro: ["Where should it be installed?"], options: ["user", "project", "local"], onPick: (scope) => confirmInstall({ api, dir, action: "install", name, scope }) }
				: { kind: "result", ok: false, text: "Type it as name@marketplace, e.g. demo@market." },
	});

// Uninstall: the plugin's installs that apply here; more than one asks which scope.
export const startPluginUninstall = async ({ api, dir, flow, row }) => {
	const name = row.plugin;
	const scopes = row.pluginScopes;
	flow.begin(
		scopes.length === 1
			? await confirmInstall({ api, dir, action: "uninstall", name, scope: scopes[0] })
			: { kind: "pick", title: `Uninstall ${name}: scope`, intro: ["Installed at several scopes here; which one?"], options: scopes, onPick: (scope) => confirmInstall({ api, dir, action: "uninstall", name, scope }) },
	);
};
