// Confirm step for parking a user-scope MCP server or adding a parked one back. The preview is lib/mcp-toggle.mjs's dry
// run (secrets masked); nothing changes until y. `agentry fix --undo` restores ~/.claude.json afterwards.

export const startMcpToggle = async ({ api, dir, flow, row }) => {
	const { mcp: name, mcpEnable: enable } = row;
	const preview = await api.previewMcp({ dir, name, enable });
	flow.begin({
		kind: "confirm",
		title: `${enable ? "Add back" : "Park"} ${name} (preview)`,
		text: preview.text,
		appliable: preview.appliable,
		apply: () => api.applyMcp({ dir, name, enable }),
		done: `${name} ${enable ? "is back in user scope" : "is parked"}. Applies to new sessions; undo with agentry fix --undo.`,
	});
};
