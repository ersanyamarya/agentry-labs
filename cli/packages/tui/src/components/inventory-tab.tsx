// List tab (MCP, Hooks, Plugins): rows from lib data, `e` opens the row's source file in $EDITOR.
// Plugin rows also toggle: space previews enabling or disabling the plugin, y applies (see tui/plugin-flow.ts).

import { messages } from "@agentry/core/messages";
import { useInput } from "ink";
import React from "react";
import { startBulk } from "../bulk-flow.js";
import { copilotKey } from "../copilot-flow.js";
import { startHookRemove, startHookToggle } from "../hook-flow.js";
import {
  startMcpAdd,
  startMcpRemove,
  startMcpSet,
  startMcpToggle,
} from "../mcp-flow.js";
import {
  startPluginInstall,
  startPluginToggle,
  startPluginUninstall,
} from "../plugin-flow.js";
import { copilotOf } from "../rows.js";
import type { Data, KeyHint, Row, TabProps } from "../types.js";
import { useFlow } from "../use-flow.js";
import { useList } from "../use-list.js";
import { Panes } from "./list.js";

const text = messages().flows.inventory;

interface Action {
  apply: () =>
    | { ok: boolean; text: string }
    | Promise<{ ok: boolean; text: string }>;
  preview: () =>
    | { appliable: boolean; text: string }
    | Promise<{ appliable: boolean; text: string }>;
}

interface InventoryTabProps extends Omit<TabProps, "setKeys"> {
  canAdd?: boolean;
  canInstall?: boolean;
  // MCP only: rows can be shared with Copilot (C) and the repo switch (T) works.
  canShare?: boolean;
  makeRows: (data: Data) => Row[];
  rowKeys?: (row: Row | undefined, copilot?: { trusted: boolean }) => KeyHint[];
  setKeys?: TabProps["setKeys"];
}

export const InventoryTab = ({
  data,
  api,
  dir,
  makeRows,
  active,
  height,
  layout,
  openFile,
  notify,
  reload,
  lock,
  setKeys,
  rowKeys,
  canAdd,
  canInstall,
  canShare,
  copy,
}: InventoryTabProps) => {
  const all = React.useMemo(() => makeRows(data), [data, makeRows]);
  const list = useList({ rows: all, lock });
  const { rows, cursor, row, move } = list;
  const flow = useFlow({ lock, notify, reload, copy });
  const copilot = canShare ? copilotOf(data) : undefined;
  const keys = rowKeys ? rowKeys(row, copilot) : [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is meant to run only when the listed value changes
  React.useEffect(() => {
    if (active && setKeys) {
      setKeys(keys);
    }
  }, [active, keys.join()]);
  // Marked rows (m): space or x on all of them, one combined preview and one y. Each item uses the lib call of the single-row action.
  const NOTHING: Action = {
    preview: () => ({
      appliable: false,
      text: text.nothing,
    }),
    apply: () => ({ ok: false, text: "" }),
  };
  const actionFor = (one: Row, remove: boolean): Action => {
    if (one.hook) {
      const args = {
        dir,
        selector: one.hook,
        action: remove
          ? ("remove" as const)
          : one.hookOff
            ? ("enable" as const)
            : ("disable" as const),
        scope: one.hookScope,
      };
      return {
        preview: () => api.previewHook(args),
        apply: () => api.applyHook(args),
      };
    }
    if (one.mcp) {
      const args = { dir, name: one.mcp, enable: Boolean(one.mcpEnable) };
      return remove
        ? {
            preview: () => api.previewMcpRemove(args),
            apply: () => api.applyMcpRemove(args),
          }
        : {
            preview: () => api.previewMcp(args),
            apply: () => api.applyMcp(args),
          };
    }
    if (one.plugin && remove) {
      const scopes = one.pluginScopes ?? [];
      const args = {
        dir,
        action: "uninstall" as const,
        name: one.plugin,
        scope: scopes[0],
      };
      return scopes.length === 1
        ? {
            preview: () => api.previewPluginInstall(args),
            apply: () => api.applyPluginInstall(args),
          }
        : {
            ...NOTHING,
            preview: () => ({
              appliable: false,
              text: text.notOneScope,
            }),
          };
    }
    if (one.plugin) {
      const args = { dir, id: one.plugin, enable: !one.enabled };
      return {
        preview: () => api.previewPlugin(args),
        apply: () => api.applyPlugin(args),
      };
    }
    return NOTHING;
  };
  const bulk = (remove: boolean) =>
    startBulk({
      flow,
      title: remove ? text.removeOrUninstall : text.switch,
      items: list.marked,
      preview: (one) => actionFor(one, remove).preview(),
      apply: (one) => actionFor(one, remove).apply(),
      done: remove ? text.removedDone : text.switchedDone,
    });

  useInput(
    (input, key) => {
      if (flow.handleKey(input, key) || list.handleKey(input, key)) {
        return;
      }
      if ((input === " " || input === "x") && list.marked.length > 0) {
        bulk(input === "x");
        return;
      }
      if (key.upArrow || key.downArrow) {
        flow.clear();
        move(key.upArrow ? -1 : 1);
      } else if (
        canShare &&
        copilotKey(input, { api, data, dir, flow, notify, row })
      ) {
        // C shares or stops sharing the server with Copilot, T turns Copilot on or off in this repo
      } else if (input === "e") {
        openFile(row?.file);
      } else if (input === " " && row?.plugin) {
        startPluginToggle({ api, dir, flow, row });
      } else if (input === "a" && canInstall) {
        startPluginInstall({ api, dir, flow });
      } else if (input === "i" && canInstall) {
        notify(text.nowPressA);
      } else if (input === "x" && row?.plugin) {
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        (row.pluginScopes ?? []).length > 0
          ? startPluginUninstall({ api, dir, flow, row })
          : notify(text.notInstalledHere);
      } else if (input === "a" && canAdd) {
        startMcpAdd({ api, dir, flow });
      } else if (input === "s" && row?.mcpUser) {
        startMcpSet({ api, dir, flow, row });
      } else if (input === " " && row?.hook) {
        startHookToggle({ api, dir, flow, row });
      } else if (input === "x" && row?.hook) {
        startHookRemove({ api, dir, flow, row });
      } else if (input === "x" && row?.mcp) {
        startMcpRemove({ api, dir, flow, row });
      } else if (input === " " && row?.mcp) {
        startMcpToggle({ api, dir, flow, row });
      } else if (input === " " && row?.why) {
        notify(row.why);
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
