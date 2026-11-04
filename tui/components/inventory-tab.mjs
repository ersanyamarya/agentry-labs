// List tab (MCP, Hooks, Plugins): rows from lib data, `e` opens the row's source file in $EDITOR.
// Plugin rows also toggle: space previews enabling or disabling the plugin, y applies (see tui/plugin-flow.mjs).

import React from "react";
import { Box, useInput } from "ink";
import { startHookRemove, startHookToggle } from "../hook-flow.mjs";
import { startMcpAdd, startMcpRemove, startMcpSet, startMcpToggle } from "../mcp-flow.mjs";
import { startPluginInstall, startPluginToggle, startPluginUninstall } from "../plugin-flow.mjs";
import { startBulk } from "../bulk-flow.mjs";
import { useList } from "../use-list.mjs";
import { useFlow } from "../use-flow.mjs";
import { Panes } from "./list.mjs";

const h = React.createElement;

export const InventoryTab = ({ data, api, dir, makeRows, active, height, layout, openFile, notify, reload, lock, setKeys, rowKeys, canAdd, canInstall, copy }) => {
	const all = React.useMemo(() => makeRows(data), [data, makeRows]);
	const list = useList({ rows: all, lock });
	const { rows, cursor, row, move } = list;
	const flow = useFlow({ lock, notify, reload, copy });
	const keys = rowKeys ? rowKeys(row) : [];
	React.useEffect(() => {
		if (active && setKeys) {
			setKeys(keys);
		}
	}, [active, keys.join()]);
	// Marked rows (m): space or x on all of them, one combined preview and one y. Each item uses the lib call of the single-row action.
	const NOTHING = { preview: () => ({ appliable: false, text: "Nothing to switch or remove on this row." }), apply: () => ({ ok: false, text: "" }) };
	const actionFor = (one, remove) => {
		if (one.hook) {
			const args = { dir, selector: one.hook, action: remove ? "remove" : one.hookOff ? "enable" : "disable", scope: one.hookScope };
			return { preview: () => api.previewHook(args), apply: () => api.applyHook(args) };
		}
		if (one.mcp) {
			const args = { dir, name: one.mcp, enable: one.mcpEnable };
			return remove ? { preview: () => api.previewMcpRemove(args), apply: () => api.applyMcpRemove(args) } : { preview: () => api.previewMcp(args), apply: () => api.applyMcp(args) };
		}
		if (one.plugin && remove) {
			const args = { dir, action: "uninstall", name: one.plugin, scope: one.pluginScopes[0] };
			return one.pluginScopes.length === 1 ? { preview: () => api.previewPluginInstall(args), apply: () => api.applyPluginInstall(args) } : { ...NOTHING, preview: () => ({ appliable: false, text: "Not installed at exactly one scope here: uninstall it on its own." }) };
		}
		if (one.plugin) {
			const args = { dir, id: one.plugin, enable: !one.enabled };
			return { preview: () => api.previewPlugin(args), apply: () => api.applyPlugin(args) };
		}
		return NOTHING;
	};
	const bulk = (remove) =>
		startBulk({ flow, title: remove ? "Remove or uninstall" : "Switch", items: list.marked, preview: (one) => actionFor(one, remove).preview(), apply: (one) => actionFor(one, remove).apply(), done: remove ? "Removed. Applies to new sessions; undo with agentry fix --undo" : "Switched. Applies to new sessions; undo with agentry fix --undo" });

	useInput(
		(input, key) => {
			if (flow.handleKey(input, key) || list.handleKey(input, key)) {
				return;
			}
			if ((input === " " || input === "x") && list.marked.length > 0) {
				bulk(input === "x");
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
	return h(Panes, { rows, cursor, height, row, lines: flow.lines, title: flow.title, layout, marked: list.markedIds, status: list.status });
};
