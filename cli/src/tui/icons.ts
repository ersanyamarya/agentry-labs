// Icons by kind. Unicode by default (the `figures` package), plain ASCII when colour is off (NO_COLOR), the terminal is
// dumb (TERM=dumb) or AGENTRY_ASCII=1, and Nerd Font glyphs only when AGENTRY_ICONS=nerd (they need the user's font).

import figures, { fallbackSymbols } from "figures";

export interface Icons {
  agent: string;
  backup: string;
  catalog: string;
  doctor: string;
  error: string;
  hook: string;
  info: string;
  mcp: string;
  off: string;
  on: string;
  plugin: string;
  pointer: string;
  rule: string;
  skill: string;
  warning: string;
}
export type IconMode = "ascii" | "nerd" | "unicode";

const UNICODE: Icons = {
  skill: "✦",
  agent: "◆",
  rule: "§",
  plugin: "⬡",
  mcp: "⇄",
  hook: "⚑",
  backup: "⟲",
  catalog: "☰",
  doctor: "✚",
  on: figures.radioOn,
  off: figures.radioOff,
  warning: figures.warning,
  error: figures.cross,
  info: figures.info,
  pointer: figures.pointer,
};

const ASCII: Icons = {
  skill: "*",
  agent: "A",
  rule: "R",
  plugin: "P",
  mcp: "M",
  hook: "H",
  backup: "B",
  catalog: "C",
  doctor: "+",
  on: "*",
  off: "o",
  warning: "!",
  error: "x",
  info: "i",
  pointer: fallbackSymbols.pointer,
};

// Font Awesome code points in the Nerd Font private-use area.
const NERD: Icons = {
  ...UNICODE,
  skill: "",
  agent: "",
  rule: "",
  plugin: "",
  mcp: "",
  hook: "",
  backup: "",
  catalog: "",
  doctor: "",
};

export const iconMode = (env: NodeJS.ProcessEnv = process.env): IconMode => {
  if (env.NO_COLOR || env.TERM === "dumb" || env.AGENTRY_ASCII === "1") {
    return "ascii";
  }
  return env.AGENTRY_ICONS === "nerd" ? "nerd" : "unicode";
};

const SETS: Record<IconMode, Icons> = {
  ascii: ASCII,
  nerd: NERD,
  unicode: UNICODE,
};
export const iconsFor = (env: NodeJS.ProcessEnv = process.env): Icons =>
  SETS[iconMode(env)];
