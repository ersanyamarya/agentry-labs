// Hooks from the settings files: turn one off (parked, so it can come back), turn it back on, or remove it. Plugin hooks
// belong to their plugin and are listed read-only. Each write is core's previewHook/applyHook pair.

import { messages } from "@agentry/core/messages";
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

const m = messages();
const t = m.web.hooks;

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
          text: t.pluginHook(target.source),
        }),
        apply: async () => ({ ok: false, text: t.nothingToApply }),
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
      title: t.title(
        action === "disable"
          ? m.web.common.turnOff
          : action === "enable"
            ? m.web.common.turnOn
            : m.web.common.remove,
        target.id.slice(0, 8),
        target.event
      ),
      preview: () => client.hooks.previewHook(input),
      apply: () => client.hooks.applyHook(input),
      note: t.note,
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
            header: m.web.common.on,
            className: "w-14",
            cell: (item) => (
              <Switch
                aria-label={t.turnAria(item.event, item.state === "active")}
                checked={!item.parked && item.state === "active"}
                disabled={!editable(item)}
                onCheckedChange={() => toggle(item)}
                onClick={(event) => event.stopPropagation()}
              />
            ),
          },
          {
            header: t.hook,
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
            header: m.web.common.scope,
            className: "w-28",
            cell: (item) => <Pill tone="muted">{item.scope}</Pill>,
          },
          {
            header: m.web.common.state,
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
                      {current.parked
                        ? m.web.common.turnOn
                        : m.web.common.turnOff}
                    </ActionButton>
                    <ActionButton
                      danger
                      keyHint="x"
                      onClick={() => run(current, "remove")}
                    >
                      {m.web.common.remove}
                    </ActionButton>
                  </>
                ) : null
              }
              badge={
                <Pill tone={stateTone(current.state)}>{current.state}</Pill>
              }
              fields={[
                [t.event, current.event],
                [t.matcher, current.matcher || t.allMatchers],
                [
                  t.command,
                  <span className="font-mono text-xs" key="c">
                    {current.command}
                  </span>,
                ],
                [
                  t.source,
                  <span className="font-mono text-xs" key="s">
                    {current.source}
                  </span>,
                ],
              ]}
              note={t.detailsNote}
              title={t.heading(current.id.slice(0, 8))}
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
            { value: "on", label: m.web.common.on, count: list.counts.on ?? 0 },
            {
              value: "off",
              label: m.web.common.off,
              count: list.counts.off ?? 0,
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
        summary={t.summary(rows.length, list.counts.on ?? 0)}
        title={t.pageTitle}
      />
      {flow.dialog}
    </>
  );
};
