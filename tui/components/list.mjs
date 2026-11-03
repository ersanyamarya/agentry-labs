// A scrolling list of rows beside a details pane for the selected one. Colours come from theme.mjs through useStyle,
// so NO_COLOR drops them; the selected row is inverse + bold with a ">" marker, which needs no colour.

import React from "react";
import { Box, Text } from "ink";
import { stateStyle, useStyle } from "../theme.mjs";

const h = React.createElement;

const RULE_WIDTH = 34;

export const ListPane = ({ rows, cursor, height }) => {
	const style = useStyle();
	const start = Math.max(0, Math.min(cursor - Math.floor(height / 2), rows.length - height));
	const shown = rows.slice(start, start + height);
	return h(
		Box,
		{ flexDirection: "column", width: "52%", flexShrink: 0 },
		rows.length === 0 ? h(Text, { dimColor: true }, "  (nothing here)") : null,
		...shown.map((row, index) => {
			const at = start + index;
			if (row.blank) {
				return h(Text, { key: row.id }, " ");
			}
			if (row.header) {
				return h(Text, { key: row.id, wrap: "truncate-end" }, h(Text, style({ bold: true, ...row.labelStyle }), row.label), h(Text, { dimColor: true }, ` ${"─".repeat(Math.max(3, RULE_WIDTH - row.label.length))}`));
			}
			if (at === cursor) {
				return h(Text, { key: row.id, wrap: "truncate-end", inverse: true, bold: true }, `>${row.label}${row.note ? `  ${row.note}` : ""}`);
			}
			return h(
				Text,
				{ key: row.id, wrap: "truncate-end" },
				h(Text, style(row.labelStyle), ` ${row.label}`),
				...(row.segments || row.note ? [h(Text, { key: "gap" }, "  ")] : []),
				...(row.segments ?? (row.note ? [{ text: row.note }] : [])).map((part, partIndex) => h(Text, { key: partIndex, ...style(part.style) }, part.text)),
			);
		}),
		rows.length > height ? h(Text, { dimColor: true }, `  ${cursor + 1}/${rows.length}`) : null,
	);
};

// "label: value" lines show a dim label and the value; a state value gets its badge colour.
const LABELLED = /^([a-z][a-z ]{0,18}): (.+)$/;

const DetailLine = ({ line, plain }) => {
	const style = useStyle();
	const match = plain ? undefined : LABELLED.exec(line);
	if (!match) {
		return h(Text, { wrap: plain ? "wrap" : "truncate-middle" }, line || " ");
	}
	// Explanations (why a row cannot be toggled, advice) wrap; paths and values are cut in the middle.
	return h(Text, { wrap: ["toggle", "note", "advice"].includes(match[1]) ? "wrap" : "truncate-middle" }, h(Text, { dimColor: true }, `${match[1]}: `), h(Text, style(["state", "this project", "global"].includes(match[1]) ? { ...stateStyle(match[2]), bold: true } : {}), match[2]));
};

// `lines` replaces the row's own details (a fix preview, a prompt); long text is cut to `height`.
export const DetailsPane = ({ row, lines, title = "Details", height }) => {
	const style = useStyle();
	const text = (lines ?? row?.details ?? []).map((line) => line.replaceAll("\t", "  "));
	const shown = text.length > height ? [...text.slice(0, height - 1), `… ${text.length - height + 1} more lines`] : text;
	return h(
		Box,
		{ flexDirection: "column", flexGrow: 1, flexShrink: 1, flexBasis: 0, borderStyle: "single", borderColor: style({ color: "gray" }).color, paddingX: 1 },
		h(Text, { bold: true }, title),
		...shown.map((line, index) =>
			lines && (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("---") && !line.startsWith("+++")
				? h(Text, { key: index, wrap: "wrap", ...style({ color: line.startsWith("+") ? "green" : "red" }) }, line)
				: h(DetailLine, { key: index, line, plain: Boolean(lines) }),
		),
	);
};
