import React from "react";
import { Box, Text } from "ink";

const h = React.createElement;

export const KEYS = [
	["← / →, 1-6", "switch tab"],
	["↑ / ↓", "move between rows"],
	["enter", "details, expand a group, preview a fix"],
	["space", "Skills: shelf row on/off for this project; plugin rows: on/off; MCP: turn off (saved) / add back"],
	["g", "Skills: shelf row on/off globally"],
	["s", "Skills: move a global skill onto the shelf"],
	["u", "Skills: unshelve a skill; Doctor: undo the last fix set"],
	["x", "Skills, Catalog: remove a skill (a copy is kept in the backups)"],
	["i", "Catalog: add the selected skill to the shelf (off)"],
	["f", "Catalog: fetch or update the agentry-labs catalog"],
	["e", "open the selected row's file in $EDITOR"],
	["y / n", "confirm or cancel a previewed fix, undo, shelve or plugin change"],
	["r", "refresh"],
	["p", "switch project"],
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
