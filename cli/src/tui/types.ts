// Types shared by the TUI modules: rows, theme styles, footer keys and the props every tab takes.

import type { TextProps } from "ink";
import type { CatalogInstall, CatalogKind } from "../lib/catalog.js";
import type { Finding, Severity } from "../lib/types.js";
import type { createData } from "./data.js";
import type { layoutFor } from "./layout.js";

// Plain Ink Text props (colour, dim, bold, inverse) so styles stay pure and testable.
export type Style = Pick<
  TextProps,
  "color" | "backgroundColor" | "dimColor" | "bold" | "inverse"
>;
export interface Seg {
  style?: Style;
  text: string;
}
// One fixed-width column on the right of a row.
export interface Cell {
  align: "left" | "right";
  parts: Seg[];
  width: number;
}

// [key, text, short text]
export type KeyHint = [string, string, string?];

// One list row. Section headers and spacers set `header`; the other fields depend on the tab that builds the row.
export interface Row {
  // backups
  backup?: string;
  blank?: boolean;
  cells?: Cell[];
  details?: string[];
  enabled?: boolean;
  file?: string;
  finding?: Finding;
  globalOn?: boolean;
  // skills
  group?: string;
  header?: boolean;
  // hooks
  hook?: string;
  hookOff?: boolean;
  hookScope?: string;
  id: string;
  installed?: string | null;
  installs?: CatalogInstall[];
  // catalog
  item?: string;
  itemKind?: CatalogKind;
  kind?: string;
  label: string;
  labelStyle?: Style;
  // mcp
  mcp?: string;
  mcpEnable?: boolean;
  mcpProject?: boolean;
  mcpUser?: boolean;
  note?: string;
  outdated?: boolean;
  plugin?: string;
  // plugins
  pluginScopes?: string[];
  projectOn?: boolean;
  projectOnly?: boolean;
  restorable?: boolean;
  // rules
  ruleFile?: string;
  ruleTitle?: string;
  // doctor
  severity?: Severity;
  shelvable?: boolean;
  shelved?: boolean;
  skill?: string;
  target?: string;
  why?: string;
}

export type Api = ReturnType<typeof createData>;
export type Data = ReturnType<Api["load"]>;
export type Layout = ReturnType<typeof layoutFor>;

// false: unlocked, true: a modal step is open, "typing": text is being typed (q and tab keys must not act).
export type Lock = boolean | "typing";
export type SetLock = (value: Lock) => void;

// Props shared by every tab.
export interface TabProps {
  active: boolean;
  api: Api;
  copy: (text: string) => void;
  data: Data;
  dir: string;
  height: number;
  layout: Layout;
  lock: SetLock;
  notify: (message: string) => void;
  openFile: (file: string | undefined) => void;
  reload: () => Promise<void> | void;
  setKeys: (keys: KeyHint[]) => void;
}
