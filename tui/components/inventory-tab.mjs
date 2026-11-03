// Read-only list tab (MCP, Hooks, Plugins): rows from lib data, `e` opens the row's source file in $EDITOR.

import React from "react";
import { Box, useInput } from "ink";
import { useCursor } from "../use-cursor.mjs";
import { DetailsPane, ListPane } from "./list.mjs";

const h = React.createElement;

export const InventoryTab = ({ data, makeRows, active, height, openFile }) => {
	const rows = React.useMemo(() => makeRows(data), [data, makeRows]);
	const { cursor, row, move } = useCursor(rows);
	useInput(
		(input, key) => {
			if (key.upArrow) {
				move(-1);
			} else if (key.downArrow) {
				move(1);
			} else if (input === "e") {
				openFile(row?.file);
			}
		},
		{ isActive: active },
	);
	return h(Box, null, h(ListPane, { rows, cursor, height }), h(DetailsPane, { row, height }));
};
