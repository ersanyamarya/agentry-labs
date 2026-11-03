// List tab (MCP, Hooks, Plugins): rows from lib data, `e` opens the row's source file in $EDITOR.
// Plugin rows also toggle: space previews enabling or disabling the plugin, y applies (see tui/plugin-flow.mjs).

import React from "react";
import { Box, useInput } from "ink";
import { startMcpToggle } from "../mcp-flow.mjs";
import { startPluginToggle } from "../plugin-flow.mjs";
import { mcpKeys } from "../rows.mjs";
import { useCursor } from "../use-cursor.mjs";
import { useFlow } from "../use-flow.mjs";
import { Panes } from "./list.mjs";

const h = React.createElement;

export const InventoryTab = ({ data, api, dir, makeRows, active, height, layout, openFile, notify, reload, lock, setKeys }) => {
	const rows = React.useMemo(() => makeRows(data), [data, makeRows]);
	const { cursor, row, move } = useCursor(rows);
	const flow = useFlow({ lock, notify, reload });
	const keys = setKeys ? mcpKeys(row) : [];
	React.useEffect(() => {
		if (active && setKeys) {
			setKeys(keys);
		}
	}, [active, keys.join()]);
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
			} else if (input === " " && row?.mcp) {
				startMcpToggle({ api, dir, flow, row });
			} else if (input === " " && row?.why) {
				notify(row.why);
			}
		},
		{ isActive: active },
	);
	return h(Panes, { rows, cursor, height, row, lines: flow.lines, title: flow.title, layout });
};
