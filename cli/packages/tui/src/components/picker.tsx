// Project picker: the current repo, recent repos, then repos found under the scan roots.

import { Box, useInput } from "ink";
import React from "react";
import { stepCursor } from "../use-cursor.js";
import { Text } from "./text.js";

export interface PickerRow {
  header?: undefined;
  id: string;
  kind: "current" | "recent" | "repo";
  label: string;
  path: string;
}

export const pickerRows = ({
  current,
  recents,
  found,
}: {
  current: string;
  recents: string[];
  found: string[];
}) => {
  const seen = new Set<string>();
  const rows: PickerRow[] = [];
  const add = (kind: PickerRow["kind"], path: string) => {
    if (!seen.has(path)) {
      seen.add(path);
      rows.push({ id: path, kind, path, label: `${path}  (${kind})` });
    }
  };
  add("current", current);
  // biome-ignore lint/complexity/noForEach: forEach with a simple side-effect callback; same behaviour as for-of
  // biome-ignore lint/suspicious/useIterableCallbackReturn: the callback is a side effect and its return value is unused by forEach
  recents.forEach((path) => add("recent", path));
  // biome-ignore lint/complexity/noForEach: forEach with a simple side-effect callback; same behaviour as for-of
  // biome-ignore lint/suspicious/useIterableCallbackReturn: the callback is a side effect and its return value is unused by forEach
  found.forEach((path) => add("repo", path));
  return rows;
};

export const Picker = ({
  rows,
  onPick,
  onClose,
}: {
  rows: PickerRow[];
  onPick: (path: string) => void;
  onClose: () => void;
}) => {
  const [cursor, setCursor] = React.useState(0);
  useInput((input, key) => {
    if (key.escape || input === "p") {
      onClose();
    } else if (key.upArrow) {
      setCursor(stepCursor(rows, cursor, -1));
    } else if (key.downArrow) {
      setCursor(stepCursor(rows, cursor, 1));
    } else if (key.return && rows[cursor]) {
      onPick(rows[cursor].path);
    }
  });
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1}>
      <Text bold>{"Project (enter select, esc close)"}</Text>
      {rows.map((row, index) => (
        <Text inverse={index === cursor} key={row.id} wrap="truncate-start">
          {`${index === cursor ? ">" : " "} ${row.label}`}
        </Text>
      ))}
    </Box>
  );
};
