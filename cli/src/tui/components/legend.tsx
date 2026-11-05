// @ts-nocheck
// One line explaining the colours: state badges and description-cost bands.

import React from "react";
import { Text } from "ink";
import { badgeText, COST_LEGEND, stateStyle, useStyle } from "../theme.js";

const h = React.createElement;

export const Legend = () => {
	const style = useStyle();
	const word = (text, base) => h(Text, { key: text, ...style(base) }, `${text} `);
	return h(
		Text,
		{ wrap: "truncate-end" },
		...["on", "off", "partial"].map((state) => h(Text, { key: state, ...style({ ...stateStyle(state), bold: true }) }, `${badgeText(state)} `)),
		h(Text, { dimColor: true }, " cost: "),
		...COST_LEGEND.map(([text, base]) => word(`~${text}`, base)),
	);
};
