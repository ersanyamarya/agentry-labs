// Backups tab: the fix sets and removed-skill copies under ~/.claude/backups/agentry. u moves a removed skill back,
// x deletes the selected backup, d deletes everything 30+ days old. Each is previewed (lib/backups.mjs's own dry run)
// and waits for y; c copies the preview.

import React from "react";
import { useInput } from "ink";
import { backupKeys, backupRows } from "../rows.mjs";
import { useCursor } from "../use-cursor.mjs";
import { useFlow } from "../use-flow.mjs";
import { Panes } from "./list.mjs";

const PRUNE_DAYS = 30;

export const BackupsTab = ({ data, api, dir, active, height, layout, notify, reload, lock, setKeys, copy }) => {
	const rows = React.useMemo(() => backupRows(data), [data]);
	const { cursor, row, move } = useCursor(rows);
	const flow = useFlow({ lock, notify, reload, copy });
	const keys = backupKeys(row);
	React.useEffect(() => {
		if (active) {
			setKeys(keys);
		}
	}, [active, keys.join()]);

	const confirmDelete = async (selection, title, done) => {
		const preview = await api.pruneBackups({ dir, ...selection, dryRun: true });
		flow.begin({ kind: "confirm", title: `${title} (preview)`, text: preview.text, appliable: preview.ok, apply: () => api.pruneBackups({ dir, ...selection }), done });
	};

	const startRestore = async () => {
		const preview = await api.restoreBackup({ dir, id: row.backup, dryRun: true });
		flow.begin({ kind: "confirm", title: `Restore ${row.label.trim()} (preview)`, text: preview.text, appliable: preview.ok, apply: () => api.restoreBackup({ dir, id: row.backup }), done: "Restored; it is back in its original folder." });
	};

	useInput(
		(input, key) => {
			if (flow.handleKey(input, key)) {
				return;
			}
			if (key.upArrow || key.downArrow) {
				flow.clear();
				move(key.upArrow ? -1 : 1);
			} else if (input === "u") {
				row?.restorable ? startRestore() : notify("u restores a removed skill: select one that has a known original folder.");
			} else if (input === "x") {
				row?.backup ? confirmDelete({ ids: [row.backup] }, `Delete ${row.label.trim()}`, "Deleted that backup.") : notify("Select a backup first.");
			} else if (input === "d") {
				confirmDelete({ olderThan: PRUNE_DAYS }, `Delete backups ${PRUNE_DAYS}+ days old`, `Deleted the backups ${PRUNE_DAYS}+ days old.`);
			}
		},
		{ isActive: active },
	);

	return React.createElement(Panes, { rows, cursor, height, row, lines: flow.lines, title: flow.title, layout });
};
