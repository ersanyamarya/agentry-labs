// What every list tab shares: the row cursor (use-cursor.ts), a `/` filter and `m` marks.
// `/` types a filter (substring of the label and details, any case): enter keeps it, esc clears it. While typing the hook
// holds the "typing" lock (see use-flow.ts), so q and the tab keys reach nobody. `m` marks or unmarks the selected row
// and `M` clears the marks; a tab applies a bulk action to `marked` (see bulk-flow.ts).

import type { Key } from "ink";
import React from "react";
import type { Row, SetLock } from "./types.js";
import { useCursor } from "./use-cursor.js";

export const filterRows = (rows: Row[], query: string) => {
  const needle = query.trim().toLowerCase();
  return needle
    ? rows.filter(
        (row) =>
          !(row.header || row.blank) &&
          [row.label, ...(row.details ?? [])]
            .join("\n")
            .toLowerCase()
            .includes(needle)
      )
    : rows;
};

// `marks: false` turns marking off (Doctor has nothing to apply in bulk).
export const useList = ({
  rows: all,
  lock,
  marks = true,
}: {
  rows: Row[];
  lock: SetLock;
  marks?: boolean;
}) => {
  const [query, setQuery] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const [ids, setIds] = React.useState<Set<string>>(() => new Set());
  const rows = React.useMemo(() => filterRows(all, query), [all, query]);
  const { cursor, row, move, home } = useCursor(rows);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is meant to run only when the listed value changes
  React.useEffect(home, [query]);

  // Marks of rows that are gone (after a reload) fall away; marked rows hidden by a filter stay marked.
  const marked = all.filter((one) => ids.has(one.id) && !one.header);
  const markedIds = new Set(marked.map((one) => one.id));
  const type = (value: boolean) => {
    setTyping(value);
    lock(value ? "typing" : false);
  };

  // Returns true when the key was used.
  const handleKey = (input: string, key: Key): boolean => {
    if (typing) {
      if (key.upArrow || key.downArrow) {
        return false;
      }
      if (key.return) {
        type(false);
      } else if (key.escape) {
        setQuery("");
        type(false);
      } else if (key.backspace || key.delete) {
        setQuery(query.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setQuery(query + input);
      }
      return true;
    }
    if (input === "/") {
      type(true);
    } else if (key.escape && query) {
      setQuery("");
    } else if (marks && input === "m" && row && !row.header) {
      setIds((old) => {
        const next = new Set(old);
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        next.has(row.id) ? next.delete(row.id) : next.add(row.id);
        return next;
      });
    } else if (marks && input === "M") {
      setIds(new Set());
    } else {
      return false;
    }
    return true;
  };

  const status = [
    typing
      ? `/${query}_`
      : query
        ? `filter "${query}": ${rows.length} of ${all.filter((one) => !one.header).length} (/ edit, esc clear)`
        : "",
    markedIds.size > 0
      ? `${markedIds.size} marked (space/x apply to all, M clears)`
      : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  return { rows, cursor, row, move, handleKey, marked, markedIds, status };
};
