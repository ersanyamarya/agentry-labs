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
