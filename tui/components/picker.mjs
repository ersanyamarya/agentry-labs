// Project picker: the current repo, recent repos, then repos found under the scan roots.

import React from "react";
import { Box, Text, useInput } from "ink";
import { stepCursor } from "../use-cursor.mjs";

const h = React.createElement;

export const pickerRows = ({ current, recents, found }) => {
	const seen = new Set();
	const rows = [];
	const add = (kind, path) => {
		if (!seen.has(path)) {
			seen.add(path);
			rows.push({ id: path, kind, path, label: `${path}  (${kind})` });
		}
	};
	add("current", current);
	recents.forEach((path) => add("recent", path));
	found.forEach((path) => add("repo", path));
	return rows;
};

export const Picker = ({ rows, onPick, onClose }) => {
	const [cursor, setCursor] = React.useState(0);
	useInput((input, key) => {
		if (key.escape || input === "p") {
			onClose();
		} else if (key.upArrow) {
			setCursor(stepCursor(rows, cursor, -1));
		} else if (key.downArrow) {
			setCursor(stepCursor(rows, cursor, 1));
		} else if (key.return && rows[cursor]) {
			onPick(rows[cursor].path);
		}
	});
	return h(
		Box,
		{ flexDirection: "column", borderStyle: "round", paddingX: 1 },
		h(Text, { bold: true }, "Project (enter select, esc close)"),
		...rows.map((row, index) => h(Text, { key: row.id, inverse: index === cursor, wrap: "truncate-start" }, `${index === cursor ? ">" : " "} ${row.label}`)),
	);
};
