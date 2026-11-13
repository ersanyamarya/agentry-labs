// CLAUDE.md and rule files, user and project. The only write is removing one, after a copy to the backups.

import { useMemo } from "react";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData } from "../lib/app-data.js";
import { formatBytes } from "../lib/format.js";
import { client } from "../lib/orpc.js";
import { ActionButton } from "./action-button.js";
import { DetailsPanel, NoSelection } from "./details-panel.js";
import { ListScreen } from "./list-screen.js";
import { Pill } from "./pill.js";
import { usePreviewFlow } from "./preview-flow.js";

type RuleRow = LoadData["rules"]["items"][number];

const FILTERS = {
  all: () => true,
  global: (row: RuleRow) => row.scope === "user",
  project: (row: RuleRow) => row.scope === "project",
};

export const RulesScreen = () => {
  const { data, dir } = useAppData();
  const flow = usePreviewFlow();
  const rows = useMemo(() => data?.rules.items ?? [], [data]);

  const remove = (target: RuleRow | undefined) => {
    if (!target) {
      return;
    }
    const input = { dir, target: target.id, backup: true };
    flow.start({
      title: `Remove ${target.label}`,
      // core's dry run is the preview: the same call without dryRun applies.
      preview: async () => {
        const result = await client.rules.removeRule({
          ...input,
          dryRun: true,
        });
        return { appliable: result.ok, text: result.text };
      },
      apply: () => client.rules.removeRule(input),
      note: `A copy is kept under ${data?.paths.backupsDir ?? "the backups folder"}, and Backups can restore it.`,
    });
  };

  const list = useListState(rows, {
    id: (item) => item.id,
    text: (item) => `${item.label} ${item.title}`,
    filters: FILTERS,
    keys: { x: remove },
  });
  const current = list.selected;

  return (
    <>
      <ListScreen<RuleRow>
        columns={[
          {
            header: "File",
            cell: (item) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-medium">
                  {item.label}
                </span>
                <span className="text-muted-text truncate text-xs">
                  {item.title}
                </span>
              </div>
            ),
          },
          {
            header: "Kind",
            className: "w-28",
            cell: (item) => (
              <Pill tone="muted">
                {item.kind === "rule" ? "rule" : "CLAUDE.md"}
              </Pill>
            ),
          },
          {
            header: "Scope",
            className: "w-28",
            cell: (item) => (
              <Pill tone={item.scope === "user" ? "on" : "project"}>
                {item.scope === "user" ? "global" : "project"}
              </Pill>
            ),
          },
          {
            header: "Size",
            className: "w-24",
            cell: (item) => (
              <span className="text-muted-text font-mono text-xs">
                {formatBytes(item.bytes)}
              </span>
            ),
          },
        ]}
        details={
          current ? (
            <DetailsPanel
              actions={
                <ActionButton
                  danger
                  keyHint="x"
                  onClick={() => remove(current)}
                >
                  Remove
                </ActionButton>
              }
              badge={
                <Pill tone={current.scope === "user" ? "on" : "project"}>
                  {current.scope === "user" ? "global" : "project"}
                </Pill>
              }
              fields={[
                ["Title", current.title],
                [
                  "Path",
                  <span className="font-mono text-xs" key="p">
                    {current.path}
                  </span>,
                ],
                ["Size", formatBytes(current.bytes)],
              ]}
              note="Removing keeps a copy in the backups."
              title={current.label}
            />
          ) : (
            <NoSelection what="a file" />
          )
        }
        detailsLabel="Rule details"
        empty="No CLAUDE.md or rule files."
        filter={{
          value: list.filter,
          onChange: list.setFilter,
          options: [
            { value: "all", label: "All", count: list.counts.all ?? 0 },
            {
              value: "global",
              label: "Global",
              count: list.counts.global ?? 0,
            },
            {
              value: "project",
              label: "This project",
              count: list.counts.project ?? 0,
            },
          ],
        }}
        hint="↑↓ move · x remove · / search"
        onSelect={list.setSelectedId}
        rowId={(item) => item.id}
        rows={list.shown}
        search={{
          inputRef: list.searchRef,
          value: list.query,
          onChange: list.setQuery,
          placeholder: "Search rules",
        }}
        selectedId={list.selectedId}
        setSheetOpen={list.setSheetOpen}
        sheetOpen={list.sheetOpen}
        summary={`${rows.length} files`}
        title="Rules"
      />
      {flow.dialog}
    </>
  );
};
