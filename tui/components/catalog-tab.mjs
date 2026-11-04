// Catalog tab: the agentry-labs skills (by bundle), agents, rules, CLAUDE.md files and MCP servers. f fetches (or updates)
// the cached clone, i installs the selected item (o: into this project, for agents and MCP servers), u overwrites an
// outdated installed one with the catalog's copy, x removes an installed skill. Each is previewed and waits for y.

import React from "react";
import { useInput } from "ink";
import { catalogKeys, catalogRows } from "../rows.mjs";
import { startRemove } from "../remove-flow.mjs";
import { useCursor } from "../use-cursor.mjs";
import { useFlow } from "../use-flow.mjs";
import { Panes } from "./list.mjs";

export const CatalogTab = ({ data, api, dir, active, height, layout, notify, reload, lock, setKeys, copy }) => {
	const rows = React.useMemo(() => catalogRows(data), [data]);
	const { cursor, row, move } = useCursor(rows);
	const flow = useFlow({ lock, notify, reload, copy });
	const keys = catalogKeys(row);
	React.useEffect(() => {
		if (active) {
			setKeys(keys);
		}
	}, [active, keys.join()]);

	const fetchCatalog = async () => {
		notify("Fetching the catalog...");
		const result = await api.refreshCatalog({ dir });
		notify(result.ok ? result.text : "");
		flow.begin(result.ok ? null : { kind: "result", ok: false, text: result.text });
		await reload();
	};

	const DONE = { skill: "to the shelf, off. Turn it on from the Skills tab", agent: "as an agent", rule: "to ~/.claude/rules", "claude-md": "as this project's CLAUDE.md", mcp: "as an MCP server. It applies to sessions started after this" };
	const nameOf = () => row.item.slice(row.item.indexOf("/") + 1);

	const startAdd = async (project) => {
		const names = [row.item];
		const preview = await api.addFromCatalog({ dir, names, project, dryRun: true });
		flow.begin({ kind: "confirm", title: row.itemKind === "skill" ? `Add ${nameOf()} to the shelf (preview)` : `Add ${row.item}${project ? " to this project" : ""} (preview)`, text: preview.text, appliable: preview.ok, apply: () => api.addFromCatalog({ dir, names, project }), done: `Added ${nameOf()} ${DONE[row.itemKind]}.` });
	};

	const startUpdate = async () => {
		const names = [row.item];
		const preview = await api.updateFromCatalog({ dir, names, dryRun: true });
		flow.begin({ kind: "confirm", title: `Update ${row.item} (preview)`, text: preview.text, appliable: preview.ok, apply: () => api.updateFromCatalog({ dir, names }), done: `Updated ${row.item}; the old copy is in ~/.claude/backups/agentry/updated/.` });
	};

	useInput(
		(input, key) => {
			if (flow.handleKey(input, key)) {
				return;
			}
			if (key.upArrow || key.downArrow) {
				flow.clear();
				move(key.upArrow ? -1 : 1);
			} else if (input === "f") {
				fetchCatalog();
			} else if (input === "i" && row?.kind === "catalog") {
				row.itemKind === "skill" && row.installed ? notify(`${row.item} is already installed (${row.installed}).`) : startAdd(false);
			} else if (input === "o" && row?.kind === "catalog") {
				row.itemKind === "agent" || row.itemKind === "mcp" ? startAdd(true) : notify("o adds an agent or an MCP server to this project only; use i for this item.");
			} else if (input === "u" && row?.kind === "catalog") {
				row.outdated ? startUpdate() : notify(row.installed ? `${row.item} is up to date.` : `${row.item} is not installed.`);
			} else if ((input === "x" || input === "X") && row?.kind === "catalog") {
				row.itemKind !== "skill" ? notify("x removes skills here; remove a rule from the Rules tab, an MCP server from the MCP tab.") : row.installed ? startRemove({ api, dir, flow, backup: input === "x", target: row.target, label: row.target }) : notify(`${row.item} is not installed.`);
			}
		},
		{ isActive: active },
	);

	return React.createElement(Panes, { rows, cursor, height, row, lines: flow.lines, title: flow.title, layout });
};
