// Confirm step for turning off a user-scope MCP server or adding a parked one back. The preview is lib/mcp-toggle.mjs's dry
// run (secrets masked); nothing changes until y. `agentry fix --undo` restores ~/.claude.json afterwards.

export const startMcpToggle = async ({ api, dir, flow, row }) => {
	const { mcp: name, mcpEnable: enable } = row;
	const preview = await api.previewMcp({ dir, name, enable });
	flow.begin({
		kind: "confirm",
		title: `${enable ? "Add back" : "Turn off"} ${name} (preview)`,
		text: preview.text,
		appliable: preview.appliable,
		apply: () => api.applyMcp({ dir, name, enable }),
		done: `${name} ${enable ? "is back in user scope" : "is turned off"}. Applies to new sessions; undo with agentry fix --undo.`,
	});
};

// Confirm step for deleting an MCP server for good (user, local or project .mcp.json scope, or a parked copy).
export const startMcpRemove = async ({ api, dir, flow, row }) => {
	const name = row.mcp;
	const preview = await api.previewMcpRemove({ dir, name });
	flow.begin({
		kind: "confirm",
		title: `Remove ${name} (preview)`,
		text: preview.text,
		appliable: preview.appliable,
		apply: () => api.applyMcpRemove({ dir, name }),
		done: `${name} is removed. Applies to new sessions; undo with agentry fix --undo.`,
	});
};
