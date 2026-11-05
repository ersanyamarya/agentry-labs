// @ts-nocheck
// Confirm step for deleting a skill (or, with call "removeRule", a CLAUDE.md or rule file): the preview is the lib's own dry run, and nothing is deleted until y. A copy of
// the folder is kept under ~/.claude/backups/agentry/removed/ (Backups tab: u restores) unless backup is false (X key).

export const startRemove = async ({ api, dir, flow, target, label, project, backup = true, call = "removeSkill" }) => {
	const preview = await api[call]({ dir, target, project, backup, dryRun: true });
	flow.begin({
		kind: "confirm",
		title: `Remove ${label} (preview)`,
		text: preview.text,
		appliable: preview.ok,
		apply: () => api[call]({ dir, target, project, backup }),
		done: backup ? `Removed ${label}; a copy is in ~/.claude/backups/agentry/removed/ (Backups tab restores it).` : `Removed ${label}; no copy was kept.`,
	});
};
