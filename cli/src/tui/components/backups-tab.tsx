// Backups tab: the fix sets and removed-skill copies under ~/.claude/backups/agentry. u moves a removed skill back,
// x deletes the selected backup, d deletes everything 30+ days old. Each is previewed (lib/backups.ts's own dry run)
// and waits for y; c copies the preview.

import { useInput } from "ink";
import React from "react";
import { startBulk } from "../bulk-flow.js";
import { backupKeys, backupRows } from "../rows.js";
import type { TabProps } from "../types.js";
import { useFlow } from "../use-flow.js";
import { useList } from "../use-list.js";
import { Panes } from "./list.js";

const PRUNE_DAYS = 30;

export const BackupsTab = ({
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
  copy,
}: Omit<TabProps, "openFile">) => {
  const all = React.useMemo(() => backupRows(data), [data]);
  const list = useList({ rows: all, lock });
  const { rows, cursor, row, move } = list;
  const flow = useFlow({ lock, notify, reload, copy });
  const keys = backupKeys(row);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is meant to run only when the listed value changes
  React.useEffect(() => {
    if (active) {
      setKeys(keys);
    }
  }, [active, keys.join()]);

  const confirmDelete = async (
    selection: { ids?: string[]; olderThan?: number },
    title: string,
    done: string
  ) => {
    const preview = await api.pruneBackups({ dir, ...selection, dryRun: true });
    flow.begin({
      kind: "confirm",
      title: `${title} (preview)`,
      text: preview.text,
      appliable: preview.ok,
      apply: () => api.pruneBackups({ dir, ...selection }),
      done,
    });
  };

  const startRestore = async () => {
    const preview = await api.restoreBackup({
      dir,
      id: row?.backup ?? "",
      dryRun: true,
    });
    flow.begin({
      kind: "confirm",
      title: `Restore ${row?.label.trim()} (preview)`,
      text: preview.text,
      appliable: preview.ok,
      apply: () => api.restoreBackup({ dir, id: row?.backup ?? "" }),
      done: "Restored; it is back in its original folder.",
    });
  };

  useInput(
    (input, key) => {
      if (flow.handleKey(input, key) || list.handleKey(input, key)) {
        return;
      }
      if (key.upArrow || key.downArrow) {
        flow.clear();
        move(key.upArrow ? -1 : 1);
      } else if (input === "u" && list.marked.some((one) => one.restorable)) {
        startBulk({
          flow,
          title: "Restore",
          items: list.marked.filter((one) => one.restorable),
          preview: async (one) => {
            const result = await api.restoreBackup({
              dir,
              id: one.backup ?? "",
              dryRun: true,
            });
            return { appliable: result.ok, text: result.text };
          },
          apply: (one) => api.restoreBackup({ dir, id: one.backup ?? "" }),
          done: "Restored; they are back in their original folders",
        });
      } else if (input === "x" && list.marked.some((one) => one.backup)) {
        confirmDelete(
          {
            ids: list.marked.flatMap((one) => (one.backup ? [one.backup] : [])),
          },
          `Delete ${list.marked.length} backup${list.marked.length === 1 ? "" : "s"}`,
          "Deleted those backups."
        );
      } else if (input === "u") {
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        row?.restorable
          ? startRestore()
          : notify(
              "u restores a removed skill: select one that has a known original folder."
            );
      } else if (input === "x") {
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        row?.backup
          ? confirmDelete(
              { ids: [row.backup] },
              `Delete ${row.label.trim()}`,
              "Deleted that backup."
            )
          : notify("Select a backup first.");
      } else if (input === "d") {
        confirmDelete(
          { olderThan: PRUNE_DAYS },
          `Delete backups ${PRUNE_DAYS}+ days old`,
          `Deleted the backups ${PRUNE_DAYS}+ days old.`
        );
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
