import React from "react";
import { Box, Text } from "ink";

const h = React.createElement;

export const KEYS = [
	["← / →, 1-5", "switch tab"],
	["↑ / ↓", "move between rows"],
	["enter", "details, expand a group, preview a fix"],
	["space", "Skills: toggle a shelf row (P); plugin rows: on/off; MCP: park / add back"],
	["s", "Skills: move a personal skill onto the shelf"],
	["u", "Skills: unshelve a skill; Doctor: undo the last fix set"],
	["G", "Skills: toggle a shelf row globally (G)"],
	["e", "MCP, Hooks, Plugins, Doctor: open the source file in $EDITOR"],
	["y / n", "confirm or cancel a previewed fix, undo, shelve or plugin change"],
	["r", "refresh"],
	["p", "project picker"],
	["?", "this help"],
	["q", "quit"],
];

export const Help = () =>
	h(
		Box,
		{ flexDirection: "column", borderStyle: "round", paddingX: 1 },
		h(Text, { bold: true }, "Keys (? or esc to close)"),
		...KEYS.map(([key, what]) => h(Text, { key, wrap: "truncate-end" }, h(Text, { bold: true }, key.padEnd(12)), h(Text, null, ` ${what}`))),
		h(Text, null, " "),
		h(Text, { dimColor: true }, "● on / active green, ○ off / disabled gray, ◐ partial yellow. Cost: dim < 100, yellow < 500, red 500+."),
		h(Text, { dimColor: true }, "No colour: set NO_COLOR. Plugin changes apply to new sessions (undo: agentry fix --undo)."),
	);
