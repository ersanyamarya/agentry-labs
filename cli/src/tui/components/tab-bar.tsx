// Top of the screen, two lines: the project path with the skill-description tokens and problems on the right, then the
// tabs as a word and a count. The active tab is bold, cyan and underlined; Doctor's count is red when it holds errors.

import { Box } from "ink";
import React from "react";
import { compactTokens, middle } from "../layout.js";
import { ThemeContext, useStyle } from "../theme.js";
import { Text } from "./text.js";

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
  error?: number;
  tokens: number;
  warning?: number;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

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
  const { color } = React.useContext(ThemeContext);
  const error = summary?.error ?? 0;
  const warning = summary?.warning ?? 0;
  const tokens = summary ? `${compactTokens(summary.tokens)} tokens` : "";
  const problems = [
    error > 0 && { text: plural(error, "error"), color: "red" },
    warning > 0 && { text: plural(warning, "warning"), color: "yellow" },
  ].filter((part) => part !== false);
  // Colour off: the comma stands in for the colour change between errors and warnings.
  const problemText =
    problems.map(({ text }) => text).join(color ? " " : ", ") || "no problems";
  // The right side is "<tokens>  ·  <problems>"; the left is "agentry  <path>" with a space of air between them.
  const rightWidth = summary ? [...`${tokens}  ·  ${problemText}`].length : 0;
  const path = middle(project, Math.max(cols - rightWidth - 10, 8));

  // Colour off: Doctor says `err` when it holds errors, and the active tab is in brackets.
  const countText = (name: string) =>
    `${counts[name]}${!color && name === "Doctor" && error > 0 ? " err" : ""}`;
  const label = (name: string, counted: Set<string>) =>
    counted.has(name) && counts[name] !== undefined
      ? `${name} ${countText(name)}`
      : name;
  const widthOf = (counted: Set<string>, space: number) =>
    TAB_NAMES.reduce(
      (total, name, index) =>
        total +
        [...label(name, counted)].length +
        (!color && index === tab ? 2 : 0) +
        space,
      -space
    );
  const all = new Set(TAB_NAMES);
  const gap = widthOf(all, 3) <= cols ? 3 : 2;
  const shown = new Set<string>();
  for (const name of COUNT_PRIORITY) {
    if (widthOf(new Set([...shown, name]), gap) <= cols) {
      shown.add(name);
    }
  }

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text wrap="truncate-end">
          <Text bold>agentry</Text>
          <Text dimColor>{`  ${path}`}</Text>
        </Text>
        {summary ? (
          <Text wrap="truncate-end">
            <Text dimColor>{`${tokens}  ·  `}</Text>
            {problems.length > 0 ? (
              problems.map((part, index) => (
                <Text key={part.text} {...style({ color: part.color })}>
                  {index > 0 ? ` ${part.text}` : part.text}
                </Text>
              ))
            ) : (
              <Text dimColor>no problems</Text>
            )}
          </Text>
        ) : null}
      </Box>
      <Box gap={gap}>
        {TAB_NAMES.map((name, index) => {
          const active = index === tab;
          const count = shown.has(name) ? counts[name] : undefined;
          return (
            <Text
              key={name}
              wrap="truncate"
              {...style(
                active ? { color: "cyan", bold: true } : { dimColor: true }
              )}
              underline={active}
            >
              {!color && active ? "[" : null}
              {name}
              {count === undefined ? null : (
                <Text
                  {...style(
                    name === "Doctor" && error > 0 ? { color: "red" } : {}
                  )}
                >{` ${countText(name)}`}</Text>
              )}
              {!color && active ? "]" : null}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
};
