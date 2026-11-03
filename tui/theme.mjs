// Colour choices for the UI, as plain Ink Text props ({ color, dimColor, bold }), so they are pure and testable.
// Rows carry segments [{ text, style? }]; components turn them into <Text {...style}>. NO_COLOR (set and non-empty,
// https://no-color.org) drops the colour props but keeps bold, dim and inverse, and every badge is also a word
// (on, off, partial, error...), so nothing depends on colour alone.

import React from "react";

export const seg = (text, style) => ({ text, ...(style && { style }) });
export const plain = (segments) => segments.map(({ text }) => text).join("");

export const colorEnabled = (env = process.env) => !env.NO_COLOR;

export const ThemeContext = React.createContext({ color: true });

// Returns a function that strips colour props when colour is off.
export const useStyle = () => {
	const { color } = React.useContext(ThemeContext);
	return (style = {}) => {
		if (color) {
			return style;
		}
		const { color: _color, backgroundColor: _background, ...rest } = style;
		return rest;
	};
};

const GREEN = { color: "green" };
const GRAY = { color: "gray" };
const YELLOW = { color: "yellow" };
const RED = { color: "red" };

// State words from the shelf, plugins, skills, MCP servers and hooks.
const STATES = {
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
const SYMBOLS = { on: "●", active: "●", off: "○", disabled: "○", parked: "○", partial: "◐" };
const word = (state) => String(state).replace(/^[●○◐]\s*/, "");
export const badgeText = (state) => (SYMBOLS[word(state).split(" ")[0]] ? `${SYMBOLS[word(state).split(" ")[0]]} ${word(state)}` : String(state));
export const stateStyle = (state = "") => STATES[word(state).split(" ")[0]] ?? {};

export const SCOPE_STYLES = { user: { color: "cyan" }, global: { color: "cyan" }, project: { color: "magenta" }, local: { color: "magenta" }, plugin: { color: "blue" }, shelf: { color: "yellow" } };
export const SCOPE_NAMES = { user: "global", "desktop-config": "desktop", "desktop-extension": "desktop" };
export const scopeStyle = (scope) => SCOPE_STYLES[scope] ?? SCOPE_STYLES[Object.keys(SCOPE_NAMES).find((key) => SCOPE_NAMES[key] === scope)] ?? {};

// Description cost: dim when small, yellow in the middle, red when large.
export const COST_LEGEND = [
	["<100", { dimColor: true }],
	["100-499", YELLOW],
	["500+", RED],
];
export const costStyle = (count) => (count === null || count === undefined || count < 100 ? { dimColor: true } : count < 500 ? YELLOW : RED);

export const SEVERITY = {
	error: { icon: "✖", style: RED, heading: "Errors" },
	warning: { icon: "▲", style: YELLOW, heading: "Warnings" },
	info: { icon: "ℹ", style: { color: "blue" }, heading: "Info" },
};
