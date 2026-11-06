// Catalog tab: the agentry-labs skills (by bundle), agents, rules, CLAUDE.md files and MCP servers. f fetches (or updates)
// the cached clone, i installs the selected item (o: into this project, for agents and MCP servers), u overwrites an
// outdated installed one with the catalog's copy (an MCP server: its args and missing env keys), x removes an installed skill, agent or rule. Each is previewed and waits for y.

import { useInput } from "ink";
import React from "react";
import { startBulk } from "../bulk-flow.js";
import { startRemove } from "../remove-flow.js";
import { catalogKeys, catalogRows } from "../rows.js";
import type { Row, TabProps } from "../types.js";
import { useFlow } from "../use-flow.js";
import { useList } from "../use-list.js";
import { Panes } from "./list.js";

const DONE: Record<string, string> = {
  skill: "to the shelf, off. Turn it on from the Skills tab",
  agent: "as an agent",
  rule: "to ~/.claude/rules",
  "claude-md": "as this project's CLAUDE.md",
  mcp: "as an MCP server. It applies to sessions started after this",
};

export const CatalogTab = ({
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
  const all = React.useMemo(() => catalogRows(data), [data]);
  const list = useList({ rows: all, lock });
  const { rows, cursor, row, move } = list;
  const flow = useFlow({ lock, notify, reload, copy });
  const keys = catalogKeys(row);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is meant to run only when the listed value changes
  React.useEffect(() => {
    if (active) {
      setKeys(keys);
    }
  }, [active, keys.join()]);

  const fetchCatalog = async () => {
    notify("Fetching the catalog...");
    const result = await api.refreshCatalog({ dir });
    notify(result.ok ? result.text : "");
    flow.begin(
      result.ok ? null : { kind: "result", ok: false, text: result.text }
    );
    await reload();
  };

  // Only called with a catalog row selected, so `item` is set.
  const itemOf = (one: Row) => one.item ?? "";
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const nameOf = () => itemOf(row!).slice(itemOf(row!).indexOf("/") + 1);

  const startAdd = async (project: boolean) => {
    // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
    const current = row!;
    const names = [itemOf(current)];
    const preview = await api.addFromCatalog({
      dir,
      names,
      project,
      dryRun: true,
    });
    flow.begin({
      kind: "confirm",
      title:
        current.itemKind === "skill"
          ? `Add ${nameOf()} to the shelf (preview)`
          : `Add ${current.item}${project ? " to this project" : ""} (preview)`,
      text: preview.text,
      appliable: preview.ok,
      apply: () => api.addFromCatalog({ dir, names, project }),
      done: `Added ${nameOf()} ${DONE[current.itemKind ?? ""]}.`,
    });
  };

  const startUpdate = async () => {
    // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
    const names = [itemOf(row!)];
    const preview = await api.updateFromCatalog({ dir, names, dryRun: true });
    flow.begin({
      kind: "confirm",
      // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
      title: `Update ${row!.item} (preview)`,
      text: preview.text,
      appliable: preview.ok,
      apply: () => api.updateFromCatalog({ dir, names }),
      // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
      done: `Updated ${row!.item}; the old copy is in ~/.claude/backups/agentry/updated/.`,
    });
  };

  // Marked rows (m): i adds, u updates, x removes all of them (the ones it applies to) after one preview and one y.
  const catalogMarked = (keep: (one: Row) => boolean) =>
    list.marked.filter((one) => one.kind === "catalog" && keep(one));
  const bulkCatalog = async (
    call: "addFromCatalog" | "updateFromCatalog",
    items: Row[],
    title: string,
    done: string
  ) => {
    const names = items.map(itemOf);
    const preview = await api[call]({ dir, names, dryRun: true });
    flow.begin({
      kind: "confirm",
      title: `${title} ${names.length} (preview)`,
      text: preview.text,
      appliable: preview.ok,
      apply: () => api[call]({ dir, names }),
      done,
    });
  };

  // x/X on an installed skill, agent or rule: an agent's global copy (else the project's); a rule by its file.
  const removeRow = (backup: boolean) => {
    // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
    const current = row!;
    if (!["skill", "agent", "rule"].includes(current.itemKind ?? "")) {
      return notify(
        "x removes a skill, agent or rule here; remove an MCP server from the MCP tab, CLAUDE.md from the Rules tab."
      );
    }
    if (!current.installed) {
      return notify(`${current.item} is not installed.`);
    }
    if (current.itemKind === "skill") {
      return startRemove({
        api,
        dir,
        flow,
        backup,
        target: current.target ?? "",
        label: current.target,
      });
    }
    const installs = current.installs ?? [];
    const install = installs.find((one) => one.scope === "user") ?? installs[0];
    return current.itemKind === "agent"
      ? startRemove({
          api,
          dir,
          flow,
          backup,
          target: itemOf(current),
          label: current.item,
          project: install.scope === "project",
          call: "removeAgent",
        })
      : startRemove({
          api,
          dir,
          flow,
          backup,
          target: install.path ?? "",
          label: current.item,
          call: "removeRule",
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
      } else if (input === "f") {
        fetchCatalog();
      } else if (
        input === "i" &&
        catalogMarked((one) => !(one.itemKind === "skill" && one.installed))
          .length > 0
      ) {
        bulkCatalog(
          "addFromCatalog",
          catalogMarked((one) => !(one.itemKind === "skill" && one.installed)),
          "Add",
          "Added the marked items (agents and MCP servers to all projects)."
        );
      } else if (
        input === "u" &&
        catalogMarked((one) => Boolean(one.outdated)).length > 0
      ) {
        bulkCatalog(
          "updateFromCatalog",
          catalogMarked((one) => Boolean(one.outdated)),
          "Update",
          "Updated the marked items; the old copies are in ~/.claude/backups/agentry/updated/."
        );
      } else if (
        (input === "x" || input === "X") &&
        catalogMarked(
          (one) => one.itemKind === "skill" && Boolean(one.installed)
        ).length > 0
      ) {
        const backup = input === "x";
        startBulk({
          flow,
          title: "Remove skills",
          items: catalogMarked(
            (one) => one.itemKind === "skill" && Boolean(one.installed)
          ),
          preview: async (one) => {
            const result = await api.removeSkill({
              dir,
              target: one.target ?? "",
              backup,
              dryRun: true,
            });
            return { appliable: result.ok, text: result.text };
          },
          apply: (one) =>
            api.removeSkill({ dir, target: one.target ?? "", backup }),
          done: backup
            ? "Removed; copies are in ~/.claude/backups/agentry/removed/"
            : "Removed; no copies were kept",
        });
      } else if (input === "i" && row?.kind === "catalog") {
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        row.itemKind === "skill" && row.installed
          ? notify(`${row.item} is already installed (${row.installed}).`)
          : startAdd(false);
      } else if (input === "o" && row?.kind === "catalog") {
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        row.itemKind === "agent" || row.itemKind === "mcp"
          ? startAdd(true)
          : notify(
              "o adds an agent or an MCP server to this project only; use i for this item."
            );
      } else if (input === "u" && row?.kind === "catalog") {
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        row.outdated
          ? startUpdate()
          : notify(
              row.installed
                ? `${row.item} is up to date.`
                : `${row.item} is not installed.`
            );
      } else if ((input === "x" || input === "X") && row?.kind === "catalog") {
        removeRow(input === "x");
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
