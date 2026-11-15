// Turns lib data into list rows: { id, label, segments?, note?, details[], file?, header?, kind?, ... }. Pure, so tabs
// and tests share it. `segments` ([{ text, style }], see theme.ts) is the coloured right-hand side of a row and `note`
// is the same text without colour. Everything shown here already passed through src/lib/mask.ts (the inventory readers
// mask before returning).

import { formatAge, formatBytes } from "@agentry/core/backups";
import type { CatalogEntry } from "@agentry/core/catalog";
import { messages } from "@agentry/core/messages";
import type { SkillItem } from "@agentry/core/types";
import { type Icons, iconsFor } from "./icons.js";
import {
  badgeText,
  costStyle,
  SCOPE_NAMES,
  SEVERITY,
  scopeStyle,
  seg,
  skillBadgeText,
  stateMark,
  stateStyle,
} from "./theme.js";
import type { Cell, Data, KeyHint, Row, Seg, Style } from "./types.js";

type Skill = SkillItem;
const {
  keys: K,
  skills: S,
  catalog: C,
  rules: R,
  agents: A,
  backups: B,
  mcp: X,
  hooks: H,
  plugins: P,
  doctor: Dr,
  core: { detail: D, columns: COL, scopeTitle },
} = messages();

const tokens = (count: number | null | undefined) =>
  count === null || count === undefined ? "-" : `~${count}`;

const DIM: Style = { dimColor: true };
const cost = (count: number | null | undefined) =>
  seg(tokens(count), costStyle(count));
const badge = (text: string) =>
  seg(badgeText(text), { ...stateStyle(text), bold: true });
// A state column that is only the mark (● ○ ◐); with colour off it reads as the badge, mark and word.
const markSeg = (state: string) => {
  const { mark, style } = stateMark(state);
  return mark === " "
    ? badge(state)
    : { ...seg(mark, { ...style, bold: true }), plain: skillBadgeText(state) };
};
const scopeBadge = (scope: string) =>
  seg(SCOPE_NAMES[scope] ?? scope, scopeStyle(scope));
// States with no mark (pending-approval, rejected, broken...) keep their word in a cell, so the list still says why.
const unmarked = (state: string) =>
  stateMark(state).mark === " "
    ? seg(badgeText(state), { ...stateStyle(state), bold: true })
    : [];
// The dim column-name row above rows that carry a `state`; `state: "STATE"` lines its label up over the names.
const columns = (id: string, label: string, cells: [string, number][]) =>
  header(id, label, {
    state: COL.state,
    ...withCells(cells.map(([name, width]) => cell(seg(name, DIM), width))),
  });
// A fixed-width column of a row: parts ([seg...]) padded to `width`, left or right aligned. See components/list.tsx.
const cell = (
  parts: Seg | Seg[],
  width: number,
  align: "left" | "right" = "left"
): Cell => ({ parts: [parts].flat().filter(Boolean), width, align });
// A row's columns and their plain text (for tests and text captures).
const withCells = (cells: Cell[]) => ({
  cells,
  note: cells
    .map((one) => one.parts.map((part) => part.text).join(""))
    .join("  ")
    .trim(),
});
// Wide enough for "all projects" (the scope badge) and the "This project" / "All projects" headers.
const STATE_WIDTH = 12;
const SCOPE_WIDTH = 12;
// Skills tab: count, cost, then two state columns (P and G for shelf rows; scope and state for plugin skills).
const skillCells = (
  info: string | Seg,
  count: number | null | undefined,
  first?: Seg | Seg[],
  second?: Seg | Seg[]
) =>
  withCells([
    cell(typeof info === "string" ? (info ? seg(info, DIM) : []) : info, 9),
    cell(cost(count), 5, "right"),
    cell(first ?? [], STATE_WIDTH, "right"),
    cell(second ?? [], STATE_WIDTH, "right"),
  ]);

