// Backups core made before a change: restore a removed skill or an updated copy, delete one, or delete the old ones.
// Every write is previewed first. Fixes are undone from Doctor, not here.

import { messages } from "@agentry/core/messages";
import { useMemo } from "react";
import { toast } from "sonner";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData } from "../lib/app-data.js";
import { formatAge, formatBytes } from "../lib/format.js";
import { client } from "../lib/orpc.js";
import { ActionButton } from "./action-button.js";
import { DetailsPanel, NoSelection } from "./details-panel.js";
import { ListScreen } from "./list-screen.js";
import { Pill } from "./pill.js";
import { usePreviewFlow } from "./preview-flow.js";
import { Button } from "./ui/button.js";
import { Kbd } from "./ui/kbd.js";

const m = messages();
const t = m.web.backups;

type BackupRow = LoadData["backups"]["items"][number];

export const PRUNE_DAYS = 30;

const FILTERS = {
  all: () => true,
  removed: (row: BackupRow) => row.kind === "removed",
  updated: (row: BackupRow) => row.kind === "updated",
  fix: (row: BackupRow) => row.kind === "fix",
};

export const BackupsScreen = () => {
  const { data, dir } = useAppData();
  const flow = usePreviewFlow();
  const rows = useMemo(() => data?.backups.items ?? [], [data]);

  const restore = (target: BackupRow | undefined) => {
    if (!target) {
      return;
    }
    if (target.kind === "fix") {
      flow.start({
        title: target.name,
        preview: async () => ({
          appliable: false,
          text: t.fixBackup,
        }),
        apply: async () => ({ ok: false, text: m.web.hooks.nothingToApply }),
      });
      return;
    }
    const input = { dir, id: target.id };
    flow.start({
      title: m.backups.notices.restoreTitle(target.name),
      preview: async () => {
        const result = await client.backups.restoreBackup({
          ...input,
          dryRun: true,
        });
        return { appliable: result.ok, text: result.text };
      },
      apply: () => client.backups.restoreBackup(input),
    });
  };
  const prune = (
    input: { ids: string[] } | { olderThan: number },
    title: string
  ) =>
    flow.start({
      title,
      preview: async () => {
        const result = await client.backups.pruneBackups({
          dir,
          ...input,
          dryRun: true,
        });
        return { appliable: result.ok, text: result.text };
      },
      apply: () => client.backups.pruneBackups({ dir, ...input }),
      note: t.note,
    });
  const pruneOld = () =>
    prune({ olderThan: PRUNE_DAYS }, m.backups.notices.pruneTitle(PRUNE_DAYS));
  const removeOne = (target: BackupRow | undefined) =>
    target && prune({ ids: [target.id] }, t.deleteTitle(target.name));

  const list = useListState(rows, {
    id: (item) => item.id,
    text: (item) => `${item.name} ${item.detail}`,
    filters: FILTERS,
    keys: {
      X: removeOne,
      x: () => toast.message(m.backups.notices.nowPressX),
      d: pruneOld,
      u: restore,
    },
  });
  const current = list.selected;

  return (
    <>
      <ListScreen<BackupRow>
        action={
          <Button className="h-11 px-4" onClick={pruneOld} variant="outline">
            {t.pruneLabel(PRUNE_DAYS)} <Kbd>d</Kbd>
          </Button>
        }
        columns={[
          {
            header: t.backup,
            cell: (item) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-medium">
                  {item.name}
                </span>
                <span className="text-muted-text truncate text-xs">
                  {item.what ?? item.detail}
                </span>
              </div>
            ),
          },
          {
            header: t.kind,
            className: "w-28",
            cell: (item) => (
              <Pill
                tone={
                  item.kind === "removed"
                    ? "error"
                    : item.kind === "updated"
                      ? "project"
                      : "muted"
                }
              >
                {item.kind}
              </Pill>
            ),
          },
          {
            header: t.size,
            className: "w-24",
            cell: (item) => (
              <span className="text-muted-text font-mono text-xs">
                {formatBytes(item.bytes)}
              </span>
            ),
          },
          {
            header: t.age,
            className: "w-24",
            cell: (item) => (
              <span className="text-muted-text text-xs">
                {formatAge(item.days)}
              </span>
            ),
          },
        ]}
        details={
          current ? (
            <DetailsPanel
              actions={
                <>
                  <ActionButton keyHint="u" onClick={() => restore(current)}>
                    {m.backups.notices.restore}
                  </ActionButton>
                  <ActionButton
                    danger
                    keyHint="X"
                    onClick={() => removeOne(current)}
                  >
                    {t.delete}
                  </ActionButton>
                </>
              }
              badge={<Pill tone="muted">{current.kind}</Pill>}
              fields={[
                [t.item, current.name],
                [t.taken, t.takenValue(current.date, formatAge(current.days))],
                [t.size, formatBytes(current.bytes)],
                [
                  t.from,
                  <span className="font-mono text-xs" key="f">
                    {current.from ?? "-"}
                  </span>,
                ],
                [
                  t.copy,
                  <span className="font-mono text-xs" key="p">
                    {current.path}
                  </span>,
                ],
              ]}
              note={current.detail}
              title={current.name}
            />
          ) : (
            <NoSelection what={t.selectOne} />
          )
        }
        detailsLabel={t.detailsLabel}
        empty={t.empty(data?.paths.backupsDir)}
        filter={{
          value: list.filter,
          onChange: list.setFilter,
          options: [
            {
              value: "all",
              label: m.web.common.all,
              count: list.counts.all ?? 0,
            },
            {
              value: "removed",
              label: t.filters.removed,
              count: list.counts.removed ?? 0,
            },
            {
              value: "updated",
              label: t.filters.updated,
              count: list.counts.updated ?? 0,
            },
            {
              value: "fix",
              label: t.filters.fix,
              count: list.counts.fix ?? 0,
            },
          ],
        }}
        hint={t.hint}
        onSelect={list.setSelectedId}
        rowId={(item) => item.id}
        rows={list.shown}
        search={{
          inputRef: list.searchRef,
          value: list.query,
          onChange: list.setQuery,
          placeholder: t.searchPlaceholder,
        }}
        selectedId={list.selectedId}
        setSheetOpen={list.setSheetOpen}
        sheetOpen={list.sheetOpen}
        summary={t.summary(rows.length)}
        title={t.title}
      />
      {flow.dialog}
    </>
  );
};
