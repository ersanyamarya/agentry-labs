// Confirm step for deleting a skill: the preview is lib/shelf.mjs's own dry run, and nothing is deleted until y. A copy of
// the folder is kept under ~/.claude/backups/agentry/removed/ (move it back to restore).

export const startRemove = async ({ api, dir, flow, target, label }) => {
	const preview = await api.removeSkill({ dir, target, dryRun: true });
	flow.begin({
		kind: "confirm",
		title: `Remove ${label} (preview)`,
		text: preview.text,
		appliable: preview.ok,
		apply: () => api.removeSkill({ dir, target }),
		done: `Removed ${label}; a copy is in ~/.claude/backups/agentry/removed/.`,
	});
};