// The footer keys of the selected Skills row: only what works on it. [key, text, short text].
export const skillKeys = (row: Row | undefined): KeyHint[] => {
  const both: KeyHint[] = [
    ["space", K.skills.projectToggle, K.skills.projectToggleShort],
    ["g", K.skills.globalToggle, K.skills.globalToggleShort],
  ];
  if (row?.kind === "group") {
    return [...both, ["enter", K.skills.expand]];
  }
  if (row?.kind === "skill") {
    return [
      ...both,
      ["u", K.skills.unshelve],
      ["x", K.removeCopyKept, K.removeCopyKeptShort],
      ["X", K.removeNoCopy, K.removeNoCopyShort],
      ["e", K.openFile, K.openFileShort],
    ];
  }
  if (row?.plugin) {
    return [["space", K.skills.pluginToggle, K.skills.pluginToggleShort]];
  }
  if (row?.projectOnly) {
    return [
      ["s", K.skills.shelve],
      ["a", K.skills.moveToAll, K.skills.moveToAllShort],
      ["x", K.removeCopyKept, K.removeCopyKeptShort],
      ["X", K.removeNoCopy, K.removeNoCopyShort],
      ["e", K.openFile, K.openFileShort],
    ];
  }
  if (row?.shelvable) {
    return [
      ["s", K.skills.shelve],
      ["o", K.skills.moveToProject, K.skills.moveToProjectShort],
      ["x", K.removeCopyKept, K.removeCopyKeptShort],
      ["X", K.removeNoCopy, K.removeNoCopyShort],
      ["e", K.openFile, K.openFileShort],
    ];
  }
  return row?.file ? [["e", K.openFile, K.openFileShort]] : [];
};

const itemState = (item: Record<string, unknown>, field: string) =>
  item[field] ? "on" : "off";

// on when every item is linked in that scope, partial for some, off for none.
const groupState = (
  group: { items: Record<string, unknown>[] },
  field: string
) =>
  group.items.length > 0 && group.items.every((item) => item[field])
    ? "on"
    : group.items.some((item) => item[field])
      ? "partial"
      : "off";

const skillDetails = (skill: Skill) => [
  S.detail.skill(skill.name),
  S.detail.scope(SCOPE_NAMES[skill.scope] ?? skill.scope, skill.plugin),
  D.state(skillBadgeText(skill.state)),
  S.detail.tokensDescription(tokens(skill.tokens)),
  D.source(skill.source),
  ...(skill.target ? [S.detail.linksTo(skill.target)] : []),
];

// Why a loaded (non-shelf) skill row cannot be toggled, shown in the status line and the details.
const whyFixed = (skill: Skill) => {
  if (skill.scope === "project") {
    return S.whyFixed.project;
  }
  if (skill.kind === "file") {
    return S.whyFixed.global;
  }
  return skill.kind === "broken" ? S.whyFixed.broken : S.whyFixed.symlink;
};

// What the loaded skill descriptions cost, per place they come from. Shelf skills count under the scope they are linked in.
export const tokenBreakdown = (data: Data) => {
  const loaded = data.status.skills.items.filter(
    (skill) => skill.state === "active"
  );
  const sum = (keep: (skill: Skill) => boolean) =>
    loaded
      .filter(keep)
      .reduce((total, skill) => total + (skill.tokens ?? 0), 0);
  const parts = {
    global: sum((skill) => skill.scope === "user"),
    project: sum((skill) => skill.scope === "project"),
    plugins: sum((skill) => skill.scope === "plugin"),
  };
  return { ...parts, total: parts.global + parts.project + parts.plugins };
};

const header = (id: string, label: string, extra: Partial<Row> = {}): Row => ({
  id,
  header: true,
  label,
  ...extra,
});
// A blank, unselectable row between sections.
const spacer = (id: string): Row => ({
  id: `sp:${id}`,
  header: true,
  blank: true,
  label: "",
});

