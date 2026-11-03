// Row cursor over a list that has non-selectable header rows: moves skip headers and stay in range when rows change.

import React from "react";

const selectable = (row) => row && !row.header;

export const firstSelectable = (rows) => Math.max(0, rows.findIndex(selectable));

export const stepCursor = (rows, from, delta) => {
	for (let at = from + delta; at >= 0 && at < rows.length; at += delta) {
		if (selectable(rows[at])) {
			return at;
		}
	}
	return from;
};

export const useCursor = (rows) => {
	const [at, setAt] = React.useState(() => firstSelectable(rows));
	const clamped = Math.min(at, rows.length - 1);
	const cursor = selectable(rows[clamped]) ? clamped : stepCursor(rows, clamped, -1) !== clamped ? stepCursor(rows, clamped, -1) : firstSelectable(rows);
	const move = (delta) => setAt(stepCursor(rows, cursor, delta));
	return { cursor, row: rows[cursor], move };
};
