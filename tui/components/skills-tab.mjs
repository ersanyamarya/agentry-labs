// Skills tab: shelf groups (expand to skills, toggle on/off for this project or globally) and what else loads.

import React from "react";
import { Box, Text, useInput } from "ink";
import { skillRows } from "../rows.mjs";
import { useCursor } from "../use-cursor.mjs";
import { DetailsPane, ListPane } from "./list.mjs";

const h = React.createElement;

export const SkillsTab = ({ data, api, dir, active, height, notify, reload }) => {
	const [expanded, setExpanded] = React.useState(() => new Set());
	const [global, setGlobal] = React.useState(false);
	const rows = React.useMemo(() => skillRows(data, expanded), [data, expanded]);
	const { cursor, row, move } = useCursor(rows);

	const toggle = async () => {
		if (row?.kind === "agent") {
			notify("Agents switch with their group: toggle the group row.");
			return;
		}
		if (row?.kind !== "group" && row?.kind !== "skill") {
			return;
		}
		const on = !(global ? row.globalOn : row.projectOn);
		const result = await api.toggleShelf({ dir, target: row.target, on, global });
		notify(result.message);
		await reload();
	};

	useInput(
		(input, key) => {
			if (key.upArrow) {
				move(-1);
			} else if (key.downArrow) {
				move(1);
			} else if (key.return && row?.kind === "group") {
				setExpanded((open) => {
					const next = new Set(open);
					next.has(row.group) ? next.delete(row.group) : next.add(row.group);
					return next;
				});
			} else if (input === " ") {
				toggle();
			} else if (input === "g") {
				setGlobal((value) => !value);
			}
		},
		{ isActive: active },
	);

	return h(
		Box,
		{ flexDirection: "column" },
		h(Text, null, `Toggle target: `, h(Text, { bold: true, color: "cyan" }, global ? "global (config dir)" : "this project"), h(Text, { dimColor: true }, `  (g to switch)  ~${data.status.tokens.measured} tokens of skill descriptions load in every session`)),
		h(Box, null, h(ListPane, { rows, cursor, height }), h(DetailsPane, { row, height })),
	);
};
