// The Skills screen's rows, built from `load`: one row per shelved skill (from the shelf groups), per skill installed in
// ~/.claude or this project, and per plugin skill. Pure, so it is tested without a server.

import { messages } from "@agentry/core/messages";
import type { LoadData } from "../contract/index.js";
import type { Scope } from "./scope.js";

export type SkillKind = "shelf" | "global" | "project" | "plugin";

export interface SkillRow {
  broken: boolean;
  global: boolean;
  group?: string;
  id: string;
  kind: SkillKind;
  name: string;
  project: boolean;
  source: string;
  // The shelf target core resolves ("group/skill"), or the folder name for an installed skill.
  target: string;
  tokens: number | null;
}

export const skillRows = (load: LoadData): SkillRow[] => {
  const rows: SkillRow[] = [];
  for (const group of load.groups.items) {
    for (const item of group.items) {
      if (item.kind === "skills") {
        rows.push({
          id: `shelf:${group.name}/${item.name}`,
          kind: "shelf",
          name: item.name,
          group: group.name,
          target: `${group.name}/${item.name}`,
          project: item.project,
          global: item.global,
          source: item.source,
          tokens: item.tokens,
          broken: false,
        });
      }
    }
  }
  for (const item of load.status.skills.items) {
    // A shelf link also shows up here; it already has its row under its group.
    if (item.shelfGroup) {
      continue;
    }
    const kind: SkillKind =
      item.scope === "user"
        ? "global"
        : item.scope === "project"
          ? "project"
          : "plugin";
    rows.push({
      id: `${kind}:${item.plugin ?? ""}:${item.name}`,
      kind,
      name: item.name,
      target: item.name,
      project: kind === "project",
      global: kind === "global",
      source: item.source,
      tokens: item.tokens,
      broken: item.state === "broken" || item.kind === "broken",
    });
  }
  return rows;
};

// Whether the row is on in the scope the switch acts on. Installed skills are always on where they live.
export const isOn = (row: SkillRow, scope: Scope) =>
  row.kind === "shelf" ? (scope === "global" ? row.global : row.project) : true;

const m = messages();

export const scopeLabel = (row: SkillRow) => {
  if (row.kind === "plugin") {
    return m.web.skills.scope.plugin;
  }
  if (row.global && row.project) {
    return m.web.skills.scope.globalAndProject;
  }
  if (row.global) {
    return m.skills.headers.global;
  }
  return row.project ? m.core.scopeTitle.project : m.skills.headers.shelf;
};

// "group:<name>" shows one shelf group.
export type Filter = "all" | "on" | "project" | "shelf" | `group:${string}`;

export const matchesFilter = (row: SkillRow, filter: Filter) => {
  if (filter.startsWith("group:")) {
    return row.group === filter.slice("group:".length);
  }
  switch (filter) {
    case "on":
      return row.global || row.project || row.kind === "plugin";
    case "project":
      return row.project;
    case "shelf":
      return row.kind === "shelf" && !row.global && !row.project;
    default:
      return true;
  }
};

export const filterRows = (rows: SkillRow[], filter: Filter, query: string) => {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      matchesFilter(row, filter) &&
      (needle === "" ||
        `${row.group ?? ""}/${row.name}`.toLowerCase().includes(needle))
  );
};

export const filterCounts = (rows: SkillRow[]) => ({
  all: rows.length,
  on: rows.filter((row) => matchesFilter(row, "on")).length,
  project: rows.filter((row) => matchesFilter(row, "project")).length,
  shelf: rows.filter((row) => matchesFilter(row, "shelf")).length,
});

export interface GroupSummary {
  count: number;
  name: string;
  // On in the scope the switch acts on, for every skill in the group.
  on: boolean;
}

export const groupSummaries = (
  rows: SkillRow[],
  scope: Scope
): GroupSummary[] => {
  const byName = new Map<string, SkillRow[]>();
  for (const row of rows) {
    if (row.group) {
      byName.set(row.group, [...(byName.get(row.group) ?? []), row]);
    }
  }
  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]) => ({
      name,
      count: items.length,
      on: items.every((row) => isOn(row, scope)),
    }));
};
