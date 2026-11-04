// The layout at 80, 100 and 130 columns on every tab: no line wider than the terminal, state badges whole, frames stable.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { KEYS, createUi, stripAnsi } from "./helpers/tui.mjs";

let ui;
afterEach(() => ui?.stop());

const TABS = ["1", "2", "3", "4", "5", "6", "7"];
const lines = () => stripAnsi(ui.frame()).split("\n");

for (const cols of [80, 100, 130]) {
	describe(`${cols} columns`, () => {
		test("no line is wider than the terminal on any tab, and the frame is stable", async () => {
			ui = createUi({ personal: ["a-rather-long-personal-skill-name-for-the-test"], plugin: { settingsText: '{\n\t"enabledPlugins": {\n\t\t"demo@mkt": true\n\t}\n}\n' }, fit: true });
			await ui.ready();
			await ui.resize(cols, 36);
			for (const tab of TABS) {
				await ui.press(tab);
				await ui.press(KEYS.down);
				const first = ui.frame();
				assert.ok(lines().every((line) => [...line].length <= cols), `tab ${tab} at ${cols}: a line is wider than ${cols}:\n${first}`);
				await ui.press(KEYS.up);
				await ui.press(KEYS.down);
				assert.equal(ui.frame(), first, `tab ${tab} at ${cols}: frame changed without input`);
			}
		});

		test("Skills: P and G badges are whole on every shelf row; the long name is cut in the middle, not the badges", async () => {
			ui = createUi({ personal: ["a-rather-long-personal-skill-name-for-the-test"], fit: true });
			await ui.ready();
			await ui.resize(cols, 36);
			const shelf = lines().filter((line) => /▸ (audit|video)/.test(line));
			assert.equal(shelf.length, 2);
			for (const line of shelf) {
				assert.match(line, /○ off\s+○ off/);
			}
			assert.doesNotMatch(ui.frame(), /[PG] [●○◐] \w*…/);
		});

		test("header summary and footer fit on one line each, with the counts first when short", async () => {
			ui = createUi({ fit: true });
			await ui.ready();
			await ui.resize(cols, 36);
			const all = lines();
			const summary = all.find((line) => /errors?, \d+ warnings?|no problems/.test(line));
			assert.ok(summary && [...summary].length <= cols && !summary.includes("…"), `summary: ${summary}`);
			if (cols < 100) {
				assert.match(summary, /^0 errors/);
			}
			const footer = all.findLast((line) => /q quit/.test(line));
			assert.ok(footer && [...footer].length <= cols && !footer.includes("…"), `footer: ${footer}`);
			assert.match(footer, /\? help {2}q quit/);
		});
	});
}

describe("layout by width", () => {
	test("under 110 columns the details sit under the list; from 110 up beside it", async () => {
		ui = createUi({ fit: true });
		await ui.ready();
		await ui.resize(80, 36);
		assert.ok(lines().some((line) => /^─{80}$/.test(line)), "stacked details start with a rule");
		assert.doesNotMatch(ui.frame(), /┌/);
		await ui.resize(130, 36);
		assert.match(ui.frame(), /┌─+┐/);
		const box = lines().find((line) => line.includes("┌"));
		assert.ok(box.indexOf("┌") < 70, "the details box sits next to the list, not at the far edge");
	});

	test("the details box is as tall as its content, not the list", async () => {
		ui = createUi({ fit: true });
		await ui.ready();
		await ui.resize(130, 36);
		const all = lines();
		const top = all.findIndex((line) => line.includes("┌"));
		const bottom = all.findIndex((line) => line.includes("└"));
		assert.ok(bottom - top <= 10, `box is ${bottom - top + 1} lines tall`);
	});
});
