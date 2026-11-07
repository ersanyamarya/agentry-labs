// A scrolling list of rows and the details of the selected one. Rows are laid out in fixed columns: an optional state
// mark (rows with `state`: one coloured mark, the whole row dim when off, a STATE word column under NO_COLOR), the name
// (cut in the middle with … when it does not fit) and then `cells` of fixed width, so columns always line up. Section
// headers are bold words with no rule; a list taller than its box ends in `↓ N more`. Colours come from theme.ts
// through useStyle, so NO_COLOR drops them; the selected row is inverse + bold with a ">" marker. The details sit beside
// the list from 110 columns up, under it (paired, short) below that (see layout.ts).

import { Box } from "ink";
import React from "react";
import {
  clipLines,
  end,
  middle,
  pad,
  STACKED_DETAILS_LINES,
} from "../layout.js";
import {
  seg,
  stateMark,
  stateStyle,
  ThemeContext,
  useStyle,
} from "../theme.js";
import type { Cell, Layout, Row, Seg } from "../types.js";
import { Busy } from "./busy.js";
import { Text } from "./text.js";

const GAP = 2;
// A part's text: colour off draws its `plain` form when it has one.
const partText = (part: Seg, color: boolean) =>
  color ? part.text : (part.plain ?? part.text);
// The label cut into the runs the row asks for (`labelRuns`); one plain part when it asks for none.
const labelParts = (text: string, row: Row) => {
  const chars = [...text];
  let at = 0;
  const parts = (row.labelRuns ?? []).map(({ len, style: runStyle }) => {
    const run = {
      at,
      text: chars.slice(at, at + len).join(""),
      style: runStyle,
    };
    at += len;
    return run;
  });
  return [
    ...parts,
    { at, text: chars.slice(at).join(""), style: undefined },
  ].filter((part) => part.text !== "");
};
const cellText = (cell: Cell, color = true) =>
  pad(
    cell.parts.map((part) => partText(part, color)).join(""),
    cell.width,
    cell.align
  );
export const rightWidth = (row: Pick<Row, "cells">) =>
  (row.cells ?? []).reduce(
    (total, cell, index) => total + cell.width + (index > 0 ? GAP : 0),
    0
  );

// Under NO_COLOR a row with a `state` ends in a STATE column holding the word, so the state never rests on colour alone.
// A header row's word (the column name) is dim.
const STATE_WIDTH = 8;
const withStateCell = (row: Row, color: boolean): Row =>
  row.state === undefined || color
    ? row
    : {
        ...row,
        cells: [
          ...(row.cells ?? []),
          {
            align: "left",
            width: STATE_WIDTH,
            parts: [
              seg(
                end(row.state, STATE_WIDTH),
                row.header ? { dimColor: true } : stateStyle(row.state)
              ),
            ],
          },
        ],
      };
// A row with a `state` gives two columns (mark and space) of its name width to the mark.
const nameText = (row: Row, width: number) => {
  const right = rightWidth(row);
  const lead = row.state === undefined ? 0 : 2;
  const nameWidth =
    right > 0 ? Math.max(width - right - GAP - 1 - lead, 4) : width - 1 - lead;
  return row.cells
    ? pad(middle(row.label, nameWidth), nameWidth)
    : end(row.label, nameWidth);
};
const markText = (row: Row) =>
  row.state === undefined ? "" : `${stateMark(row.state).mark} `;

// The row as one line of exactly `width` characters: marker, state mark (rows with `state`), name, cells, and the STATE
// word when colour is off.
export const rowLine = (
  stated: Row,
  width: number,
  marker = " ",
  color = true
) => {
  const row = withStateCell(stated, color);
  return `${marker}${markText(row)}${nameText(row, width)}${row.cells ? `${" ".repeat(GAP)}${row.cells.map((cell) => cellText(cell, color)).join(" ".repeat(GAP))}` : ""}`;
};

interface ListPaneProps {
  cursor: number;
  height: number;
  marked?: Set<string>;
  rows: Row[];
  status?: string;
  width: number;
}

