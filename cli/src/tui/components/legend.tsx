// One line explaining the colours: state badges and description-cost bands.

import { Text } from "ink";
import { badgeText, COST_LEGEND, stateStyle, useStyle } from "../theme.js";

export const Legend = () => {
	const style = useStyle();
	return (
		<Text wrap="truncate-end">
			{["on", "off", "partial"].map((state) => (
				<Text key={state} {...style({ ...stateStyle(state), bold: true })}>
					{`${badgeText(state)} `}
				</Text>
			))}
			<Text dimColor>{" cost: "}</Text>
			{COST_LEGEND.map(([text, base]) => (
				<Text key={text} {...style(base)}>
					{`~${text} `}
				</Text>
			))}
		</Text>
	);
};
