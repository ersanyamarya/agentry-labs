// Top of the screen: project path, the tabs with their counts, and a summary line (skill-description tokens, problems).

import React from "react";
import { Box, Text } from "ink";
import { badgeText, stateStyle, useStyle } from "../theme.mjs";

const h = React.createElement;

export const TAB_NAMES = ["Skills", "MCP", "Hooks", "Plugins", "Doctor", "Catalog", "Backups"];

const problems = ({ error = 0, warning = 0 }) => (error + warning === 0 ? { text: "no problems", color: "green" } : { text: `${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"}`, color: error > 0 ? "red" : "yellow" });

// Counts and problems first when the width is short; the full wording from 100 columns.
export const TabBar = ({ tab, project, counts = {}, summary, cols = 100 }) => {
	const style = useStyle();
	const found = summary && problems(summary);
	const full = cols >= 100;
	const on = { ...stateStyle("active"), bold: true };
	const off = { ...stateStyle("disabled"), bold: true };
	return h(
		Box,
		{ flexDirection: "column" },
		h(Text, { wrap: "truncate-middle", dimColor: true }, `agentry  ${project}`),
		h(
			Box,
			{ gap: full ? 2 : 1 },
			...TAB_NAMES.map((name, index) => {
				const label = `${index + 1} ${name}${counts[name] === undefined ? "" : ` (${counts[name]})`}`;
				return h(Text, { key: name, inverse: index === tab, bold: index === tab, wrap: "truncate" }, full ? ` ${label} ` : label);
			}),
		),
		summary
			? full
				? h(Text, { wrap: "truncate-end" }, h(Text, { dimColor: true }, `~${summary.tokens} skill-description tokens  ·  plugins `), h(Text, style(on), `${summary.active} ${badgeText("active")}`), " ", h(Text, style(off), `${summary.disabled} ${badgeText("disabled")}`), h(Text, { dimColor: true }, "  ·  "), h(Text, style({ color: found.color }), found.text))
				: h(Text, { wrap: "truncate-end" }, h(Text, style({ color: found.color }), found.text), h(Text, { dimColor: true }, `  ·  ~${summary.tokens} tokens  ·  plugins `), h(Text, style(on), `${summary.active}●`), " ", h(Text, style(off), `${summary.disabled}○`))
			: null,
	);
};