// Shelf groups (expandable), then what loads from global, project and plugin folders.
export const skillRows = (data: Data, expanded: Set<string> = new Set()) => {
  const rows: Row[] = [
    header(
      "h:shelf",
      S.headers.shelf,
      withCells([
        cell(seg(S.headers.skills, DIM), 9),
        cell(seg(S.headers.cost, DIM), 5, "right"),
        cell(seg(S.headers.project, DIM), STATE_WIDTH, "right"),
        cell(seg(S.headers.global, DIM), STATE_WIDTH, "right"),
      ])
    ),
  ];
  if (data.groups.length === 0) {
    rows.push({
      id: "none:shelf",
      label: S.noGroups,
      details: [S.noGroupsDetail],
    });
  }
  for (const group of data.groups) {
    const skills = group.items.filter((item) => item.kind === "skills");
    const agents = group.items.length - skills.length;
    const open = expanded.has(group.name);
    const [pState, gState] = [
      groupState(group, "project"),
      groupState(group, "global"),
    ];
    rows.push({
      id: `group:${group.name}`,
      kind: "group",
      group: group.name,
      target: group.name,
      label: `${open ? "▾" : "▸"} ${group.name}`,
      ...skillCells(
        S.count(skills.length),
        group.tokens,
        markSeg(pState),
        markSeg(gState)
      ),
      projectOn: group.items.some((item) => item.project),
      globalOn: group.items.some((item) => item.global),
      details: [
        S.group.title(group.name),
        S.group.thisProject(skillBadgeText(pState)),
        S.group.allProjects(skillBadgeText(gState)),
        S.group.contains(skills.length, agents),
        S.group.cost(tokens(group.tokens)),
        D.toggle(S.group.toggle),
      ],
    });
    if (open) {
      for (const item of group.items) {
        const isSkill = item.kind === "skills";
        rows.push({
          id: `item:${group.name}/${item.kind}/${item.name}`,
          kind: isSkill ? "skill" : "agent",
          group: group.name,
          target: isSkill ? `${group.name}/${item.name}` : undefined,
          label: `    ${item.name}${isSkill ? "" : S.agentSuffix}`,
          ...skillCells(
            isSkill ? scopeBadge("shelf") : seg(S.agentWord, DIM),
            item.tokens,
            markSeg(itemState(item, "project")),
            markSeg(itemState(item, "global"))
          ),
          projectOn: item.project,
          globalOn: item.global,
          shelved: isSkill,
          skill: item.name,
          details: [
            S.item.title(isSkill, item.name),
            S.item.bundle(group.name),
            S.group.thisProject(skillBadgeText(itemState(item, "project"))),
            S.group.allProjects(skillBadgeText(itemState(item, "global"))),
            D.tokens(tokens(item.tokens)),
            D.source(item.source),
            D.toggle(isSkill ? S.item.toggleSkill : S.item.toggleAgent),
          ],
          file: isSkill ? `${item.source}/SKILL.md` : item.source,
        });
      }
    }
  }

  const loaded = data.status.skills.items.filter((skill) => !skill.shelfGroup);
  const section = <T>(title: string, list: T[], label: (item: T) => Row) => {
    if (list.length > 0) {
      rows.push(spacer(title), header(`h:${title}`, title));
      rows.push(...list.map(label));
    }
  };
  const own = (scope: string) =>
    loaded.filter((skill) => skill.scope === scope);
  const skillRow = (skill: Skill): Row => ({
    id: `skill:${skill.scope}:${skill.source}`,
    kind: skill.scope === "user" ? "global" : "loaded",
    shelvable: skill.kind === "file" && skill.scope === "user",
    projectOnly: skill.kind === "file" && skill.scope === "project",
    skill: skill.source.split("/").at(-1),
    why: whyFixed(skill),
    label: `  ${skill.name}`,
    ...withCells([
      cell([], 9),
      cell(cost(skill.tokens), 5, "right"),
      cell(
        skill.scope === "project" ? markSeg(skill.state) : [],
        STATE_WIDTH,
        "right"
      ),
      cell(
        skill.scope === "project" ? [] : markSeg(skill.state),
        STATE_WIDTH,
        "right"
      ),
    ]),
    details: [...skillDetails(skill), D.toggle(whyFixed(skill))],
    file: skill.kind === "broken" ? undefined : `${skill.source}/SKILL.md`,
  });
  section(S.sections.global, own("user"), skillRow);
  section(S.sections.project, own("project"), skillRow);
  const plugins = data.status.plugins.items.filter((plugin) =>
    loaded.some((skill) => skill.plugin === plugin.id)
  );
  section(S.sections.plugins, plugins, (plugin) => {
    const mine = loaded.filter((skill) => skill.plugin === plugin.id);
    return {
      id: `plugin-skills:${plugin.id}`,
      kind: "loaded",
      plugin: plugin.id,
      enabled: plugin.state === "active",
      label: `  ${plugin.name}:*`,
      ...skillCells(
        S.count(mine.length),
        plugin.skillTokens,
        scopeBadge("plugin"),
        markSeg(plugin.state)
      ),
      details: [
        P.detail.plugin(plugin.id),
        D.state(skillBadgeText(plugin.state)),
        S.plugin.skills(
          mine.map((skill) => skill.name.split(":").pop()).join(", ")
        ),
        D.tokens(tokens(plugin.skillTokens)),
        D.source(String(plugin.installPath)),
        D.toggle(S.plugin.toggle),
        D.note(PLUGIN_NOTE),
      ],
    };
  });
  const sum = tokenBreakdown(data);
  rows.push(spacer("totals"), {
    id: "total:tokens",
    kind: "total",
    label: S.total.label,
    ...skillCells("", sum.total, [], []),
    details: [
      S.total.total(sum.total),
      S.total.global(sum.global),
      S.total.project(sum.project),
      S.total.plugins(sum.plugins),
      D.note(S.total.note),
    ],
  });
  return rows;
};

