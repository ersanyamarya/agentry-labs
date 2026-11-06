// Colour choices for the UI, as plain Ink Text props ({ color, dimColor, bold }), so they are pure and testable.
// Rows carry segments [{ text, style? }]; components turn them into <Text {...style}>. NO_COLOR (set and non-empty,
// https://no-color.org) drops the colour props but keeps bold, dim and inverse, and every badge is also a word
// (on, off, partial, error...), so nothing depends on colour alone.

import React from "react";
import type { Severity } from "../lib/types.js";
import type { Seg, Style } from "./types.js";

export const seg = (text: string, style?: Style): Seg => ({
  text,
  ...(style && { style }),
});
export const plain = (segments: Seg[]) =>
  segments.map(({ text }) => text).join("");

export const colorEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  !env.NO_COLOR;

export const ThemeContext = React.createContext<{ color: boolean }>({
  color: true,
});

// Returns a function that strips colour props when colour is off.
export const useStyle = () => {
  const { color } = React.useContext(ThemeContext);
  return (style: Style = {}): Style => {
    if (color) {
      return style;
    }
    const { color: _color, backgroundColor: _background, ...rest } = style;
    return rest;
  };
};

const GREEN: Style = { color: "green" };
const GRAY: Style = { color: "gray" };
const YELLOW: Style = { color: "yellow" };
const RED: Style = { color: "red" };

// State words from the shelf, plugins, skills, MCP servers and hooks.
const STATES: Record<string, Style> = {
  on: GREEN,
  active: GREEN,
  off: GRAY,
  disabled: GRAY,
  parked: GRAY,
  partial: YELLOW,
  shadowed: YELLOW,
  "pending-approval": YELLOW,
  "not-here": YELLOW,
  broken: RED,
  rejected: RED,
  "not-installed": RED,
};
// Badges carry a symbol too, so the state reads without colour: ● on / active, ○ off / disabled, ◐ partial.
const SYMBOLS: Record<string, string> = {
  on: "●",
  active: "●",
  off: "○",
  disabled: "○",
  parked: "○",
  partial: "◐",
};
const word = (state: unknown) => String(state).replace(/^[●○◐]\s*/, "");
export const badgeText = (state: unknown) =>
  SYMBOLS[word(state).split(" ")[0]]
    ? `${SYMBOLS[word(state).split(" ")[0]]} ${word(state)}`
    : String(state);
export const stateStyle = (state = ""): Style =>
  STATES[word(state).split(" ")[0]] ?? {};

export const SCOPE_STYLES: Record<string, Style> = {
  user: { color: "cyan" },
  global: { color: "cyan" },
  project: { color: "magenta" },
  local: { color: "magenta" },
  plugin: { color: "blue" },
  shelf: { color: "yellow" },
};
export const SCOPE_NAMES: Record<string, string> = {
  user: "global",
  "desktop-config": "desktop",
  "desktop-extension": "desktop",
};
export const scopeStyle = (scope: string): Style =>
  SCOPE_STYLES[scope] ??
  SCOPE_STYLES[
    Object.keys(SCOPE_NAMES).find((key) => SCOPE_NAMES[key] === scope) ?? ""
  ] ??
  {};

// Description cost: dim when small, yellow in the middle, red when large.
export const COST_LEGEND: [string, Style][] = [
  ["<100", { dimColor: true }],
  ["100-499", YELLOW],
  ["500+", RED],
];
export const costStyle = (count: number | null | undefined): Style =>
  count === null || count === undefined || count < 100
    ? { dimColor: true }
    : count < 500
      ? YELLOW
      : RED;

export const SEVERITY: Record<
  Severity,
  { icon: string; style: Style; heading: string }
> = {
  error: { icon: "✖", style: RED, heading: "Errors" },
  warning: { icon: "▲", style: YELLOW, heading: "Warnings" },
  info: { icon: "ℹ", style: { color: "blue" }, heading: "Info" },
};
