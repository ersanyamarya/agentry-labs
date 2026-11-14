// The left rail (docs/web-ui-design.md "Layout"): brand, project, three labelled groups of sections with counts, and a
// problems line. The active section has a `›` cursor and is cyan; when the rail has the keyboard focus it is also
// inverse, so focus shows without colour. Doctor's count is red when it holds errors, and says `err` without colour.
// Under 70 columns the rail is hidden and SectionLine, one line, takes its place.

import { Box } from "ink";
import React from "react";
import { compactTokens, middle, pad } from "../layout.js";
import { ROLE, ThemeContext, useStyle } from "../theme.js";
import { Text } from "./text.js";

export const SIDEBAR_GROUPS = [
  {
    label: "LIBRARY",
    items: ["Skills", "MCP", "Hooks", "Plugins", "Rules", "Agents"],
  },
  { label: "DISCOVER", items: ["Catalog"] },
  { label: "HEALTH", items: ["Doctor", "Backups"] },
] as const;

// Section order, which is also the order of the 1-9 keys.
export const TAB_NAMES: string[] = SIDEBAR_GROUPS.flatMap((group) => [
  ...group.items,
]);

export const WIDE_RAIL = 22;
export const NARROW_RAIL = 16;
// The rail is 22 columns from 90, 16 from 70, and hidden below that.
export const sidebarWidth = (cols: number) =>
  cols >= 90 ? WIDE_RAIL : cols >= 70 ? NARROW_RAIL : 0;

export interface TabSummary {
  error?: number;
  tokens: number;
  warning?: number;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const useCounts = (counts: Record<string, number>, summary?: TabSummary) => {
  const { color } = React.useContext(ThemeContext);
  const error = summary?.error ?? 0;
  const warning = summary?.warning ?? 0;
  // Colour off: Doctor says `err` when it holds errors.
  const countText = (name: string) =>
    counts[name] === undefined
      ? ""
      : `${counts[name]}${!color && name === "Doctor" && error > 0 ? " err" : ""}`;
  return { error, warning, countText };
};

const problemsOf = (error: number, warning: number) => {
  const total = error + warning;
  return {
    text: total > 0 ? plural(total, "problem") : "no problems",
    style: error > 0 ? ROLE.danger : warning > 0 ? ROLE.warn : ROLE.muted,
  };
};

export const Sidebar = ({
  tab,
  project,
  counts = {},
  summary,
  width = WIDE_RAIL,
  focused = false,
}: {
  tab: number;
  project: string;
  counts?: Record<string, number>;
  summary?: TabSummary;
  width?: number;
  focused?: boolean;
}) => {
  const style = useStyle();
  const { error, warning, countText } = useCounts(counts, summary);
  const { ascii } = React.useContext(ThemeContext);
  // border (1) and a space of air on the right (1)
  const inner = Math.max(width - 2, 8);
  const problems = problemsOf(error, warning);
  let index = -1;

  return (
    <Box
      borderBottom={false}
      borderDimColor
      borderLeft={false}
      borderRight
      borderStyle={ascii ? "classic" : "single"}
      borderTop={false}
      flexDirection="column"
      flexShrink={0}
      paddingRight={1}
      width={width}
    >
      <Text bold wrap="truncate-end">
        {"agentry"}
      </Text>
      <Text dimColor wrap="truncate-end">
        {middle(project, inner)}
      </Text>
      {summary ? (
        <Text dimColor wrap="truncate-end">
          {`${compactTokens(summary.tokens)} tokens`}
        </Text>
      ) : null}
      {SIDEBAR_GROUPS.map((group) => (
        <Box flexDirection="column" key={group.label} marginTop={1}>
          <Text {...style(ROLE.sidebar)} wrap="truncate-end">
            {group.label}
          </Text>
          {group.items.map((name) => {
            index += 1;
            const active = index === tab;
            const count = countText(name);
            const nameWidth = Math.max(inner - 2 - count.length - 1, 1);
            const red = name === "Doctor" && error > 0;
            return (
              <Text
                key={name}
                wrap="truncate-end"
                {...style(
                  active
                    ? { ...ROLE.selected, ...(focused && { inverse: true }) }
                    : { dimColor: true }
                )}
              >
                {`${active ? (ascii ? ">" : "›") : " "} ${pad(name, nameWidth)} `}
                <Text {...style(red ? ROLE.danger : {})}>{count}</Text>
              </Text>
            );
          })}
        </Box>
      ))}
      <Box flexDirection="column" marginTop={1}>
        <Text {...style(problems.style)} wrap="truncate-end">
          {`${ascii ? "*" : "●"} ${problems.text}`}
        </Text>
        <Text dimColor wrap="truncate-end">
          {inner >= 17 ? "? help  tab focus" : "? help"}
        </Text>
      </Box>
    </Box>
  );
};

// Narrow terminals: no rail, one line with the active section, its count, and the problems.
export const SectionLine = ({
  tab,
  counts = {},
  summary,
}: {
  tab: number;
  counts?: Record<string, number>;
  summary?: TabSummary;
}) => {
  const style = useStyle();
  const { error, warning, countText } = useCounts(counts, summary);
  const name = TAB_NAMES[tab] ?? "";
  const count = countText(name);
  const problems = problemsOf(error, warning);
  return (
    <Text wrap="truncate-end">
      <Text bold>{"agentry"}</Text>
      <Text
        {...style(ROLE.selected)}
      >{`  ‹ ${name}${count ? ` ${count}` : ""} ›`}</Text>
      <Text dimColor>{`  ${tab + 1}/${TAB_NAMES.length}  `}</Text>
      <Text {...style(problems.style)}>{problems.text}</Text>
    </Text>
  );
};
