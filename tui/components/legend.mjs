// One line explaining the colours: state badges and description-cost bands.

import React from "react";
import { Text } from "ink";
import { COST_LEGEND, stateStyle, useStyle } from "../theme.mjs";

const h = React.createElement;

export const Legend = () => {
	const style = useStyle();
	const word = (text, base) => h(Text, { key: text, ...style(base) }, `${text} `);
	return h(
		Text,
		{ wrap: "truncate-end" },
		h(Text, { dimColor: true }, "legend: "),
		...["on", "off", "partial"].map((state) => word(state, stateStyle(state))),
		h(Text, { dimColor: true }, " cost: "),
		...COST_LEGEND.map(([text, base]) => word(`~${text}`, base)),
	);
};
