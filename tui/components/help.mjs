import React from "react";
import { Box, Text } from "ink";

const h = React.createElement;

export const KEYS = [
	["← / →, 1-5", "switch tab"],
	["↑ / ↓", "move between rows"],
	["enter", "details, expand a group, preview a fix"],
	["space", "Skills: toggle the group or skill on/off"],
	["g", "Skills: switch the target between project and global"],
	["e", "MCP, Hooks, Plugins, Doctor: open the source file in $EDITOR"],
	["y / n", "Doctor: confirm or cancel a previewed fix or undo"],
	["u", "Doctor: preview undoing the last fix set"],
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
		...KEYS.map(([key, what]) => h(Text, { key }, `${key.padEnd(12)} ${what}`)),
	);