// Agents and MCP servers also install to this project (o); an outdated skill, agent or rule can be updated (u).
export const catalogKeys = (row: Row | undefined): KeyHint[] => {
  if (row?.kind !== "catalog") {
    return [["f", K.catalog.fetch, K.catalog.fetchShort]];
  }
  const where = row.itemKind === "agent" || row.itemKind === "mcp";
  return [
    [
      "i",
      row.itemKind === "skill"
        ? K.catalog.addToLibrary
        : where
          ? K.catalog.addAllProjects
          : K.catalog.add,
      K.catalog.add,
    ],
    ...(where
      ? [["o", K.catalog.addToProject, K.catalog.addToProjectShort] as KeyHint]
      : []),
    ...(row.outdated ? [["u", K.update] as KeyHint] : []),
    ...((row.itemKind === "skill" ||
      row.itemKind === "agent" ||
      row.itemKind === "rule") &&
    row.installed
      ? ([
          ["x", K.removeCopyKept, K.removeCopyKeptShort],
          ["X", K.removeNoCopy, K.removeNoCopyShort],
        ] as KeyHint[])
      : []),
    ["f", K.catalog.updateCatalog, K.catalog.fetchShort],
  ];
};

const ITEM_SECTIONS: [string, string][] = [
  ["agent", C.sections.agent],
  ["rule", C.sections.rule],
  ["claude-md", C.sections.claudeMd],
  ["mcp", C.sections.mcp],
];

const catalogToggle = (item: CatalogEntry) =>
  ({
    skill: item.installed ? C.toggle.skillInstalled : C.toggle.skill,
    agent: C.toggle.agent,
    rule: C.toggle.rule,
    "claude-md": C.toggle.claudeMd,
    mcp: C.toggle.mcp,
  })[item.kind] +
  (item.installed && (item.kind === "agent" || item.kind === "rule")
    ? C.toggle.removeSuffix
    : "") +
  (item.outdated
    ? item.kind === "mcp"
      ? C.toggle.outdatedMcp
      : C.toggle.outdated
    : "");

const CATALOG_ICON: Record<string, keyof Icons> = {
  skill: "skill",
  agent: "agent",
  rule: "rule",
  "claude-md": "rule",
  mcp: "mcp",
};

// The Installed column: ● where it is installed, ◐ when outdated, a dim ○ when not; colour off reads the word too.
const installedCell = (item: CatalogEntry) =>
  item.installed
    ? [
        {
          ...seg(item.outdated ? "◐" : "●", {
            ...stateStyle(item.outdated ? "partial" : "on"),
            bold: true,
          }),
          plain: item.outdated ? C.outdatedPlain : "●",
        },
        seg(` ${C.item.where(item.installed)}`),
      ]
    : { ...seg("○", DIM), plain: C.notInstalledPlain };

const catalogRow = (item: CatalogEntry, icons: Icons): Row => {
  const { installed } = item;
  return {
    id: `catalog:${item.id}`,
    kind: "catalog",
    item: item.id,
    itemKind: item.kind,
    installed,
    outdated: item.outdated,
    target: item.shelf ? `${item.shelf}/${item.name}` : item.name,
    installs: item.installs,
    label: `  ${icons[CATALOG_ICON[item.kind] ?? "rule"]} ${item.name}`,
    labelRuns: [{ len: 2 }, { len: 1, style: DIM }],
    ...withCells([
      cell(cost(item.tokens), 5, "right"),
      cell(installedCell(item), 17),
    ]),
    details: [
      `item: ${item.id}`,
      C.item.bundle(item.bundle),
      installed
        ? C.item.installed(Boolean(item.outdated), C.item.where(installed))
        : C.item.notInstalled,
      ...(item.outdated ? [C.item.outdated] : []),
      D.tokens(
        item.tokens === null
          ? "-"
          : C.item.tokens(
              tokens(item.tokens),
              item.kind === "skill" || item.kind === "agent"
            )
      ),
      D.note(item.description || C.item.noDescription),
      D.toggle(catalogToggle(item)),
    ],
  };
};

