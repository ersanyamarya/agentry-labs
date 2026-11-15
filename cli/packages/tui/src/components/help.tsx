import { messages } from "@agentry/core/messages";
import { Box } from "ink";
import { Text } from "./text.js";

const { help } = messages();

export const KEYS: [string, string][] = [
  ["tab", help.tab],
  ["← / →, 1-8", help.sections],
  ["↑ / ↓", help.rows],
  ["enter", help.enter],
  ["space", help.space],
  ["a", help.addServer],
  ["g", help.globalToggle],
  ["s", help.shelve],
  ["a", help.moveToAll],
  ["o", help.moveToProject],
  ["u", help.unshelve],
  ["x", help.remove],
  ["X", help.removeNoCopy],
  ["d", help.prune],
  ["i", help.install],
  ["f", help.fetch],
  ["/", help.search],
  ["m / M", help.mark],
  ["e", help.open],
  ["y / n", help.confirm],
  ["r", help.refresh],
  ["p", help.switchProject],
  ["?", help.help],
  ["q", help.quit],
];

export const Help = () => (
  <Box borderStyle="round" flexDirection="column" paddingX={1}>
    <Text bold>{help.title}</Text>
    {KEYS.map(([key, what], index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
      <Text key={`${key}:${index}`} wrap="truncate-end">
        <Text bold>{key.padEnd(12)}</Text>
        <Text>{` ${what}`}</Text>
      </Text>
    ))}
    <Text> </Text>
    <Text dimColor>{help.legendStates}</Text>
    <Text dimColor>{help.legendNotes}</Text>
  </Box>
);
