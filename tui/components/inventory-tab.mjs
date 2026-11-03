// List tab (MCP, Hooks, Plugins): rows from lib data, `e` opens the row's source file in $EDITOR.
// Plugin rows also toggle: space previews enabling or disabling the plugin, y applies (see tui/plugin-flow.mjs).

import React from "react";
import { Box, useInput } from "ink";
import { startPluginToggle } from "../plugin-flow.mjs";
import { useCursor } from "../use-cursor.mjs";
import { useFlow } from "../use-flow.mjs";
import { DetailsPane, ListPane } from "./list.mjs";

const h = React.createElement;

export const InventoryTab = ({ data, api, dir, makeRows, active, height, openFile, notify, reload, lock }) => {
	const rows = React.useMemo(() => makeRows(data), [data, makeRows]);
	const { cursor, row, move } = useCursor(rows);
	const flow = useFlow({ lock, notify, reload });
	useInput(
		(input, key) => {
			if (flow.handleKey(input, key)) {
				return;
			}
			if (key.upArrow || key.downArrow) {
				flow.clear();
				move(key.upArrow ? -1 : 1);
			} else if (input === "e") {
				openFile(row?.file);
			} else if (input === " " && row?.plugin) {
				startPluginToggle({ api, dir, flow, row });
			}
		},
		{ isActive: active },
	);
	return h(Box, null, h(ListPane, { rows, cursor, height }), h(DetailsPane, { row, lines: flow.lines, title: flow.title, height }));
};
