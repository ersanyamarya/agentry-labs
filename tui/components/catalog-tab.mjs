// Catalog tab: the agentry-labs skills by bundle. f fetches (or updates) the cached clone, i copies a skill onto the shelf
// (off), x removes an installed one. Installing and removing are previewed and wait for y.

import React from "react";
import { useInput } from "ink";
import { catalogKeys, catalogRows } from "../rows.mjs";
import { startRemove } from "../remove-flow.mjs";
import { useCursor } from "../use-cursor.mjs";
import { useFlow } from "../use-flow.mjs";
import { Panes } from "./list.mjs";

export const CatalogTab = ({ data, api, dir, active, height, layout, notify, reload, lock, setKeys }) => {
	const rows = React.useMemo(() => catalogRows(data), [data]);
	const { cursor, row, move } = useCursor(rows);
	const flow = useFlow({ lock, notify, reload });
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

	const startAdd = async () => {
		const preview = await api.addFromCatalog({ dir, names: [row.skill], dryRun: true });
		flow.begin({ kind: "confirm", title: `Add ${row.skill} to the shelf (preview)`, text: preview.text, appliable: preview.ok, apply: () => api.addFromCatalog({ dir, names: [row.skill] }), done: `Added ${row.skill} to the shelf, off. Turn it on from the Skills tab.` });
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
				row.installed ? notify(`${row.skill} is already installed (${row.installed}).`) : startAdd();
			} else if (input === "x" && row?.kind === "catalog") {
				row.installed ? startRemove({ api, dir, flow, target: row.target, label: row.target }) : notify(`${row.skill} is not installed.`);
			}
		},
		{ isActive: active },
	);

	return React.createElement(Panes, { rows, cursor, height, row, lines: flow.lines, title: flow.title, layout });
};
