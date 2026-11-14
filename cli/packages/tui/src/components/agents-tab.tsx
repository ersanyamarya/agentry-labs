// Agents tab: the subagents Claude Code can start, user and project, with their model and listing cost. Read-only; e opens
// the selected file in $EDITOR. Add or remove agents from the Catalog tab.

import { useInput } from "ink";
import React from "react";
import { agentKeys, agentRows } from "../rows.js";
import type { TabProps } from "../types.js";
import { useList } from "../use-list.js";
import { Panes } from "./list.js";

export const AgentsTab = ({
  data,
  active,
  height,
  layout,
  lock,
  setKeys,
  openFile,
}: TabProps) => {
  const all = React.useMemo(() => agentRows(data), [data]);
  const list = useList({ rows: all, lock });
  const { rows, cursor, row, move } = list;
  const keys = agentKeys(row);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is meant to run only when the listed value changes
  React.useEffect(() => {
    if (active) {
      setKeys(keys);
    }
  }, [active, keys.join()]);

  useInput(
    (input, key) => {
      if (list.handleKey(input, key)) {
        return;
      }
      if (key.upArrow || key.downArrow) {
        move(key.upArrow ? -1 : 1);
      } else if (input === "e") {
        openFile(row?.file);
      }
    },
    { isActive: active }
  );

  return (
    <Panes
      cursor={cursor}
      height={height}
      layout={layout}
      marked={list.markedIds}
      row={row}
      rows={rows}
      status={list.status}
    />
  );
};
