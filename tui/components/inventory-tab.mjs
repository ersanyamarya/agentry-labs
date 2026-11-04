// List tab (MCP, Hooks, Plugins): rows from lib data, `e` opens the row's source file in $EDITOR.
// Plugin rows also toggle: space previews enabling or disabling the plugin, y applies (see tui/plugin-flow.mjs).

import React from "react";
import { Box, useInput } from "ink";
import { startHookRemove, startHookToggle } from "../hook-flow.mjs";
import { startMcpAdd, startMcpRemove, startMcpSet, startMcpToggle } from "../mcp-flow.mjs";
import { startPluginInstall, startPluginToggle, startPluginUninstall } from "../plugin-flow.mjs";
import { useCursor } from "../use-cursor.mjs";
import { useFlow } from "../use-flow.mjs";
import { Panes } from "./list.mjs";

const h = React.createElement;

export const InventoryTab = ({ data, api, dir, makeRows, active, height, layout, openFile, notify, reload, lock, setKeys, rowKeys, canAdd, canInstall, copy }) => {
	const rows = React.useMemo(() => makeRows(data), [data, makeRows]);
	const { cursor, row, move } = useCursor(rows);
	const flow = useFlow({ lock, notify, reload, copy });
	const keys = rowKeys ? rowKeys(row) : [];
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
			} else if (input === "i" && canInstall) {
				startPluginInstall({ api, dir, flow });
			} else if (input === "x" && row?.plugin) {
				row.pluginScopes.length > 0 ? startPluginUninstall({ api, dir, flow, row }) : notify("Not installed for this project: nothing to uninstall here.");
			} else if (input === "a" && canAdd) {
				startMcpAdd({ api, dir, flow });
			} else if (input === "s" && row?.mcpUser) {
				startMcpSet({ api, dir, flow, row });
			} else if (input === " " && row?.hook) {
				startHookToggle({ api, dir, flow, row });
			} else if (input === "x" && row?.hook) {
				startHookRemove({ api, dir, flow, row });
			} else if (input === "x" && row?.mcp) {
				startMcpRemove({ api, dir, flow, row });
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
