// Rules tab: the CLAUDE.md and rule files Claude Code loads every session, user and project, with their token cost.
// e opens the selected file in $EDITOR; x removes it (previewed, y confirms; a copy is kept in the backups), X keeps no copy.

import React from "react";
import { useInput } from "ink";
import { startRemove } from "../remove-flow.mjs";
import { ruleKeys, ruleRows } from "../rows.mjs";
import { startBulk } from "../bulk-flow.mjs";
import { useList } from "../use-list.mjs";
import { useFlow } from "../use-flow.mjs";
import { Panes } from "./list.mjs";

export const RulesTab = ({ data, api, dir, active, height, layout, notify, reload, lock, setKeys, openFile, copy }) => {
	const all = React.useMemo(() => ruleRows(data), [data]);
	const list = useList({ rows: all, lock });
	const { rows, cursor, row, move } = list;
	const flow = useFlow({ lock, notify, reload, copy });
	const keys = ruleKeys(row);
	React.useEffect(() => {
		if (active) {
			setKeys(keys);
		}
	}, [active, keys.join()]);

	useInput(
		(input, key) => {
			if (flow.handleKey(input, key) || list.handleKey(input, key)) {
				return;
			}
			if (key.upArrow || key.downArrow) {
				flow.clear();
				move(key.upArrow ? -1 : 1);
			} else if (input === "e") {
				openFile(row?.file);
			} else if ((input === "x" || input === "X") && list.marked.some((one) => one.ruleFile)) {
				const backup = input === "x";
				startBulk({ flow, title: "Remove files", items: list.marked.filter((one) => one.ruleFile), preview: async (one) => { const result = await api.removeRule({ dir, target: one.ruleFile, backup, dryRun: true }); return { appliable: result.ok, text: result.text }; }, apply: (one) => api.removeRule({ dir, target: one.ruleFile, backup }), done: backup ? "Removed; copies are in ~/.claude/backups/agentry/removed/" : "Removed; no copies were kept" });
			} else if (input === "x" || input === "X") {
				row?.ruleFile ? startRemove({ api, dir, flow, call: "removeRule", backup: input === "x", target: row.ruleFile, label: row.ruleTitle }) : notify("Select a file first.");
			}
		},
		{ isActive: active },
	);

	return React.createElement(Panes, { rows, cursor, height, row, lines: flow.lines, title: flow.title, layout, marked: list.markedIds, status: list.status });
};
