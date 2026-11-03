import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { skillRows } from "../tui/rows.mjs";
import { KEYS, createUi } from "./helpers/tui.mjs";

let ui;
beforeEach(async () => {
	ui = createUi({ personal: ["notes"], plugin: {} });
	await ui.ready();
});
afterEach(() => ui?.stop());

test("the header sums up tokens and problems, and the Skills tab explains its colours", () => {
	assert.match(ui.frame(), /~\d+ skill-description tokens {2}· {2}plugins 1 ● active 0 ○ disabled {2}· {2}0 errors, 1 warning/);
	assert.match(ui.frame(), /P project, G global {2}● on ○ off ◐ partial {2}cost: ~<100 ~100-499 ~500\+/);
});

test("sections are bold headers with a rule and a blank line between them", () => {
	assert.match(ui.frame(), /^Shelf ─+\s/m);
	assert.match(ui.frame(), /^Personal skills ─+\s/m);
	const rows = skillRows({ groups: [], status: { skills: { items: [{ name: "n", scope: "user", kind: "file", source: "/x/n", state: "active", tokens: 1 }] }, plugins: { items: [] } } });
	assert.deepEqual(rows.map((row) => (row.blank ? "blank" : row.header ? "header" : "row")), ["header", "row", "blank", "header", "row"]);
});

test("scope badges tag the rows", async () => {
	assert.match(ui.frame(), /^Personal skills ─+\s/m);
	assert.match(ui.frame(), /^Project skills ─+\s/m);
	assert.doesNotMatch(ui.frame(), /notes\s+personal/);
	await ui.press("4");
	await ui.until(/demo@mkt\s+personal\s+1\.0\.0\s+● active/);
	await ui.press("2");
	await ui.until(/demo\s+project\s+pending-approval\s+stdio/);
});

test("the footer lists only the keys of the current tab", async () => {
	assert.match(ui.frame(), /space P {2}G global {2}s shelve {2}u unshelve/);
	await ui.press("2");
	await ui.until(/e edit/);
	assert.doesNotMatch(ui.frame(), /s shelve/);
	await ui.press("4");
	await ui.until(/space on\/off/);
	await ui.press("5");
	await ui.until(/enter fix {2}u undo {2}e edit/);
	assert.doesNotMatch(ui.frame(), /space on\/off/);
});

test("a long path in the details is cut in the middle with an ellipsis, keeping both ends", async () => {
	await ui.moveTo(/^>\s+notes/);
	assert.match(ui.frame(), /source: .*…\S*\/skills\/notes/);
});

test("the help overlay lists the new keys and the colour legend", async () => {
	await ui.press("?");
	await ui.until(/Keys \(\? or esc to close\)/);
	assert.match(ui.frame(), /s {12}Skills: move a personal skill onto the shelf/);
	assert.match(ui.frame(), /u {12}Skills: unshelve a skill/);
	assert.match(ui.frame(), /● on \/ active green, ○ off \/ disabled gray, ◐ partial yellow/);
	await ui.press(KEYS.esc);
});
