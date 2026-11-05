// Project picker: the current repo, recent repos, then repos found under the scan roots.

import React from "react";
import { Box, Text, useInput } from "ink";
import { stepCursor } from "../use-cursor.js";

export interface PickerRow {
	id: string;
	kind: "current" | "recent" | "repo";
	path: string;
	label: string;
	header?: undefined;
}

export const pickerRows = ({ current, recents, found }: { current: string; recents: string[]; found: string[] }) => {
	const seen = new Set<string>();
	const rows: PickerRow[] = [];
	const add = (kind: PickerRow["kind"], path: string) => {
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

export const Picker = ({ rows, onPick, onClose }: { rows: PickerRow[]; onPick: (path: string) => void; onClose: () => void }) => {
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
	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1}>
			<Text bold>{"Project (enter select, esc close)"}</Text>
			{rows.map((row, index) => (
				<Text key={row.id} inverse={index === cursor} wrap="truncate-start">
					{`${index === cursor ? ">" : " "} ${row.label}`}
				</Text>
			))}
		</Box>
	);
};
