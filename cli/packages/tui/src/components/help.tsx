import { messages } from "@agentry/core/messages";
import { Box } from "ink";
import { TAB_NAMES } from "./sidebar.js";
import { Text } from "./text.js";

const { help } = messages();

// The keys of one tab, then the keys every tab shares.
export const helpKeys = (tab: number): [string, string][] => [
  ...(help.tabs[TAB_NAMES[tab] ?? ""] ?? []),
  ...help.shared,
];

export const Help = ({ tab }: { tab: number }) => (
  <Box borderStyle="round" flexDirection="column" paddingX={1}>
    <Text bold>{help.title}</Text>
    {helpKeys(tab).map(([key, what], index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
      <Box key={`${key}:${index}`}>
        <Box flexShrink={0} width={13}>
          <Text bold>{key}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text>{what}</Text>
        </Box>
      </Box>
    ))}
    <Text> </Text>
    {help.legend.map((line) => (
      <Text dimColor key={line}>
        {line}
      </Text>
    ))}
  </Box>
);
