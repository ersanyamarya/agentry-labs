// Top of the screen: project path, the tabs with their counts, and a summary line (skill-description tokens, problems).

import React from "react";
import { Box, Text } from "ink";
import { badgeText, stateStyle, useStyle } from "../theme.mjs";

const h = React.createElement;

export const TAB_NAMES = ["Skills", "MCP", "Hooks", "Plugins", "Doctor"];

const problems = ({ error = 0, warning = 0 }) => (error + warning === 0 ? { text: "no problems", color: "green" } : { text: `${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"}`, color: error > 0 ? "red" : "yellow" });

export const TabBar = ({ tab, project, counts = {}, summary }) => {
	const style = useStyle();
	const found = summary && problems(summary);
	return h(
		Box,
		{ flexDirection: "column" },
		h(Text, { wrap: "truncate-middle", dimColor: true }, `agentry  ${project}`),
		h(
			Box,
			{ gap: 2 },
			...TAB_NAMES.map((name, index) =>
				h(Text, { key: name, inverse: index === tab, bold: index === tab }, ` ${index + 1} ${name}${counts[name] === undefined ? "" : ` (${counts[name]})`} `),
			),
		),
		summary ? h(Text, { wrap: "truncate-end" }, h(Text, { dimColor: true }, `~${summary.tokens} skill-description tokens  ·  plugins `), h(Text, style({ ...stateStyle("active"), bold: true }), `${summary.active} ${badgeText("active")}`), " ", h(Text, style({ ...stateStyle("disabled"), bold: true }), `${summary.disabled} ${badgeText("disabled")}`), h(Text, { dimColor: true }, "  ·  "), h(Text, style({ color: found.color }), found.text)) : null,
	);
};
