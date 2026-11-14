// The subagents Claude Code can start, user and project, with their model and listing cost. Read-only: add or remove an
// agent from Catalog.

import { useMemo } from "react";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData } from "../lib/app-data.js";
import { DetailsPanel, NoSelection } from "./details-panel.js";
import { ListScreen } from "./list-screen.js";
import { Pill } from "./pill.js";

type AgentRow = LoadData["agents"]["items"][number];

const FILTERS = {
  all: () => true,
  global: (row: AgentRow) => row.scope === "user",
  project: (row: AgentRow) => row.scope === "project",
};

export const AgentsScreen = () => {
  const { data } = useAppData();
  const rows = useMemo(() => data?.agents.items ?? [], [data]);

  const list = useListState(rows, {
    id: (item) => item.id,
    text: (item) => `${item.name} ${item.description} ${item.model ?? ""}`,
    filters: FILTERS,
    keys: {},
  });
  const current = list.selected;

  return (
    <ListScreen<AgentRow>
      columns={[
        {
          header: "Agent",
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
          header: "Model",
          className: "w-28",
          cell: (item) => (
            <span className="text-muted-text font-mono text-xs">
              {item.model ?? "-"}
            </span>
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
          header: "Cost",
          className: "w-24",
          cell: (item) => (
            <span className="text-muted-text font-mono text-xs">
              ~{item.tokens}
            </span>
          ),
        },
      ]}
      details={
        current ? (
          <DetailsPanel
            badge={
              <Pill tone={current.scope === "user" ? "on" : "project"}>
                {current.scope === "user" ? "global" : "project"}
              </Pill>
            }
            fields={[
              ...(current.description
                ? ([["Description", current.description]] as [string, string][])
                : []),
              ...(current.model
                ? ([["Model", current.model]] as [string, string][])
                : []),
              ...(current.tools
                ? ([["Tools", current.tools]] as [string, string][])
                : []),
              ["Listing cost", `~${current.tokens} tokens`],
              [
                "Path",
                <span className="font-mono text-xs" key="p">
                  {current.path}
                </span>,
              ],
            ]}
            note="Cost is the name and description Claude lists; the body loads when the agent runs. Add or remove agents from Catalog."
            title={current.name}
          />
        ) : (
          <NoSelection what="an agent" />
        )
      }
      detailsLabel="Agent details"
      empty="No agents installed."
      filter={{
        value: list.filter,
        onChange: list.setFilter,
        options: [
          { value: "all", label: "All", count: list.counts.all ?? 0 },
          { value: "global", label: "Global", count: list.counts.global ?? 0 },
          {
            value: "project",
            label: "This project",
            count: list.counts.project ?? 0,
          },
        ],
      }}
      hint="↑↓ move · / search"
      onSelect={list.setSelectedId}
      rowId={(item) => item.id}
      rows={list.shown}
      search={{
        inputRef: list.searchRef,
        value: list.query,
        onChange: list.setQuery,
        placeholder: "Search agents",
      }}
      selectedId={list.selectedId}
      setSheetOpen={list.setSheetOpen}
      sheetOpen={list.sheetOpen}
      summary={`${rows.length} agents`}
      title="Agents"
    />
  );
};
