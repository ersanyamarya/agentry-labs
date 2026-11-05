// Types shared by the TUI modules: rows, theme styles, footer keys and the props every tab takes.

import type { TextProps } from "ink";
import type { CatalogInstall, CatalogKind } from "../lib/catalog.js";
import type { Finding, Severity } from "../lib/types.js";
import type { createData } from "./data.js";
import type { layoutFor } from "./layout.js";

// Plain Ink Text props (colour, dim, bold, inverse) so styles stay pure and testable.
export type Style = Pick<TextProps, "color" | "backgroundColor" | "dimColor" | "bold" | "inverse">;
export interface Seg {
	text: string;
	style?: Style;
}
// One fixed-width column on the right of a row.
export interface Cell {
	parts: Seg[];
	width: number;
	align: "left" | "right";
}

// [key, text, short text]
export type KeyHint = [string, string, string?];

// One list row. Section headers and spacers set `header`; the other fields depend on the tab that builds the row.
export interface Row {
	id: string;
	label: string;
	details?: string[];
	header?: boolean;
	blank?: boolean;
	cells?: Cell[];
	note?: string;
	labelStyle?: Style;
	file?: string;
	kind?: string;
	why?: string;
	// skills
	group?: string;
	target?: string;
	skill?: string;
	projectOn?: boolean;
	globalOn?: boolean;
	shelved?: boolean;
	shelvable?: boolean;
	projectOnly?: boolean;
	plugin?: string;
	enabled?: boolean;
	// catalog
	item?: string;
	itemKind?: CatalogKind;
	installed?: string | null;
	outdated?: boolean;
	installs?: CatalogInstall[];
	// rules
	ruleFile?: string;
	ruleTitle?: string;
	// backups
	backup?: string;
	restorable?: boolean;
	// mcp
	mcp?: string;
	mcpUser?: boolean;
	mcpEnable?: boolean;
	mcpProject?: boolean;
	// hooks
	hook?: string;
	hookScope?: string;
	hookOff?: boolean;
	// plugins
	pluginScopes?: string[];
	// doctor
	severity?: Severity;
	finding?: Finding;
}

export type Api = ReturnType<typeof createData>;
export type Data = ReturnType<Api["load"]>;
export type Layout = ReturnType<typeof layoutFor>;

// false: unlocked, true: a modal step is open, "typing": text is being typed (q and tab keys must not act).
export type Lock = boolean | "typing";
export type SetLock = (value: Lock) => void;

// Props shared by every tab.
export interface TabProps {
	data: Data;
	api: Api;
	dir: string;
	active: boolean;
	height: number;
	layout: Layout;
	notify: (message: string) => void;
	reload: () => Promise<void> | void;
	lock: SetLock;
	setKeys: (keys: KeyHint[]) => void;
	openFile: (file: string | undefined) => void;
	copy: (text: string) => void;
}