// `marked` (a Set of row ids) puts a * before marked rows (the selected row keeps its >; the status line counts the marks); `status` is a dim line under the list (filter, marks).
export const ListPane = ({
  rows,
  cursor,
  height,
  width: boxWidth,
  marked,
  status,
}: ListPaneProps) => {
  const width = boxWidth - 1; // one column of air before the details
  const style = useStyle();
  const { color } = React.useContext(ThemeContext);
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), rows.length - height)
  );
  const shown = rows.slice(start, start + height);
  return (
    <Box flexDirection="column" flexShrink={0} width={boxWidth}>
      {rows.length === 0 ? <Text dimColor>{"  (nothing here)"}</Text> : null}
      {shown.map((stated, index) => {
        const row = withStateCell(stated, color);
        const mark = row.state === undefined ? undefined : stateMark(row.state);
        if (row.blank) {
          return <Text key={row.id}> </Text>;
        }
        if (row.header && !row.cells) {
          return (
            <Text key={row.id} wrap="truncate-end">
              <Text {...style({ bold: true, ...row.labelStyle })}>
                {row.label}
              </Text>
            </Text>
          );
        }
        if (start + index === cursor) {
          return (
            <Text bold inverse key={row.id} wrap="truncate-end">
              {rowLine(stated, width, ">", color)}
            </Text>
          );
        }
        const marker = marked?.has(row.id) ? "*" : " ";
        // Off, disabled and parked rows are dim from the mark to the last cell.
        if (mark?.dim) {
          return (
            <Text dimColor key={row.id} wrap="truncate-end">
              {rowLine(stated, width, marker, color)}
            </Text>
          );
        }
        const labelStyle = style(
          row.header ? { bold: true, ...row.labelStyle } : row.labelStyle
        );
        return (
          <Text key={row.id} wrap="truncate-end">
            {mark ? (
              <>
                <Text {...labelStyle}>{marker}</Text>
                <Text {...style(mark.style)}>{mark.mark}</Text>
                <Text {...labelStyle}>{` ${nameText(row, width)}`}</Text>
              </>
            ) : (
              <>
                <Text {...labelStyle}>{marker}</Text>
                {labelParts(nameText(row, width), row).map((part) => (
                  <Text
                    key={part.at}
                    {...style({ ...labelStyle, ...part.style })}
                  >
                    {part.text}
                  </Text>
                ))}
              </>
            )}
            {(row.cells ?? []).flatMap((cell, cellIndex) => {
              const used = cell.parts.reduce(
                (total, part) => total + [...partText(part, color)].length,
                0
              );
              const filler = Math.max(cell.width - used, 0);
              return [
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
                <Text key={`g${cellIndex}`}>{" ".repeat(GAP)}</Text>,
                ...(cell.align === "right" && filler > 0
                  ? // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
                    [<Text key={`l${cellIndex}`}>{" ".repeat(filler)}</Text>]
                  : []),
                ...cell.parts.map((part, partIndex) => (
                  <Text
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
                    key={`${cellIndex}.${partIndex}`}
                    {...style(part.style)}
                  >
                    {partText(part, color)}
                  </Text>
                )),
                ...(cell.align !== "right" && filler > 0
                  ? // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
                    [<Text key={`r${cellIndex}`}>{" ".repeat(filler)}</Text>]
                  : []),
              ];
            })}
          </Text>
        );
      })}
      {rows.length > height ? (
        <Text dimColor>
          {start + height < rows.length
            ? `  ↓ ${rows.length - start - height} more`
            : `  ↑ ${start} more`}
        </Text>
      ) : null}
      {status ? (
        <Text dimColor wrap="truncate-end">
          {` ${status}`}
        </Text>
      ) : null}
    </Box>
  );
};

// "label: value" lines show a dim label and the value; a state value gets its badge colour.
const LABELLED = /^([a-z][a-z ]{0,18}): (.+)$/;

const DetailLine = ({
  line,
  plain,
  inner,
}: {
  line: string;
  plain: boolean;
  inner: number;
}) => {
  const style = useStyle();
  const match = plain ? undefined : LABELLED.exec(line);
  if (line === "Working...") {
    return <Busy text={line} />;
  }
  if (!match) {
    return (
      <Text wrap={plain ? "wrap" : "truncate-end"}>
        {plain ? line || " " : middle(line || " ", inner)}
      </Text>
    );
  }
  // Explanations (why a row cannot be toggled, advice) wrap; paths and values are cut in the middle.
  const wraps = ["toggle", "note", "advice"].includes(match[1]);
  // Cut by hand (middle …) to the room left after the label: Ink's own truncation of nested text can overrun the border.
  const value = wraps
    ? match[2]
    : middle(match[2], Math.max(inner - match[1].length - 2, 4));
  return (
    <Text wrap={wraps ? "wrap" : "truncate-end"}>
      <Text dimColor>{`${match[1]}: `}</Text>
      <Text
        {...style(
          ["state", "this project", "global"].includes(match[1])
            ? { ...stateStyle(match[2]), bold: true }
            : {}
        )}
      >
        {value}
      </Text>
    </Text>
  );
};