// The skills by bundle, then agents, rules, CLAUDE.md files and MCP servers; installed ones show where they are.
export const catalogRows = (data: Data, icons: Icons = iconsFor({})): Row[] => {
  const { fetched, entries } = data.catalog;
  if (!fetched) {
    return [
      {
        id: "none:catalog",
        label: C.notFetched,
        details: [C.notFetchedDetail, D.toggle(C.notFetchedToggle)],
      },
    ];
  }
  const rows: Row[] = [];
  let bundle: string | undefined;
  for (const skill of entries.filter((entry) => entry.kind === "skill")) {
    if (skill.bundle !== bundle) {
      ({ bundle } = skill);
      rows.push(
        ...(rows.length > 0 ? [spacer(bundle)] : []),
        header(`h:${bundle}`, C.bundleHeader(bundle))
      );
    }
    rows.push(catalogRow(skill, icons));
  }
  for (const [kind, title] of ITEM_SECTIONS) {
    const list = entries.filter((entry) => entry.kind === kind);
    if (list.length > 0) {
      rows.push(
        ...(rows.length > 0 ? [spacer(kind)] : []),
        header(`h:${kind}`, title),
        ...list.map((entry) => catalogRow(entry, icons))
      );
    }
  }
  return rows;
};

export const ruleKeys = (row: Row | undefined): KeyHint[] =>
  row?.ruleFile
    ? [
        ["x", K.removeCopyKept, K.removeCopyKeptShort],
        ["X", K.removeNoCopy, K.removeNoCopyShort],
        ["e", K.openFile, K.openFileShort],
      ]
    : [];

// CLAUDE.md and rule files Claude Code loads every session (src/lib/rules.ts), user then project, with their whole-file cost.
export const ruleRows = (data: Data): Row[] => {
  if (data.rules.length === 0) {
    return [
      {
        id: "none:rules",
        label: R.empty,
        details: [R.emptyDetail, D.note(R.emptyNote)],
      },
    ];
  }
  const rows = [
    header(
      "h:rules",
      R.headers.files,
      withCells([
        cell(seg(R.headers.cost, DIM), 5, "right"),
        cell(seg(R.headers.kind, DIM), 9),
      ])
    ),
  ];
  for (const [scope, title] of [
    ["user", scopeTitle.user],
    ["project", scopeTitle.project],
  ]) {
    const list = data.rules.filter((entry) => entry.scope === scope);
    if (list.length > 0) {
      rows.push(spacer(scope), header(`h:${scope}`, title));
      rows.push(
        ...list.map((entry) => ({
          id: `rule:${entry.id}`,
          ruleFile: entry.path,
          ruleTitle: entry.title,
          label: `  ${entry.label}`,
          ...withCells([
            cell(cost(entry.tokens), 5, "right"),
            cell(
              seg(entry.kind === "rule" ? R.kindRule : R.kindClaudeMd, DIM),
              9
            ),
          ]),
          details: [
            R.detail.file(entry.label),
            D.scope(title),
            R.detail.kind(entry.kind === "rule" ? R.kindRule : R.kindClaudeMd),
            D.tokens(R.detail.tokens(tokens(entry.tokens))),
            D.path(entry.path),
            D.note(R.detail.note),
            D.toggle(R.detail.toggle),
          ],
          file: entry.path,
        }))
      );
    }
  }
  return rows;
};

export const agentKeys = (row: Row | undefined): KeyHint[] =>
  row?.file ? [["e", K.openFile, K.openFileShort]] : [];

// The subagents Claude Code can start (core/agents.ts), user then project. Cost is the name and description Claude lists.
export const agentRows = (data: Data): Row[] => {
  if (data.agents.length === 0) {
    return [
      {
        id: "none:agents",
        label: A.empty,
        details: [A.emptyDetail, D.note(A.emptyNote)],
      },
    ];
  }
  const rows = [
    header(
      "h:agents",
      A.headers.agents,
      withCells([
        cell(seg(A.headers.cost, DIM), 5, "right"),
        cell(seg(A.headers.model, DIM), 8),
      ])
    ),
  ];
  for (const [scope, title] of [
    ["user", scopeTitle.user],
    ["project", scopeTitle.project],
  ]) {
    const list = data.agents.filter((entry) => entry.scope === scope);
    if (list.length > 0) {
      rows.push(spacer(`agents-${scope}`), header(`h:agents-${scope}`, title));
      rows.push(
        ...list.map((entry) => ({
          id: `agent:${entry.id}`,
          label: `  ${entry.name}`,
          ...withCells([
            cell(cost(entry.tokens), 5, "right"),
            cell(seg(entry.model ?? "-", DIM), 8),
          ]),
          details: [
            A.detail.agent(entry.name),
            D.scope(title),
            ...(entry.description
              ? [A.detail.description(entry.description)]
              : []),
            ...(entry.model ? [A.detail.model(entry.model)] : []),
            ...(entry.tools ? [A.detail.tools(entry.tools)] : []),
            D.tokens(`${tokens(entry.tokens)} ${A.detail.tokens}`),
            D.path(entry.path),
            D.note(A.detail.note),
          ],
          file: entry.path,
        }))
      );
    }
  }
  return rows;
};

