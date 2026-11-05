// @ts-nocheck
// Top of the screen: project path, the tabs with their counts, and a summary line (skill-description tokens, problems).

import React from "react";
import { Box, Text } from "ink";
import { badgeText, stateStyle, useStyle } from "../theme.js";

const h = React.createElement;

export const TAB_NAMES = ["Skills", "MCP", "Hooks", "Plugins", "Doctor", "Catalog", "Backups", "Rules"];

// Which tabs get their count first when the width is short.
const COUNT_PRIORITY = ["Skills", "Catalog", "Backups", "MCP", "Plugins", "Doctor", "Hooks", "Rules"];

const problems = ({ error = 0, warning = 0 }) => (error + warning === 0 ? { text: "no problems", color: "green" } : { text: `${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"}`, color: error > 0 ? "red" : "yellow" });

// Counts and problems first when the width is short; the full wording from 100 columns.
export const TabBar = ({ tab, project, counts = {}, summary, cols = 100 }) => {
	const style = useStyle();
	const found = summary && problems(summary);
	const full = cols >= 100;
	// Eight tabs do not all fit with counts below about 120 columns: tighten the spacing, then show counts only where they fit.
	const label = (name, index, shown) => `${index + 1} ${name}${shown.has(name) && counts[name] !== undefined ? ` (${counts[name]})` : ""}`;
	const widthOf = (shown, chrome) => TAB_NAMES.reduce((total, name, index) => total + [...label(name, index, shown)].length + chrome, 0);
	const roomy = full && widthOf(new Set(TAB_NAMES), 4) <= cols;
	const chrome = roomy ? 4 : full ? 3 : 1;
	const shown = new Set();
	for (const name of COUNT_PRIORITY) {
		if (widthOf(new Set([...shown, name]), chrome) <= cols) {
			shown.add(name);
		}
	}
	const on = { ...stateStyle("active"), bold: true };
	const off = { ...stateStyle("disabled"), bold: true };
	return h(
		Box,
		{ flexDirection: "column" },
		h(Text, { wrap: "truncate-middle", dimColor: true }, `agentry  ${project}`),
		h(
			Box,
			{ gap: roomy ? 2 : 1 },
			...TAB_NAMES.map((name, index) => {
				const text = label(name, index, shown);
				return h(Text, { key: name, inverse: index === tab, bold: index === tab, wrap: "truncate" }, full ? ` ${text} ` : text);
			}),
		),
		summary
			? full
				? h(Text, { wrap: "truncate-end" }, h(Text, { dimColor: true }, `~${summary.tokens} skill-description tokens  ·  plugins `), h(Text, style(on), `${summary.active} ${badgeText("active")}`), " ", h(Text, style(off), `${summary.disabled} ${badgeText("disabled")}`), h(Text, { dimColor: true }, "  ·  "), h(Text, style({ color: found.color }), found.text))
				: h(Text, { wrap: "truncate-end" }, h(Text, style({ color: found.color }), found.text), h(Text, { dimColor: true }, `  ·  ~${summary.tokens} tokens  ·  plugins `), h(Text, style(on), `${summary.active}●`), " ", h(Text, style(off), `${summary.disabled}○`))
			: null,
	);
};
