// Agents tab: the subagents Claude Code can start, user and project, with their model and listing cost. e opens the selected
// file in $EDITOR; C shares a user agent with Copilot (when it is shown). Add or remove agents from the Catalog tab.

import { useInput } from "ink";
import React from "react";
import { copilotKey } from "../copilot-flow.js";
import { agentKeys, agentRows, copilotOf } from "../rows.js";
import type { TabProps } from "../types.js";
import { useFlow } from "../use-flow.js";
import { useList } from "../use-list.js";
import { Panes } from "./list.js";

export const AgentsTab = ({
  data,
  api,
  dir,
  active,
  height,
  layout,
  lock,
  notify,
  reload,
  setKeys,
  openFile,
  copy,
}: TabProps) => {
  const all = React.useMemo(() => agentRows(data), [data]);
  const list = useList({ rows: all, lock });
  const { rows, cursor, row, move } = list;
  const flow = useFlow({ lock, notify, reload, copy });
  const keys = agentKeys(row, copilotOf(data));
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is meant to run only when the listed value changes
  React.useEffect(() => {
    if (active) {
      setKeys(keys);
    }
  }, [active, keys.join()]);

  useInput(
    (input, key) => {
      if (flow.handleKey(input, key) || list.handleKey(input, key)) {
        return;
      }
      if (key.upArrow || key.downArrow) {
        flow.clear();
        move(key.upArrow ? -1 : 1);
      } else if (copilotKey(input, { api, data, dir, flow, notify, row })) {
        // C shares or stops sharing the agent with Copilot, T turns Copilot on or off in this repo
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
      lines={flow.lines}
      marked={list.markedIds}
      row={row}
      rows={rows}
      status={list.status}
      title={flow.title}
    />
  );
};
