import React from "react";
import { Box, Text } from "ink";

const h = React.createElement;

export const TAB_NAMES = ["Skills", "MCP", "Hooks", "Plugins", "Doctor"];

export const TabBar = ({ tab, project, counts = {} }) =>
	h(
		Box,
		{ flexDirection: "column" },
		h(Text, { wrap: "truncate-start", dimColor: true }, `agentry  ${project}`),
		h(
			Box,
			{ gap: 2 },
			...TAB_NAMES.map((name, index) =>
				h(Text, { key: name, inverse: index === tab, bold: index === tab }, ` ${index + 1} ${name}${counts[name] === undefined ? "" : ` (${counts[name]})`} `),
			),
		),
	);
