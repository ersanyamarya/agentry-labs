// The keys that work on the current tab, then the global ones: key in bold, what it does dim. Each key is
// [key, text, short?]; the longest form that fits the width is used, so the footer is one line at every width.

import { Text } from "ink";
import type { KeyHint } from "../types.js";

const BASE_GLOBAL: KeyHint[] = [
  ["←/→", "tabs"],
  ["↑/↓", "rows"],
  ["r", "refresh"],
  ["p", "switch project"],
  ["?", "help"],
  ["q", "quit"],
];
export const GLOBAL_KEYS: KeyHint[] = [
  ...BASE_GLOBAL.slice(0, 2),
  ["/", "search"],
  ["m", "mark"],
  ...BASE_GLOBAL.slice(2),
];
const PLAIN_GLOBAL = BASE_GLOBAL.map((pair, index) =>
  index === 0 ? GLOBAL_KEYS[0] : pair
);
const CORE_KEYS: KeyHint[] = [
  ["?", "help"],
  ["q", "quit"],
];
const SHORT_GLOBAL: KeyHint[] = [
  ["←→", "tabs"],
  ["?", "help"],
  ["q", "quit"],
];

const width = (pairs: KeyHint[]) =>
  pairs.reduce(
    (total, [key, text]) => total + [...key].length + [...text].length + 3,
    0
  );
const shortForm = (keys: KeyHint[]): KeyHint[] =>
  keys.map(([key, text, short]) => [key, short ?? text]);

// Longest first: everything; the same without search/mark; short tab keys with the usual global keys; short tab keys with tabs/help/quit; only help/quit.
export const footerKeys = (keys: KeyHint[], cols: number) => {
  const tries = [
    [...keys, ...GLOBAL_KEYS],
    [...keys, ...PLAIN_GLOBAL],
    [...shortForm(keys), ...SHORT_GLOBAL],
    [...shortForm(keys), ...CORE_KEYS],
    CORE_KEYS,
  ];
  const split = (list: KeyHint[]) =>
    list.findIndex(
      (pair) =>
        pair === GLOBAL_KEYS[0] ||
        pair === SHORT_GLOBAL[0] ||
        pair === CORE_KEYS[0]
    );
  const chosen = tries.find((list) => width(list) + 2 <= cols) ?? CORE_KEYS;
  return { list: chosen, divider: Math.max(split(chosen), 0) };
};

export const Footer = ({
  keys,
  cols = 100,
}: {
  keys: KeyHint[];
  cols?: number;
}) => {
  const { list, divider } = footerKeys(keys, cols);
  return (
    <Text wrap="truncate-end">
      {list.flatMap((pair, index) => [
        ...(index === divider && index > 0
          ? [
              <Text dimColor key={`bar${index}`}>
                {"│ "}
              </Text>,
            ]
          : []),
        <Text bold key={`k${index}`}>
          {pair[0]}
        </Text>,
        <Text dimColor key={`d${index}`}>
          {` ${pair[1]}  `}
        </Text>,
      ])}
    </Text>
  );
};