export const BACKUPS_KEYS: KeyHint[] = [
  ["d", K.backups.prune, K.backups.pruneShort],
];

export const backupKeys = (row: Row | undefined): KeyHint[] => [
  ...(row?.backup
    ? [
        ...(row.restorable ? [["u", K.backups.restore] as KeyHint] : []),
        ["x", K.backups.delete] as KeyHint,
      ]
    : []),
  ...BACKUPS_KEYS,
];

// Fix sets and removed-skill copies, newest first.
export const backupRows = (data: Data): Row[] =>
  data.backups.length === 0
    ? [
        {
          id: "none:backups",
          label: B.empty,
          details: [B.emptyDetail, D.note(B.emptyNote)],
        },
      ]
    : [
        header(
          "h:backups",
          B.headers.backup,
          withCells([
            cell(seg(B.headers.kind, DIM), 8),
            cell(seg(B.headers.size, DIM), 9, "right"),
            cell(seg(B.headers.age, DIM), 6, "right"),
          ])
        ),
        ...data.backups.map((entry) => ({
          id: `backup:${entry.id}`,
          backup: entry.id,
          restorable: entry.kind === "removed" && Boolean(entry.from),
          label: `  ${entry.name}`,
          ...withCells([
            cell(seg(entry.kind === "fix" ? B.fixSet : B.removed, DIM), 8),
            cell(seg(formatBytes(entry.bytes), DIM), 9, "right"),
            cell(seg(formatAge(entry.days), DIM), 6, "right"),
          ]),
          details: [
            B.detail.backup(entry.id),
            B.detail.kind(
              entry.kind === "fix" ? B.fixSet : entry.detail.replace(/,.*/, "")
            ),
            B.detail.made(entry.date),
            B.detail.size(formatBytes(entry.bytes)),
            D.path(entry.path),
            ...(entry.from ? [B.detail.from(entry.from)] : []),
            D.note(entry.detail),
            entry.kind === "fix"
              ? D.toggle(
                  B.detail.toggleFix +
                    (entry.undone ? "" : B.detail.toggleFixNotUndone)
                )
              : D.toggle(B.detail.toggleRemoved(Boolean(entry.from))),
          ],
        })),
      ];

export const PLUGIN_NOTE = P.note;

export const mcpKeys = (row: Row | undefined): KeyHint[] => [
  ["a", K.mcp.add, K.mcp.addShort],
  ...(row?.mcp
    ? [
        ...(row.mcpUser ? [["s", K.mcp.edit, K.openFileShort] as KeyHint] : []),
        ["x", K.remove] as KeyHint,
        [
          "space",
          row.mcpEnable
            ? row.mcpProject
              ? K.mcp.turnOnHere
              : K.mcp.addBack
            : row.mcpProject
              ? K.mcp.turnOffHere
              : K.mcp.turnOffSaved,
          row.mcpEnable ? K.mcp.on : K.mcp.off,
        ] as KeyHint,
      ]
    : []),
  ...(row?.file ? [["e", K.openFile, K.openFileShort] as KeyHint] : []),
];

// Hooks: settings hooks switch off/on and can be removed; plugin hooks only open their file.
export const hookKeys = (row: Row | undefined): KeyHint[] => [
  ...(row?.hook
    ? ([
        [
          "space",
          row.hookOff ? K.hooks.turnOn : K.hooks.turnOffSaved,
          row.hookOff ? K.hooks.on : K.hooks.off,
        ],
        ["x", K.remove],
      ] as KeyHint[])
    : []),
  ...(row?.file ? [["e", K.openFile, K.openFileShort] as KeyHint] : []),
];

const MCP_WHY: Record<string, string> = {
  plugin: X.why.plugin,
  project: X.why.project,
  local: X.why.local,
  "desktop-config": X.why.desktopConfig,
  "desktop-extension": X.why.desktopExtension,
};

