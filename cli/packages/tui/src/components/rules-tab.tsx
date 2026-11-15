// Rules tab: the CLAUDE.md and rule files Claude Code loads every session, user and project, with their token cost.
// e opens the selected file in $EDITOR; x removes it (previewed, y confirms; a copy is kept in the backups), X keeps no copy.

import { messages } from "@agentry/core/messages";
import { useInput } from "ink";
import React from "react";
import { startBulk } from "../bulk-flow.js";
import { startRemove } from "../remove-flow.js";
import { ruleKeys, ruleRows } from "../rows.js";
import type { TabProps } from "../types.js";
import { useFlow } from "../use-flow.js";
import { useList } from "../use-list.js";
import { Panes } from "./list.js";

const text = messages().rules.notices;

export const RulesTab = ({
  data,
  api,
  dir,
  active,
  height,
  layout,
  notify,
  reload,
  lock,
  setKeys,
  openFile,
  copy,
}: TabProps) => {
  const all = React.useMemo(() => ruleRows(data), [data]);
  const list = useList({ rows: all, lock });
  const { rows, cursor, row, move } = list;
  const flow = useFlow({ lock, notify, reload, copy });
  const keys = ruleKeys(row);
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
      } else if (input === "e") {
        openFile(row?.file);
      } else if (
        (input === "x" || input === "X") &&
        list.marked.some((one) => one.ruleFile)
      ) {
        const backup = input === "x";
        startBulk({
          flow,
          title: text.removeFiles,
          items: list.marked.filter((one) => one.ruleFile),
          preview: async (one) => {
            const result = await api.removeRule({
              dir,
              target: one.ruleFile ?? "",
              backup,
              dryRun: true,
            });
            return { appliable: result.ok, text: result.text };
          },
          apply: (one) =>
            api.removeRule({ dir, target: one.ruleFile ?? "", backup }),
          done: messages().flows.removedMany(backup),
        });
      } else if (input === "x" || input === "X") {
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        row?.ruleFile
          ? startRemove({
              api,
              dir,
              flow,
              call: "removeRule",
              backup: input === "x",
              target: row.ruleFile,
              label: row.ruleTitle,
            })
          : notify(text.selectFile);
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
