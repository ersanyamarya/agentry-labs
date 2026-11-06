// Top of the screen: project path, the tabs with their counts, and a summary line (skill-description tokens, problems).

import { Box, Text } from "ink";
import { badgeText, stateStyle, useStyle } from "../theme.js";

export const TAB_NAMES = [
  "Skills",
  "MCP",
  "Hooks",
  "Plugins",
  "Doctor",
  "Catalog",
  "Backups",
  "Rules",
];

// Which tabs get their count first when the width is short.
const COUNT_PRIORITY = [
  "Skills",
  "Catalog",
  "Backups",
  "MCP",
  "Plugins",
  "Doctor",
  "Hooks",
  "Rules",
];

export interface TabSummary {
  active: number;
  disabled: number;
  error?: number;
  tokens: number;
  warning?: number;
}

const problems = ({
  error = 0,
  warning = 0,
}: {
  error?: number;
  warning?: number;
}) =>
  error + warning === 0
    ? { text: "no problems", color: "green" }
    : {
        text: `${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"}`,
        color: error > 0 ? "red" : "yellow",
      };

// Counts and problems first when the width is short; the full wording from 100 columns.
export const TabBar = ({
  tab,
  project,
  counts = {},
  summary,
  cols = 100,
}: {
  tab: number;
  project: string;
  counts?: Record<string, number>;
  summary?: TabSummary;
  cols?: number;
}) => {
  const style = useStyle();
  const found = problems(summary ?? {});
  const full = cols >= 100;
  // Eight tabs do not all fit with counts below about 120 columns: tighten the spacing, then show counts only where they fit.
  const label = (name: string, index: number, shown: Set<string>) =>
    `${index + 1} ${name}${shown.has(name) && counts[name] !== undefined ? ` (${counts[name]})` : ""}`;
  const widthOf = (shown: Set<string>, chrome: number) =>
    TAB_NAMES.reduce(
      (total, name, index) =>
        total + [...label(name, index, shown)].length + chrome,
      0
    );
  const roomy = full && widthOf(new Set(TAB_NAMES), 4) <= cols;
  const chrome = roomy ? 4 : full ? 3 : 1;
  const shown = new Set<string>();
  for (const name of COUNT_PRIORITY) {
    if (widthOf(new Set([...shown, name]), chrome) <= cols) {
      shown.add(name);
    }
  }
  const on = { ...stateStyle("active"), bold: true };
  const off = { ...stateStyle("disabled"), bold: true };
  return (
    <Box flexDirection="column">
      <Text dimColor wrap="truncate-middle">{`agentry  ${project}`}</Text>
      <Box gap={roomy ? 2 : 1}>
        {TAB_NAMES.map((name, index) => {
          const text = label(name, index, shown);
          return (
            <Text
              bold={index === tab}
              inverse={index === tab}
              key={name}
              wrap="truncate"
            >
              {full ? ` ${text} ` : text}
            </Text>
          );
        })}
      </Box>
      {summary ? (
        full ? (
          <Text wrap="truncate-end">
            <Text
              dimColor
            >{`~${summary.tokens} skill-description tokens  ·  plugins `}</Text>
            <Text
              {...style(on)}
            >{`${summary.active} ${badgeText("active")}`}</Text>{" "}
            <Text
              {...style(off)}
            >{`${summary.disabled} ${badgeText("disabled")}`}</Text>
            <Text dimColor>{"  ·  "}</Text>
            <Text {...style({ color: found.color })}>{found.text}</Text>
          </Text>
        ) : (
          <Text wrap="truncate-end">
            <Text {...style({ color: found.color })}>{found.text}</Text>
            <Text
              dimColor
            >{`  ·  ~${summary.tokens} tokens  ·  plugins `}</Text>
            <Text {...style(on)}>{`${summary.active}●`}</Text>{" "}
            <Text {...style(off)}>{`${summary.disabled}○`}</Text>
          </Text>
        )
      ) : null}
    </Box>
  );
};
