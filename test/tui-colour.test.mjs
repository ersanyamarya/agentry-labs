// Colour is Ink props, not raw ANSI. FORCE_COLOR makes the test renderer emit real escape codes so the props can be seen.
process.env.FORCE_COLOR = "1";
process.env.NO_COLOR = "";

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { costStyle, colorEnabled, scopeStyle, SEVERITY, stateStyle } from "../tui/theme.mjs";
import { doctorRows, skillRows } from "../tui/rows.mjs";

const { createUi, KEYS, stripAnsi } = await import("./helpers/tui.mjs");

const GREEN = "\u001B[32m";
const YELLOW = "\u001B[33m";
const GRAY = "\u001B[90m";
const RED = "\u001B[31m";
const COLOUR_CODE = /\u001B\[(3[0-7]|9[0-7])m/;

let ui;
afterEach(() => ui?.stop());

describe("theme helpers", () => {
	test("state badges: on and active green, off and disabled gray, partial and not-here yellow, broken red", () => {
		assert.deepEqual(stateStyle("on (project)"), { color: "green" });
		assert.deepEqual(stateStyle("active"), { color: "green" });
		assert.deepEqual(stateStyle("off"), { color: "gray" });
		assert.deepEqual(stateStyle("disabled"), { color: "gray" });
		assert.deepEqual(stateStyle("partial"), { color: "yellow" });
		assert.deepEqual(stateStyle("broken"), { color: "red" });
		assert.deepEqual(stateStyle("something else"), {});
	});

	test("cost bands: dim under 100, yellow under 500, red from 500; unknown is dim", () => {
		assert.deepEqual(costStyle(0), { dimColor: true });
		assert.deepEqual(costStyle(99), { dimColor: true });
		assert.deepEqual(costStyle(100), { color: "yellow" });
		assert.deepEqual(costStyle(499), { color: "yellow" });
		assert.deepEqual(costStyle(500), { color: "red" });
		assert.deepEqual(costStyle(null), { dimColor: true });
	});

	test("scope tags and doctor severities", () => {
		assert.deepEqual([scopeStyle("user"), scopeStyle("project"), scopeStyle("plugin"), scopeStyle("shelf")].map((style) => style.color), ["cyan", "magenta", "blue", "yellow"]);
		assert.deepEqual([SEVERITY.error.style.color, SEVERITY.warning.style.color, SEVERITY.info.style.color], ["red", "yellow", "blue"]);
		assert.deepEqual([SEVERITY.error.icon, SEVERITY.warning.icon, SEVERITY.info.icon], ["✖", "▲", "ℹ"]);
	});

	test("NO_COLOR counts only when set and non-empty", () => {
		assert.equal(colorEnabled({}), true);
		assert.equal(colorEnabled({ NO_COLOR: "" }), true);
		assert.equal(colorEnabled({ NO_COLOR: "1" }), false);
	});
});

describe("rows carry the styles", () => {
	const item = (name, project, global) => ({ kind: "skills", name, source: `/s/${name}`, tokens: 120, project, global });
	const data = (items) => ({ groups: [{ name: "g", tokens: 240, state: "off", items }], status: { skills: { items: [] }, plugins: { items: [] } } });

	test("a group is off, partial or on, with the matching badge and a cost style", () => {
		const badgeOf = (items) => {
			const row = skillRows(data(items)).find((candidate) => candidate.kind === "group");
			const badges = row.cells.flatMap((one) => one.parts).filter((part) => /^[●○◐] /.test(part.text));
			return { project: badges[0], global: badges[1] };
		};
		const off = { text: "○ off", style: { color: "gray", bold: true } };
		assert.deepEqual(badgeOf([item("a", false, false), item("b", false, false)]), { project: off, global: off });
		assert.deepEqual(badgeOf([item("a", true, false), item("b", false, false)]).project, { text: "◐ partial", style: { color: "yellow", bold: true } });
		const on = { text: "● on", style: { color: "green", bold: true } };
		assert.deepEqual(badgeOf([item("a", true, false), item("b", true, false)]), { project: on, global: off });
		assert.deepEqual(badgeOf([item("a", false, true), item("b", false, true)]), { project: off, global: on });
		const group = skillRows(data([item("a", false, false)])).find((candidate) => candidate.kind === "group");
		assert.deepEqual(group.cells.flatMap((one) => one.parts).find((part) => part.text.startsWith("~")).style, { color: "yellow" });
		assert.match(group.note, /1 skills\s+~240\s+P ○ off\s+G ○ off/);
	});

	test("doctor rows use the severity icon and colour", () => {
		const rows = doctorRows({ doctor: { findings: [{ id: "x", severity: "error", message: "m", file: "/f" }, { id: "y", severity: "info", message: "n", file: "/f" }] } });
		assert.equal(rows[0].label, "✖ Errors (1)");
		assert.deepEqual(rows[0].labelStyle, { color: "red" });
		assert.equal(rows.find((row) => row.kind === "finding" && row.severity === "info").label, "  ℹ [y] n");
	});
});

describe("rendered with real escape codes", () => {
	test("on is green, off is gray, partial is yellow, cost dim, severities coloured", async () => {
		ui = createUi();
		await ui.ready();
		const frame = ui.frame();
		assert.ok(frame.includes(`${GRAY}○ off`), "off badge is gray");
		await ui.moveTo(/video/);
		await ui.press(KEYS.enter);
		await ui.moveTo(/trim/);
		await ui.press(KEYS.space);
		await ui.until(/video\/trim on in/);
		await ui.until(/\u001B\[32m● on/);
		await ui.moveTo(/^.{0,12}video/, KEYS.up);
		assert.ok(ui.frame().includes(`${YELLOW}◐ partial`), "a group with one of two skills linked is partial");
		await ui.press("5");
		await ui.until(/\[fake-bad\]/);
		assert.ok(ui.frame().includes(`${YELLOW}▲`), "warning icon is yellow");
		assert.ok(ui.frame().includes("\u001B[34mℹ"), "info icon is blue");
	});

	test("NO_COLOR keeps the words and the marker but emits no colour codes", async () => {
		ui = createUi({ env: { NO_COLOR: "1" } });
		await ui.ready();
		await ui.press(KEYS.enter);
		assert.doesNotMatch(ui.frame(), COLOUR_CODE);
		assert.match(stripAnsi(ui.frame()), /off/);
		assert.match(stripAnsi(ui.frame()), /P project, G global {2}● on ○ off ◐ partial/);
		await ui.press("5");
		await ui.until(/\[fake-bad\]/);
		assert.doesNotMatch(ui.frame(), COLOUR_CODE);
		assert.match(stripAnsi(ui.frame()), /▲ Warnings/);
	});
});
