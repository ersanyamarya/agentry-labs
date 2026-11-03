// A scrolling list of rows and the details of the selected one. Rows are laid out in fixed columns: the name (cut in the
// middle with … when it does not fit) and then `cells` of fixed width, so state badges are always whole and line up. Colours
// come from theme.mjs through useStyle, so NO_COLOR drops them; the selected row is inverse + bold with a ">" marker.
// Beside the list from 100 columns up, under it below that (see layout.mjs).

import React from "react";
import { Box, Text } from "ink";
import { clipLines, end, middle, pad, STACKED_DETAILS_LINES } from "../layout.mjs";
import { stateStyle, useStyle } from "../theme.mjs";

const h = React.createElement;

const GAP = 2;
const cellText = (cell) => pad(cell.parts.map((part) => part.text).join(""), cell.width, cell.align);
export const rightWidth = (row) => (row.cells ?? []).reduce((total, cell, index) => total + cell.width + (index > 0 ? GAP : 0), 0);

// The row as one line of exactly `width` characters: marker, name, cells.
export const rowLine = (row, width, marker = " ") => {
	const right = rightWidth(row);
	const nameWidth = right > 0 ? Math.max(width - right - GAP - 1, 4) : width - 1;
	const name = row.cells ? pad(middle(row.label, nameWidth), nameWidth) : end(row.label, nameWidth);
	return `${marker}${name}${row.cells ? `${" ".repeat(GAP)}${row.cells.map(cellText).join(" ".repeat(GAP))}` : ""}`;
};

export const ListPane = ({ rows, cursor, height, width: boxWidth }) => {
	const width = boxWidth - 1; // one column of air before the details
	const style = useStyle();
	const start = Math.max(0, Math.min(cursor - Math.floor(height / 2), rows.length - height));
	const shown = rows.slice(start, start + height);
	return h(
		Box,
		{ flexDirection: "column", width: boxWidth, flexShrink: 0 },
		rows.length === 0 ? h(Text, { dimColor: true }, "  (nothing here)") : null,
		...shown.map((row, index) => {
			if (row.blank) {
				return h(Text, { key: row.id }, " ");
			}
			if (row.header) {
				return h(Text, { key: row.id, wrap: "truncate-end" }, h(Text, style({ bold: true, ...row.labelStyle }), row.label), h(Text, { dimColor: true }, ` ${"─".repeat(Math.max(3, Math.min(width, 40) - row.label.length - 1))}`));
			}
			if (start + index === cursor) {
				return h(Text, { key: row.id, wrap: "truncate-end", inverse: true, bold: true }, rowLine(row, width, ">"));
			}
			const right = rightWidth(row);
			const nameWidth = right > 0 ? Math.max(width - right - GAP - 1, 4) : width - 1;
			return h(
				Text,
				{ key: row.id, wrap: "truncate-end" },
				h(Text, style(row.labelStyle), ` ${row.cells ? pad(middle(row.label, nameWidth), nameWidth) : end(row.label, nameWidth)}`),
				...(row.cells ?? []).flatMap((cell, cellIndex) => {
					const used = cell.parts.reduce((total, part) => total + [...part.text].length, 0);
					const filler = Math.max(cell.width - used, 0);
					return [
						h(Text, { key: `g${cellIndex}` }, " ".repeat(GAP)),
						...(cell.align === "right" && filler > 0 ? [h(Text, { key: `l${cellIndex}` }, " ".repeat(filler))] : []),
						...cell.parts.map((part, partIndex) => h(Text, { key: `${cellIndex}.${partIndex}`, ...style(part.style) }, part.text)),
						...(cell.align !== "right" && filler > 0 ? [h(Text, { key: `r${cellIndex}` }, " ".repeat(filler))] : []),
					];
				}),
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

// `lines` replaces the row's own details (a fix preview, a prompt). Sized to its content: a box beside the list, a
// borderless block under it when stacked.
export const DetailsPane = ({ row, lines, title = "Details", height, layout }) => {
	const style = useStyle();
	const text = (lines ?? row?.details ?? []).map((line) => line.replaceAll("\t", "  "));
	const stacked = layout.stacked;
	const shown = clipLines(text, stacked ? (lines ? 16 : STACKED_DETAILS_LINES) : Math.max(height, 8));
	const body = [h(Text, { key: "title", bold: true }, title), ...shown.map((line, index) => (lines && (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("---") && !line.startsWith("+++") ? h(Text, { key: index, wrap: "wrap", ...style({ color: line.startsWith("+") ? "green" : "red" }) }, line) : h(DetailLine, { key: index, line, plain: Boolean(lines) })))];
	return stacked
		? h(Box, { flexDirection: "column", width: layout.cols, marginTop: 1 }, h(Text, { dimColor: true }, "─".repeat(layout.cols)), ...body)
		: h(Box, { flexDirection: "column", width: layout.detailsWidth, flexShrink: 0, alignSelf: "flex-start", borderStyle: "single", borderColor: style({ color: "gray" }).color, paddingX: 1 }, ...body);
};

// List and details together, side by side or stacked depending on the width.
export const Panes = ({ rows, cursor, height, row, lines, title, layout }) =>
	h(Box, { flexDirection: layout.stacked ? "column" : "row" }, h(ListPane, { rows, cursor, height, width: layout.listWidth }), h(DetailsPane, { row, lines, title, height, layout }));
