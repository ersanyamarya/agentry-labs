// A scrolling list of rows and the details of the selected one. Rows are laid out in fixed columns: the name (cut in the
// middle with … when it does not fit) and then `cells` of fixed width, so state badges are always whole and line up. Colours
// come from theme.ts through useStyle, so NO_COLOR drops them; the selected row is inverse + bold with a ">" marker.
// Beside the list from 100 columns up, under it below that (see layout.ts).

import { Box, Text } from "ink";
import {
  clipLines,
  end,
  middle,
  pad,
  STACKED_DETAILS_LINES,
} from "../layout.js";
import { stateStyle, useStyle } from "../theme.js";
import type { Cell, Layout, Row } from "../types.js";

const GAP = 2;
const cellText = (cell: Cell) =>
  pad(cell.parts.map((part) => part.text).join(""), cell.width, cell.align);
export const rightWidth = (row: Pick<Row, "cells">) =>
  (row.cells ?? []).reduce(
    (total, cell, index) => total + cell.width + (index > 0 ? GAP : 0),
    0
  );

// The row as one line of exactly `width` characters: marker, name, cells.
export const rowLine = (row: Row, width: number, marker = " ") => {
  const right = rightWidth(row);
  const nameWidth =
    right > 0 ? Math.max(width - right - GAP - 1, 4) : width - 1;
  const name = row.cells
    ? pad(middle(row.label, nameWidth), nameWidth)
    : end(row.label, nameWidth);
  return `${marker}${name}${row.cells ? `${" ".repeat(GAP)}${row.cells.map(cellText).join(" ".repeat(GAP))}` : ""}`;
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
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), rows.length - height)
  );
  const shown = rows.slice(start, start + height);
  return (
    <Box flexDirection="column" flexShrink={0} width={boxWidth}>
      {rows.length === 0 ? <Text dimColor>{"  (nothing here)"}</Text> : null}
      {shown.map((row, index) => {
        if (row.blank) {
          return <Text key={row.id}> </Text>;
        }
        if (row.header && !row.cells) {
          return (
            <Text key={row.id} wrap="truncate-end">
              <Text {...style({ bold: true, ...row.labelStyle })}>
                {row.label}
              </Text>
              <Text
                dimColor
              >{` ${"─".repeat(Math.max(3, Math.min(width, 40) - row.label.length - 1))}`}</Text>
            </Text>
          );
        }
        if (start + index === cursor) {
          return (
            <Text bold inverse key={row.id} wrap="truncate-end">
              {rowLine(row, width, ">")}
            </Text>
          );
        }
        const right = rightWidth(row);
        const nameWidth =
          right > 0 ? Math.max(width - right - GAP - 1, 4) : width - 1;
        return (
          <Text key={row.id} wrap="truncate-end">
            <Text
              {...style(
                row.header ? { bold: true, ...row.labelStyle } : row.labelStyle
              )}
            >{`${marked?.has(row.id) ? "*" : " "}${row.cells ? pad(middle(row.label, nameWidth), nameWidth) : end(row.label, nameWidth)}`}</Text>
            {(row.cells ?? []).flatMap((cell, cellIndex) => {
              const used = cell.parts.reduce(
                (total, part) => total + [...part.text].length,
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
                    {part.text}
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
        <Text dimColor>{`  ${cursor + 1}/${rows.length}`}</Text>
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
  const text = (lines ?? row?.details ?? []).map((line) =>
    line.replaceAll("\t", "  ")
  );
  const { stacked } = layout;
  const inner = stacked ? layout.cols : layout.detailsWidth - 4; // minus border and padding
  const shown = clipLines(
    text,
    stacked ? (lines ? 16 : STACKED_DETAILS_LINES) : Math.max(height, 8)
  );
  const body = [
    <Text bold key="title">
      {title}
    </Text>,
    ...shown.map((line, index) =>
      lines &&
      (line.startsWith("+") || line.startsWith("-")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++") ? (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
          key={index}
          wrap="wrap"
          {...style({ color: line.startsWith("+") ? "green" : "red" })}
        >
          {line}
        </Text>
      ) : (
        <DetailLine
          inner={inner}
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
          key={index}
          line={line}
          plain={Boolean(lines)}
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
      borderStyle="single"
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