export const mcpRows = (data: Data): Row[] => [
  ...(data.status.mcp.servers.length > 0 || data.parked?.length
    ? [
        columns("h:cols", X.columns.server, [
          [COL.scope, SCOPE_WIDTH],
          [X.columns.transport, 9],
          ["", 16],
        ]),
      ]
    : []),
  ...data.status.mcp.servers.map((server) => {
    const target =
      server.url ?? [server.command, ...(server.args ?? [])].join(" ");
    const env = Object.entries(server.env ?? {}).map(([key, value]) =>
      X.detail.env(key, value)
    );
    const headers = Object.entries(server.headers ?? {}).map(([key, value]) =>
      X.detail.header(key, value)
    );
    const mine =
      server.scope === "user" ||
      ["plugin", "project", "local"].includes(server.scope);
    return {
      id: `mcp:${server.scope}:${server.name}:${server.source}`,
      label: server.name,
      ...(mine
        ? {
            mcp: server.name,
            mcpUser: server.scope === "user",
            mcpEnable: server.scope !== "user" && server.state === "disabled",
            mcpProject: server.scope !== "user",
          }
        : { why: MCP_WHY[server.scope] }),
      state: server.state,
      ...withCells([
        cell(scopeBadge(server.scope), SCOPE_WIDTH),
        cell(seg(server.transport, DIM), 9),
        cell(unmarked(server.state), 16),
      ]),
      file: server.source,
      details: [
        X.detail.server(server.name),
        D.scope(server.scope),
        D.state(badgeText(server.state)),
        X.detail.transport(server.transport),
        X.detail.target(Boolean(server.url), target),
        ...env,
        ...headers,
        X.detail.tokens,
        D.source(server.source),
        D.toggle(
          mine
            ? server.scope === "user"
              ? X.detail.toggleUser
              : X.detail.toggleOther
            : (MCP_WHY[server.scope] ?? X.detail.notManaged)
        ),
      ],
    };
  }),
  ...(Array.isArray(data.parked) ? data.parked : []).map((entry) => ({
    id: `parked:${entry.name}`,
    label: entry.name,
    mcp: entry.name,
    mcpEnable: true,
    state: "off",
    ...withCells([
      cell(scopeBadge("user"), SCOPE_WIDTH),
      cell(seg("-", DIM), 9),
      cell([], 16),
    ]),
    details: [
      X.detail.server(entry.name),
      D.scope("user"),
      X.detail.parkedState(badgeText("off")),
      X.detail.config(entry.summary),
      X.detail.turnedOff(entry.parkedAt ?? "-"),
      D.toggle(X.detail.parkedToggle),
    ],
  })),
];

const HOOK_WHY = H.why;

export const hookRows = (data: Data): Row[] => [
  ...(data.status.hooks.items.length > 0 || data.parkedHooks?.length
    ? [
        columns("h:cols", H.columns.eventMatcher, [
          [COL.scope, SCOPE_WIDTH],
          ["", 10],
        ]),
      ]
    : []),
  ...data.status.hooks.items.map((hook, index) => {
    const mine = hook.scope !== "plugin" && hook.id;
    return {
      id: `hook:${index}:${hook.source}`,
      label: `${hook.event}  ${hook.matcher}`,
      ...(mine
        ? { hook: hook.id, hookScope: hook.scope, hookOff: false }
        : { why: HOOK_WHY }),
      state: hook.state,
      ...withCells([
        cell(scopeBadge(hook.scope), SCOPE_WIDTH),
        cell(unmarked(hook.state), 10),
      ]),
      file: hook.source,
      details: [
        H.detail.id(hook.id ?? "-"),
        H.detail.event(hook.event),
        H.detail.matcher(hook.matcher),
        H.detail.type(hook.type),
        H.detail.command(hook.command ?? `(${hook.type})`),
        S.detail.scope(hook.scope, hook.plugin),
        D.state(hook.state),
        H.detail.output,
        D.source(hook.source),
        D.toggle(mine ? H.detail.toggle : HOOK_WHY),
      ],
    };
  }),
  ...(Array.isArray(data.parkedHooks) ? data.parkedHooks : []).map((hook) => ({
    id: `parked-hook:${hook.scope}:${hook.id}`,
    label: `${hook.event}  ${hook.matcher}`,
    hook: hook.id,
    hookScope: hook.scope,
    hookOff: true,
    state: "off",
    ...withCells([cell(scopeBadge(hook.scope), SCOPE_WIDTH), cell([], 10)]),
    file: hook.source,
    details: [
      H.detail.id(hook.id),
      H.detail.event(hook.event),
      H.detail.matcher(hook.matcher),
      H.detail.command(hook.command ?? `(${hook.type})`),
      D.scope(hook.scope),
      H.detail.parkedState(badgeText("off")),
      H.detail.turnedOff(hook.parkedAt ?? "-"),
      H.detail.wasIn(hook.source),
      D.toggle(H.detail.parkedToggle),
    ],
  })),
];

