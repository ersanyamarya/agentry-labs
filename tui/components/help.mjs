import React from "react";
import { Box, Text } from "ink";

const h = React.createElement;

export const KEYS = [
	["← / →, 1-7", "switch tab"],
	["↑ / ↓", "move between rows"],
	["enter", "details, expand a group, preview a fix"],
	["space", "Skills: shelf row on/off for this project; plugin rows: on/off; MCP: turn off (saved) / add back"],
	["g", "Skills: shelf row on/off globally"],
	["s", "Skills: move a global skill onto the shelf"],
	["u", "Skills: unshelve a skill; Doctor: undo the last fix set; Backups: restore a removed skill"],
	["x", "Skills, Catalog: remove a skill (a copy is kept in the backups); Backups: delete a backup"],
	["X", "Skills, Catalog: remove a skill and keep no copy"],
	["d", "Backups: delete the backups 30+ days old"],
	["i", "Catalog: add the selected skill to the shelf (off)"],
	["f", "Catalog: fetch or update the agentry-labs catalog"],
	["e", "open the selected row's file in $EDITOR"],
	["y / n", "confirm or cancel a previewed change; c copies the preview"],
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
