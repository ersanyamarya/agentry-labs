// Row cursor over a list that has non-selectable header rows: moves skip headers and stay in range when rows change.

import React from "react";
import type { Row } from "./types.js";

const selectable = (row: { header?: boolean } | undefined) =>
  Boolean(row && !row.header);

export const firstSelectable = (rows: { header?: boolean }[]) =>
  Math.max(0, rows.findIndex(selectable));

export const stepCursor = (
  rows: { header?: boolean }[],
  from: number,
  delta: number
) => {
  for (let at = from + delta; at >= 0 && at < rows.length; at += delta) {
    if (selectable(rows[at])) {
      return at;
    }
  }
  return from;
};

export const useCursor = (rows: Row[]) => {
  const [at, setAt] = React.useState(() => firstSelectable(rows));
  const clamped = Math.min(at, rows.length - 1);
  const cursor = selectable(rows[clamped])
    ? clamped
    : stepCursor(rows, clamped, -1) === clamped
      ? firstSelectable(rows)
      : stepCursor(rows, clamped, -1);
  const move = (delta: number) => setAt(stepCursor(rows, cursor, delta));
  return { cursor, row: rows[cursor], move, home: () => setAt(0) };
};
