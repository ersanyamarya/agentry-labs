// The keys that work on the current tab, then the global ones: key in bold, what it does dim. Each key is
// [key, text, short?]; the longest form that fits the width is used, so the footer is one line at every width.

import React from "react";
import { Text } from "ink";

const h = React.createElement;

export const GLOBAL_KEYS = [["←/→", "tabs"], ["↑/↓", "rows"], ["r", "refresh"], ["p", "switch project"], ["?", "help"], ["q", "quit"]];
const CORE_KEYS = [["?", "help"], ["q", "quit"]];
const SHORT_GLOBAL = [["←→", "tabs"], ["?", "help"], ["q", "quit"]];

const width = (pairs) => pairs.reduce((total, [key, text]) => total + [...key].length + [...text].length + 3, 0);
const shortForm = (keys) => keys.map(([key, text, short]) => [key, short ?? text]);

// Longest first: everything; short tab keys with the usual global keys; short tab keys with tabs/help/quit; only help/quit.
export const footerKeys = (keys, cols) => {
	const tries = [[...keys, ...GLOBAL_KEYS], [...shortForm(keys), ...SHORT_GLOBAL], [...shortForm(keys), ...CORE_KEYS], CORE_KEYS];
	const split = (list) => list.findIndex((pair) => pair === GLOBAL_KEYS[0] || pair === SHORT_GLOBAL[0] || pair === CORE_KEYS[0]);
	const chosen = tries.find((list) => width(list) + 2 <= cols) ?? CORE_KEYS;
	return { list: chosen, divider: Math.max(split(chosen), 0) };
};

export const Footer = ({ keys, cols = 100 }) => {
	const { list, divider } = footerKeys(keys, cols);
	return h(
		Text,
		{ wrap: "truncate-end" },
		...list.flatMap((pair, index) => [...(index === divider && index > 0 ? [h(Text, { key: `bar${index}`, dimColor: true }, "│ ")] : []), h(Text, { key: `k${index}`, bold: true }, pair[0]), h(Text, { key: `d${index}`, dimColor: true }, ` ${pair[1]}  `)]),
	);
};