export const pluginKeys = (row: Row | undefined): KeyHint[] => [
  ["space", K.plugins.toggle, K.plugins.toggleShort],
  ["i", K.plugins.install, K.plugins.installShort],
  ...((row?.pluginScopes?.length ?? 0) > 0
    ? [["x", K.plugins.uninstall] as KeyHint]
    : []),
  ["e", K.openFile, K.openFileShort],
];

export const pluginRows = (data: Data): Row[] => [
  ...(data.status.plugins.items.length > 0
    ? [
        columns("h:cols", P.columns.plugin, [
          [COL.scope, SCOPE_WIDTH],
          [P.columns.version, 8],
          ["", 10],
        ]),
      ]
    : []),
  ...data.status.plugins.items.map(
    (plugin): Row => ({
      id: `plugin:${plugin.id}`,
      state: plugin.state,
      plugin: plugin.id,
      pluginScopes: plugin.installs
        .filter((install) => install.appliesHere)
        .map((install) => install.scope),
      enabled: plugin.state === "active",
      label: plugin.id,
      ...withCells([
        cell(
          plugin.installScope ? scopeBadge(plugin.installScope) : [],
          SCOPE_WIDTH
        ),
        cell(seg(plugin.version ?? "", DIM), 8),
        cell(unmarked(plugin.state), 10),
      ]),
      file: plugin.enabledBy?.source,
      details: [
        P.detail.plugin(plugin.id),
        P.detail.version(plugin.version),
        D.state(badgeText(plugin.state)),
        P.detail.skillTokens(tokens(plugin.skillTokens)),
        ...plugin.installs.map((install) =>
          P.detail.install(
            install.scope,
            install.projectPath,
            Boolean(install.appliesHere)
          )
        ),
        P.detail.enabledBy(plugin.enabledBy?.source ?? "-"),
        D.path(plugin.installPath ?? P.detail.notInstalled),
        D.toggle(P.detail.toggle(plugin.state === "active")),
        D.note(PLUGIN_NOTE),
      ],
    })
  ),
];

export const DOCTOR_KEYS: KeyHint[] = [
  ["enter", K.doctor.previewFix, K.doctor.previewFixShort],
  ["u", K.doctor.undo, K.doctor.undoShort],
  ["e", K.openFile, K.openFileShort],
];

// Which kind of thing a doctor finding is about, from its rule id (a finding has no kind field). Rules that are about
// none of them (unset-placeholder, stale-name) get no glyph.
export const findingKind = (id: string): keyof Icons | undefined =>
  /skill|shelf/.test(id)
    ? "skill"
    : /mcp/.test(id)
      ? "mcp"
      : /hook/.test(id)
        ? "hook"
        : /plugin/.test(id)
          ? "plugin"
          : undefined;

export const doctorRows = (data: Data, icons: Icons = iconsFor({})): Row[] => {
  const rows: Row[] = [];
  for (const severity of ["error", "warning", "info"] as const) {
    const mine = data.doctor.findings.filter(
      (finding) => finding.severity === severity
    );
    if (mine.length === 0) {
      continue;
    }
    const { icon, style, heading } = SEVERITY[severity];
    const kindOf = (id: string) => {
      const kind = findingKind(id);
      return kind ? icons[kind] : " ";
    };
    rows.push(
      ...(rows.length > 0 ? [spacer(severity)] : []),
      header(`h:${severity}`, `${icon} ${heading} (${mine.length})`, {
        severity,
        labelStyle: style,
      })
    );
    mine.forEach((finding, index) => {
      rows.push({
        id: `finding:${finding.id}:${finding.file}:${index}`,
        kind: "finding",
        severity,
        finding,
        label: `  ${kindOf(finding.id)} [${finding.id}] ${finding.message}`,
        labelRuns: [
          { len: 2 },
          { len: 1, style: DIM },
          { len: 1 },
          { len: finding.id.length + 2, style },
        ],
        file: finding.file,
        details: [
          Dr.detail.finding(severity, finding.id),
          finding.message,
          Dr.detail.file(finding.file, finding.line),
          ...(finding.fix
            ? [Dr.detail.advice(finding.fix)]
            : [Dr.detail.noAdvice]),
        ],
      });
    });
  }
  return rows;
};
