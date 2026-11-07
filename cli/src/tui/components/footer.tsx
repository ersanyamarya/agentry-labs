// The keys that work on the selected row, key bright and what it does dim, three spaces apart. `1-8 tab   ? help` sits at
// the right; every other global key is in the help screen (?). Each row key is [key, text, short?]: the short form is
// used, so the footer is one line at every width.

import { Box } from "ink";
import type { KeyHint } from "../types.js";
import { Text } from "./text.js";

const GAP = 3;
const TABS: KeyHint = ["1-8", "tab"];
const HELP: KeyHint = ["?", "help"];

const width = (pairs: KeyHint[]) =>
  pairs.reduce(
    (total, [key, text], index) =>
      total + [...key].length + 1 + [...text].length + (index > 0 ? GAP : 0),
    0
  );
const shortForm = (keys: KeyHint[]): KeyHint[] =>
  keys.map(([key, text, short]) => [key, short ?? text]);

// Left: the row's keys; right: `1-8 tab   ? help`. When they do not fit, `1-8 tab` goes first, then the last row keys;
// `? help` always stays.
export const footerKeys = (keys: KeyHint[], cols: number) => {
  const row = shortForm(keys);
  const candidates = [
    { left: row, right: [TABS, HELP] },
    ...row.map((_, index) => ({
      left: row.slice(0, row.length - index),
      right: [HELP],
    })),
    { left: [], right: [HELP] },
  ];
  return (
    candidates.find(
      ({ left, right }) =>
        width(left) + (left.length > 0 ? GAP : 0) + width(right) <= cols
    ) ?? { left: [], right: [HELP] }
  );
};

const Keys = ({ pairs }: { pairs: KeyHint[] }) => (
  <Text wrap="truncate-end">
    {pairs.flatMap(([key, text], index) => [
      <Text bold key={`k:${key}`}>
        {`${index > 0 ? " ".repeat(GAP) : ""}${key}`}
      </Text>,
      <Text dimColor key={`d:${key}`}>
        {` ${text}`}
      </Text>,
    ])}
  </Text>
);

export const Footer = ({
  keys,
  cols = 100,
}: {
  keys: KeyHint[];
  cols?: number;
}) => {
  const { left, right } = footerKeys(keys, cols);
  return (
    <Box justifyContent="space-between" width={cols}>
      <Keys pairs={left} />
      <Keys pairs={right} />
    </Box>
  );
};
