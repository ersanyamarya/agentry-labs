// The subagents Claude Code can start, user and project, with their model and listing cost. Read-only: add or remove an
// agent from Catalog.

import { messages } from "@agentry/core/messages";
import { useMemo } from "react";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData } from "../lib/app-data.js";
import { userName } from "../lib/copilot.js";
import { useCopilot } from "./copilot.js";
import { DetailsPanel, NoSelection } from "./details-panel.js";
import { ListScreen } from "./list-screen.js";
import { Pill } from "./pill.js";

const m = messages();
const t = m.web.agents;
const CP = m.copilot;

type AgentRow = LoadData["agents"]["items"][number];

const FILTERS = {
  all: () => true,
  global: (row: AgentRow) => row.scope === "user",
  project: (row: AgentRow) => row.scope === "project",
};

export const AgentsScreen = () => {
  const { data } = useAppData();
  const rows = useMemo(() => data?.agents.items ?? [], [data]);
  const copilot = useCopilot();
  const shareFor = (row: AgentRow) =>
    row.scope === "user"
      ? copilot.shareOf("agent", userName(row.id, ""))
      : copilot.shareOf("agent", undefined, CP.whyNot.projectOnly);

  const list = useListState(rows, {
    id: (item) => item.id,
    text: (item) => `${item.name} ${item.description} ${item.model ?? ""}`,
    filters: FILTERS,
    keys: copilot.keys(shareFor),
  });
  const current = list.selected;

  return (
    <>
      <ListScreen<AgentRow>
        columns={[
          {
            header: t.agent,
            cell: (item) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-medium">
                  {item.name}
                </span>
                <span className="text-muted-text truncate text-xs">
                  {item.description || item.label}
                </span>
              </div>
            ),
          },
          {
            header: m.web.common.model,
            className: "w-28",
            cell: (item) => (
              <span className="text-muted-text font-mono text-xs">
                {item.model ?? "-"}
              </span>
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
            header: m.web.common.cost,
            className: "w-24",
            cell: (item) => (
              <span className="text-muted-text font-mono text-xs">
                ~{item.tokens}
              </span>
            ),
          },
          ...copilot.column(shareFor),
        ]}
        details={
          current ? (
            <DetailsPanel
              badge={
                <Pill tone={current.scope === "user" ? "on" : "project"}>
                  {current.scope === "user"
                    ? m.web.common.scopeGlobal
                    : m.web.common.scopeProject}
                </Pill>
              }
              fields={[
                ...(current.description
                  ? ([[t.description, current.description]] as [
                      string,
                      string,
                    ][])
                  : []),
                ...(current.model
                  ? ([[m.web.common.model, current.model]] as [
                      string,
                      string,
                    ][])
                  : []),
                ...(current.tools
                  ? ([[t.tools, current.tools]] as [string, string][])
                  : []),
                [t.listingCost, t.tokens(current.tokens)],
                [
                  m.web.common.path,
                  <span className="font-mono text-xs" key="p">
                    {current.path}
                  </span>,
                ],
              ]}
              note={t.note}
              title={current.name}
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
        hint={copilot.hint(t.hint)}
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
      {copilot.dialog}
    </>
  );
};
