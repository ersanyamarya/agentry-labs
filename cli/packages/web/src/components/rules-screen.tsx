// CLAUDE.md and rule files, user and project. The only write is removing one, after a copy to the backups.

import { messages } from "@agentry/core/messages";
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

const m = messages();
const t = m.web.rules;

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

  // x keeps a copy in the backups; X (keepCopy false) keeps none.
  const remove = (target: RuleRow | undefined, keepCopy = true) => {
    if (!target) {
      return;
    }
    const input = { dir, target: target.id, backup: keepCopy };
    flow.start({
      title: keepCopy
        ? t.removeTitle(target.label)
        : t.deleteTitle(target.label),
      // core's dry run is the preview: the same call without dryRun applies.
      preview: async () => {
        const result = await client.rules.removeRule({
          ...input,
          dryRun: true,
        });
        return { appliable: result.ok, text: result.text };
      },
      apply: () => client.rules.removeRule(input),
      note: keepCopy ? t.copyKept(data?.paths.backupsDir) : undefined,
    });
  };

  const deleteRule = (target: RuleRow | undefined) => remove(target, false);

  const list = useListState(rows, {
    id: (item) => item.id,
    text: (item) => `${item.label} ${item.title}`,
    filters: FILTERS,
    keys: { x: (item) => remove(item), X: deleteRule },
  });
  const current = list.selected;

  return (
    <>
      <ListScreen<RuleRow>
        columns={[
          {
            header: t.file,
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
            header: t.kind,
            className: "w-28",
            cell: (item) => (
              <Pill tone="muted">
                {item.kind === "rule" ? m.rules.kindRule : m.rules.kindClaudeMd}
              </Pill>
            ),
          },
          {
            header: m.web.common.scope,
            className: "w-28",
            cell: (item) => (
              <Pill tone={item.scope === "user" ? "on" : "project"}>
                {item.scope === "user"
                  ? m.web.common.scopeGlobal
                  : m.web.common.scopeProject}
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
        ]}
        details={
          current ? (
            <DetailsPanel
              actions={
                <>
                  <ActionButton
                    danger
                    keyHint="x"
                    onClick={() => remove(current)}
                  >
                    {m.web.common.remove}
                  </ActionButton>
                  <ActionButton
                    danger
                    keyHint="X"
                    onClick={() => remove(current, false)}
                  >
                    {m.web.common.deleteNoCopy}
                  </ActionButton>
                </>
              }
              badge={
                <Pill tone={current.scope === "user" ? "on" : "project"}>
                  {current.scope === "user"
                    ? m.web.common.scopeGlobal
                    : m.web.common.scopeProject}
                </Pill>
              }
              fields={[
                [t.title, current.title],
                [
                  m.web.common.path,
                  <span className="font-mono text-xs" key="p">
                    {current.path}
                  </span>,
                ],
                [t.size, formatBytes(current.bytes)],
              ]}
              note={t.note}
              title={current.label}
            />
          ) : (
            <NoSelection what={t.selectOne} />
          )
        }
        detailsLabel={t.detailsLabel}
        empty={t.empty}
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
              value: "global",
              label: m.skills.headers.global,
              count: list.counts.global ?? 0,
            },
            {
              value: "project",
              label: m.core.scopeTitle.project,
              count: list.counts.project ?? 0,
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
        title={t.heading}
      />
      {flow.dialog}
    </>
  );
};