// Stacked details are short of room: these neighbours share one line when both fit (first label -> the label after it).
const PAIRS: Record<string, string> = {
  state: "tokens",
  "this project": "global",
};
const labelOf = (text: string) => LABELLED.exec(text)?.[1] ?? "";
const pairUp = (lines: string[], inner: number): string[][] => {
  const out: string[][] = [];
  for (const line of lines) {
    const last = out.at(-1);
    if (
      last?.length === 1 &&
      PAIRS[labelOf(last[0])] === labelOf(line) &&
      [...last[0]].length + 5 + [...line].length <= inner
    ) {
      last.push(line);
    } else {
      out.push([line]);
    }
  }
  return out;
};

// One details line: a diff line of a preview takes its colour, any other goes through DetailLine.
const DetailRow = ({
  line,
  lines,
  inner,
}: {
  line: string;
  lines?: string[];
  inner: number;
}) => {
  const style = useStyle();
  return lines &&
    (line.startsWith("+") || line.startsWith("-")) &&
    !line.startsWith("---") &&
    !line.startsWith("+++") ? (
    <Text
      wrap="wrap"
      {...style({ color: line.startsWith("+") ? "green" : "red" })}
    >
      {line}
    </Text>
  ) : (
    <DetailLine inner={inner} line={line} plain={Boolean(lines)} />
  );
};

interface DetailsPaneProps {
  height: number;
  layout: Layout;
  lines?: string[];
  row?: Row;
  title?: string;
}

// `lines` replaces the row's own details (a fix preview, a prompt). Sized to its content: a box beside the list, a
// borderless block under it when stacked.
export const DetailsPane = ({
  row,
  lines,
  title = "Details",
  height,
  layout,
}: DetailsPaneProps) => {
  const style = useStyle();
  const { ascii } = React.useContext(ThemeContext);
  const text = (lines ?? row?.details ?? []).map((line) =>
    line.replaceAll("\t", "  ")
  );
  const { stacked } = layout;
  const inner = stacked ? layout.cols : layout.detailsWidth - 4; // minus border and padding
  const shown = clipLines(
    text,
    stacked ? (lines ? 16 : STACKED_DETAILS_LINES) : Math.max(height, 8)
  );
  // Stacked, a row's details name it with its group in the title, and short `label: value` pairs share a line.
  const named =
    stacked &&
    !lines &&
    row?.group &&
    (row.kind === "skill" || row.kind === "agent");
  const heading = named
    ? `${row.skill ?? row.label.trim()}  ${row.kind} in ${row.group}`
    : title;
  const entries =
    stacked && !lines ? pairUp(shown, inner) : shown.map((line) => [line]);
  const body = [
    <Text bold key="title">
      {heading}
    </Text>,
    ...entries.map((entry, index) =>
      entry.length > 1 ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
        <Box gap={5} key={index}>
          {entry.map((line) => (
            <DetailLine inner={inner} key={line} line={line} plain={false} />
          ))}
        </Box>
      ) : (
        <DetailRow
          inner={inner}
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
          key={index}
          line={entry[0]}
          lines={lines}
        />
      )
    ),
  ];
  return stacked ? (
    <Box flexDirection="column" marginTop={1} width={layout.cols}>
      <Text dimColor>{"─".repeat(layout.cols)}</Text>
      {body}
    </Box>
  ) : (
    <Box
      alignSelf="flex-start"
      borderColor={style({ color: "gray" }).color}
      borderStyle={ascii ? "classic" : "round"}
      flexDirection="column"
      flexShrink={0}
      paddingX={1}
      width={layout.detailsWidth}
    >
      {body}
    </Box>
  );
};

interface PanesProps {
  cursor: number;
  height: number;
  layout: Layout;
  lines?: string[];
  marked?: Set<string>;
  row?: Row;
  rows: Row[];
  status?: string;
  title?: string;
}

// List and details together, side by side or stacked depending on the width.
export const Panes = ({
  rows,
  cursor,
  height,
  row,
  lines,
  title,
  layout,
  marked,
  status,
}: PanesProps) => (
  <Box flexDirection={layout.stacked ? "column" : "row"}>
    <ListPane
      cursor={cursor}
      height={height}
      marked={marked}
      rows={rows}
      status={status}
      width={layout.listWidth}
    />
    <DetailsPane
      height={height}
      layout={layout}
      lines={lines}
      row={row}
      title={title}
    />
  </Box>
);
