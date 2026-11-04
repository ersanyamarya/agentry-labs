import React from "react";
import { Box, Text } from "ink";

const h = React.createElement;

export const KEYS = [
	["← / →, 1-8", "switch tab"],
	["↑ / ↓", "move between rows"],
	["enter", "details, expand a group, preview a fix"],
	["space", "Skills: shelf row on/off for this project; plugin rows: on/off; MCP, Hooks: turn off (saved) / add back"],
	["a", "MCP: add a server (user or project scope)"],
	["g", "Skills: shelf row on/off globally"],
	["s", "Skills: move a global skill onto the shelf; MCP: edit env/args of a user server"],
	["a", "Skills: move a project-only skill to ~/.claude/skills (all projects)"],
	["o", "Skills: move a global skill into this project only; Catalog: add an agent or MCP server to this project only"],
	["u", "Skills: unshelve a skill; Doctor: undo the last fix set; Backups: restore a removed skill; Catalog: update an outdated item"],
	["x", "Skills, Catalog: remove a skill (a copy is kept in the backups); Rules: remove a file; Backups: delete a backup; MCP, Hooks: remove; Plugins: uninstall"],
	["X", "Skills, Catalog, Rules: remove and keep no copy"],
	["d", "Backups: delete the backups 30+ days old"],
	["i", "Catalog: add the selected skill (to the shelf, off), agent, rule, CLAUDE.md or MCP server; Plugins: install a plugin"],
	["f", "Catalog: fetch or update the agentry-labs catalog"],
	["/", "search the rows of the current tab: type, enter keeps it, esc clears it (q and tab keys are text while typing)"],
	["m / M", "mark or unmark the selected row / clear marks; space, g, x, X, i, u then apply to all marked rows, one preview, one y"],
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
		h(Text, { dimColor: true }, "* marks a row. Skills > Token total: description tokens per global, this project, plugins. No colour: set NO_COLOR. Plugin changes apply to new sessions (undo: agentry fix --undo)."),
	);
