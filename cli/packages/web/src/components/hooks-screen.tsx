// Hooks from the settings files: turn one off (parked, so it can come back), turn it back on, or remove it. Plugin hooks
// belong to their plugin and are listed read-only. Each write is core's previewHook/applyHook pair.

import { useMemo } from "react";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData } from "../lib/app-data.js";
import { client } from "../lib/orpc.js";
import { ActionButton } from "./action-button.js";
import { DetailsPanel, NoSelection } from "./details-panel.js";
import { ListScreen } from "./list-screen.js";
import { Pill, stateTone } from "./pill.js";
import { usePreviewFlow } from "./preview-flow.js";
import { Switch } from "./ui/switch.js";

type Scope = "user" | "project" | "local";

interface HookRow {
  command: string;
  event: string;
  id: string;
  matcher: string;
  parked: boolean;
  scope: string;
  source: string;
  state: string;
}

export const hookRows = (load: LoadData): HookRow[] => [
  ...load.status.hooks.items.map((hook) => ({
    id: hook.id,
    event: hook.event,
    matcher: hook.matcher,
    command: hook.command ?? hook.type,
    scope: hook.scope,
    source: hook.source,
    state: hook.state,
    parked: false,
  })),
  ...load.parkedHooks.items.map((hook) => ({
    id: hook.id,
    event: hook.event,
    matcher: hook.matcher,
    command: hook.command ?? hook.type,
    scope: hook.scope,
    source: hook.source,
    state: "off",
    parked: true,
  })),
];

const FILTERS = {
  all: () => true,
  on: (row: HookRow) => !row.parked && row.state === "active",
  off: (row: HookRow) => row.parked,
};

const editable = (row: HookRow) =>
  ["user", "project", "local"].includes(row.scope);

export const HooksScreen = () => {
  const { data, dir } = useAppData();
  const flow = usePreviewFlow();
  const rows = useMemo(() => (data ? hookRows(data) : []), [data]);

  const run = (
    target: HookRow | undefined,
    action: "disable" | "enable" | "remove"
  ) => {
    if (!target) {
      return;
    }
    if (!editable(target)) {
      flow.start({
        title: target.event,
        preview: async () => ({
          appliable: false,
          text: `This hook comes from ${target.source}. It belongs to its plugin: change it there.`,
        }),
        apply: async () => ({ ok: false, text: "Nothing to apply." }),
      });
      return;
    }
    const input = {
      dir,
      selector: target.id,
      action,
      scope: target.scope as Scope,
    };
    flow.start({
      title: `${action === "disable" ? "Turn off" : action === "enable" ? "Turn on" : "Remove"} hook ${target.id.slice(0, 8)}: ${target.event}`,
      preview: () => client.hooks.previewHook(input),
      apply: () => client.hooks.applyHook(input),
      note: "A backup of the settings file is made first, and agentry fix --undo restores it.",
    });
  };
  const toggle = (target: HookRow | undefined) =>
    run(target, target?.parked ? "enable" : "disable");

  const list = useListState(rows, {
    id: (item) => item.id,
    text: (item) => `${item.event} ${item.matcher} ${item.command}`,
    filters: FILTERS,
    paused: false,
    keys: {
      space: (item, event) => {
        event.preventDefault();
        toggle(item);
      },
      x: (item) => run(item, "remove"),
    },
  });
  const current = list.selected;

  return (
    <>
      <ListScreen<HookRow>
        columns={[
          {
            header: "On",
            className: "w-14",
            cell: (item) => (
              <Switch
                aria-label={`Turn hook ${item.event} ${item.state === "active" ? "off" : "on"}`}
                checked={!item.parked && item.state === "active"}
                disabled={!editable(item)}
                onCheckedChange={() => toggle(item)}
                onClick={(event) => event.stopPropagation()}
              />
            ),
          },
          {
            header: "Hook",
            cell: (item) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-medium">
                  {item.event}
                  {item.matcher ? ` · ${item.matcher}` : ""}
                </span>
                <span className="text-muted-text truncate font-mono text-xs">
                  {item.command}
                </span>
              </div>
            ),
          },
          {
            header: "Scope",
            className: "w-28",
            cell: (item) => <Pill tone="muted">{item.scope}</Pill>,
          },
          {
            header: "State",
            className: "w-36",
            cell: (item) => (
              <Pill tone={stateTone(item.state)}>{item.state}</Pill>
            ),
          },
        ]}
        details={
          current ? (
            <DetailsPanel
              actions={
                editable(current) ? (
                  <>
                    <ActionButton
                      keyHint="space"
                      onClick={() => toggle(current)}
                    >
                      {current.parked ? "Turn on" : "Turn off"}
                    </ActionButton>
                    <ActionButton
                      danger
                      keyHint="x"
                      onClick={() => run(current, "remove")}
                    >
                      Remove
                    </ActionButton>
                  </>
                ) : null
              }
              badge={
                <Pill tone={stateTone(current.state)}>{current.state}</Pill>
              }
              fields={[
                ["Event", current.event],
                ["Matcher", current.matcher || "(all)"],
                [
                  "Command",
                  <span className="font-mono text-xs" key="c">
                    {current.command}
                  </span>,
                ],
                [
                  "Source",
                  <span className="font-mono text-xs" key="s">
                    {current.source}
                  </span>,
                ],
              ]}
              note="Tokens and keys in commands are masked."
              title={`hook ${current.id.slice(0, 8)}`}
            />
          ) : (
            <NoSelection what="a hook" />
          )
        }
        detailsLabel="Hook details"
        empty="No hooks."
        filter={{
          value: list.filter,
          onChange: list.setFilter,
          options: [
            { value: "all", label: "All", count: list.counts.all ?? 0 },
            { value: "on", label: "On", count: list.counts.on ?? 0 },
            { value: "off", label: "Off", count: list.counts.off ?? 0 },
          ],
        }}
        hint="↑↓ move · space off/on · x remove · / search"
        onSelect={list.setSelectedId}
        rowId={(item) => item.id}
        rows={list.shown}
        search={{
          inputRef: list.searchRef,
          value: list.query,
          onChange: list.setQuery,
          placeholder: "Search hooks",
        }}
        selectedId={list.selectedId}
        setSheetOpen={list.setSheetOpen}
        sheetOpen={list.sheetOpen}
        summary={`${rows.length} hooks · ${list.counts.on ?? 0} on`}
        title="Hooks"
      />
      {flow.dialog}
    </>
  );
};
