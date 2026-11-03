// Skills tab: shelf groups (expand to skills, toggle on/off for this project or globally) and what else loads.

import React from "react";
import { Box, Text, useInput } from "ink";
import { skillRows } from "../rows.mjs";
import { useCursor } from "../use-cursor.mjs";
import { useFlow } from "../use-flow.mjs";
import { DetailsPane, ListPane } from "./list.mjs";

const h = React.createElement;

export const SkillsTab = ({ data, api, dir, active, height, notify, reload, lock }) => {
	const [expanded, setExpanded] = React.useState(() => new Set());
	const [global, setGlobal] = React.useState(false);
	const rows = React.useMemo(() => skillRows(data, expanded), [data, expanded]);
	const { cursor, row, move } = useCursor(rows);

	const flow = useFlow({ lock, notify, reload });

	const badName = (name) => (name === "" || name.includes("/") || name.startsWith(".") || name === "agents" ? `Not a usable group name: "${name}" (no slash, no leading dot, not "agents")` : undefined);

	// shelve: choose a group (or type a new one), preview with the shelf's own dry run, move on y.
	const previewShelve = async (skill, group) => {
		const preview = await api.shelveSkill({ dir, skill, group, dryRun: true });
		return { kind: "confirm", title: "Shelve preview (dry run)", text: preview.text, appliable: preview.ok, apply: () => api.shelveSkill({ dir, skill, group }), done: `Shelved ${skill} into ${group}; it is off, toggle it with space.` };
	};
	const startShelve = () => {
		const groups = data.groups.map((group) => group.name);
		const typeName = () => ({
			kind: "name",
			title: `Shelve ${row.skill}: new group`,
			label: "Group name",
			intro: ["Type the name of the new shelf group."],
			onSubmit: (name) => (badName(name) ? { kind: "result", ok: false, text: badName(name) } : previewShelve(row.skill, name)),
		});
		flow.begin(
			groups.length === 0
				? typeName()
				: { kind: "pick", title: `Shelve ${row.skill}: choose a group`, intro: [`Move ${row.skill} onto the shelf in which group?`], options: groups, onPick: (group) => previewShelve(row.skill, group), onNew: typeName },
		);
	};
	const startUnshelve = async () => {
		const target = `${row.group}/${row.skill}`;
		const preview = await api.unshelveSkill({ dir, target, dryRun: true });
		flow.begin({ kind: "confirm", title: "Unshelve preview (dry run)", text: preview.text, appliable: preview.ok, apply: () => api.unshelveSkill({ dir, target }), done: `Unshelved ${target} into ~/.claude/skills.` });
	};

	const toggle = async () => {
		if (row?.why) {
			notify(row.why);
			return;
		}
		if (row?.kind === "agent") {
			notify("Agents switch with their group: toggle the group row.");
			return;
		}
		if (row?.kind !== "group" && row?.kind !== "skill") {
			return;
		}
		const on = !(global ? row.globalOn : row.projectOn);
		const result = await api.toggleShelf({ dir, target: row.target, on, global });
		notify(result.message);
		await reload();
	};

	useInput(
		(input, key) => {
			if (flow.handleKey(input, key)) {
				return;
			}
			if (key.upArrow || key.downArrow) {
				flow.clear();
				move(key.upArrow ? -1 : 1);
			} else if (input === "s") {
				if (row?.shelvable) {
					startShelve();
				} else {
					notify(row?.kind === "personal" ? row.why : row?.kind === "skill" ? "Already on the shelf; press u to move it back to ~/.claude/skills." : "s shelves a personal skill: select one under Personal skills.");
				}
			} else if (input === "u") {
				row?.kind === "skill" ? startUnshelve() : notify("u unshelves a shelved skill: expand a group and select one.");
			} else if (key.return && row?.kind === "group") {
				setExpanded((open) => {
					const next = new Set(open);
					next.has(row.group) ? next.delete(row.group) : next.add(row.group);
					return next;
				});
			} else if (input === " ") {
				toggle();
			} else if (input === "g") {
				setGlobal((value) => !value);
			}
		},
		{ isActive: active },
	);

	return h(
		Box,
		{ flexDirection: "column" },
		h(Text, null, `Toggle target: `, h(Text, { bold: true, color: "cyan" }, global ? "global (config dir)" : "this project"), h(Text, { dimColor: true }, `  (g to switch)  ~${data.status.tokens.measured} tokens of skill descriptions load in every session`)),
		h(Box, null, h(ListPane, { rows, cursor, height }), h(DetailsPane, { row, lines: flow.lines, title: flow.title, height })),
	);
};
