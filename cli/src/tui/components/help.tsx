import { Box } from "ink";
import { Text } from "./text.js";

export const KEYS: [string, string][] = [
  ["← / →, 1-8", "switch tab"],
  ["↑ / ↓", "move between rows"],
  ["enter", "details, expand a group, preview a fix"],
  [
    "space",
    "Skills: shelf row on/off for this project; plugin rows: on/off; MCP, Hooks: turn off (saved) / add back",
  ],
  ["a", "MCP: add a server (user or project scope)"],
  ["g", "Skills: shelf row on/off globally"],
  [
    "s",
    "Skills: move a global skill onto the shelf; MCP: edit env/args of a user server",
  ],
  ["a", "Skills: move a project-only skill to ~/.claude/skills (all projects)"],
  [
    "o",
    "Skills: move a global skill into this project only; Catalog: add an agent or MCP server to this project only",
  ],
  [
    "u",
    "Skills: unshelve a skill; Doctor: undo the last fix set; Backups: restore a removed skill or updated copy; Catalog: update an outdated item (skill, agent, rule, CLAUDE.md, MCP server)",
  ],
  [
    "x",
    "Skills: remove a skill; Catalog: remove an installed skill, agent or rule (a copy is kept in the backups); Rules: remove a file; Backups: delete a backup; MCP, Hooks: remove; Plugins: uninstall",
  ],
  ["X", "Skills, Catalog, Rules: remove and keep no copy"],
  ["d", "Backups: delete the backups 30+ days old"],
  [
    "i",
    "Catalog: add the selected skill (to the shelf, off), agent, rule, CLAUDE.md or MCP server; Plugins: install a plugin",
  ],
  ["f", "Catalog: fetch or update the agentry-labs catalog"],
  [
    "/",
    "search the rows of the current tab: type, enter keeps it, esc clears it (q and tab keys are text while typing)",
  ],
  [
    "m / M",
    "mark or unmark the selected row / clear marks; space, g, x, X, i, u then apply to all marked rows, one preview, one y",
  ],
  ["e", "open the selected row's file in $EDITOR"],
  ["y / n", "confirm or cancel a previewed change; c copies the preview"],
  ["r", "refresh"],
  ["p", "switch project"],
  ["?", "this help"],
  ["q", "quit"],
];

export const Help = () => (
  <Box borderStyle="round" flexDirection="column" paddingX={1}>
    <Text bold>{"Keys (? or esc to close)"}</Text>
    {KEYS.map(([key, what], index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; the list is rebuilt on every render
      <Text key={`${key}:${index}`} wrap="truncate-end">
        <Text bold>{key.padEnd(12)}</Text>
        <Text>{` ${what}`}</Text>
      </Text>
    ))}
    <Text> </Text>
    <Text dimColor>
      {
        "● on / active green, ○ off / disabled gray, ◐ partial yellow. Cost: dim < 100, yellow < 500, red 500+."
      }
    </Text>
    <Text dimColor>
      {
        "* marks a row. Skills > Token total: description tokens per global, this project, plugins. No colour: set NO_COLOR. Plugin changes apply to new sessions (undo: agentry fix --undo)."
      }
    </Text>
  </Box>
);
