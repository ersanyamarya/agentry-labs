// The keys that work on the current tab, then the global ones: key in bold, what it does dim.

import React from "react";
import { Text } from "ink";

const h = React.createElement;

export const GLOBAL_KEYS = [["←/→", "tabs"], ["↑/↓", "rows"], ["r", "refresh"], ["p", "project"], ["?", "help"], ["q", "quit"]];

export const Footer = ({ keys }) =>
	h(
		Text,
		{ wrap: "truncate-end" },
		...[...keys, null, ...GLOBAL_KEYS].flatMap((pair, index) =>
			pair === null ? [h(Text, { key: `bar${index}`, dimColor: true }, "│ ")] : [h(Text, { key: `k${index}`, bold: true }, pair[0]), h(Text, { key: `d${index}`, dimColor: true }, ` ${pair[1]}  `)],
		),
	);
