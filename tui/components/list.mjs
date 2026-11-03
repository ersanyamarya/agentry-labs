// A scrolling list of rows beside a details pane for the selected one.

import React from "react";
import { Box, Text } from "ink";

const h = React.createElement;

const SEVERITY_COLOR = { error: "red", warning: "yellow", info: "gray" };

export const ListPane = ({ rows, cursor, height }) => {
	const start = Math.max(0, Math.min(cursor - Math.floor(height / 2), rows.length - height));
	const shown = rows.slice(start, start + height);
	return h(
		Box,
		{ flexDirection: "column", width: "58%" },
		rows.length === 0 ? h(Text, { dimColor: true }, "  (nothing here)") : null,
		...shown.map((row, index) => {
			const at = start + index;
			if (row.header) {
				return h(Text, { key: row.id, bold: true, color: SEVERITY_COLOR[row.severity] }, row.label);
			}
			const selected = at === cursor;
			return h(
				Text,
				{ key: row.id, wrap: "truncate-end", inverse: selected, color: selected ? undefined : SEVERITY_COLOR[row.severity] },
				`${selected ? ">" : " "}${row.label}${row.note ? `  ${row.note}` : ""}`,
			);
		}),
		rows.length > height ? h(Text, { dimColor: true }, `  ${cursor + 1}/${rows.length}`) : null,
	);
};

// `lines` replaces the row's own details (the doctor tab shows a fix preview there); long text is cut to `height`.
export const DetailsPane = ({ row, lines, title = "Details", height }) => {
	const wrap = lines ? "wrap" : "truncate-middle";
	const text = (lines ?? row?.details ?? []).map((line) => line.replaceAll("\t", "  "));
	const shown = text.length > height ? [...text.slice(0, height - 1), `… ${text.length - height + 1} more lines`] : text;
	return h(
		Box,
		{ flexDirection: "column", flexGrow: 1, borderStyle: "single", borderColor: "gray", paddingX: 1 },
		h(Text, { bold: true }, title),
		...shown.map((line, index) => h(Text, { key: index, wrap, color: line.startsWith("+") && lines ? "green" : line.startsWith("-") && lines ? "red" : undefined }, line || " ")),
	);
};
