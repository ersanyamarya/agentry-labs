import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { KEYS, createUi } from "./helpers/tui.mjs";

let ui;
afterEach(() => ui?.stop());

const ON = '{\n\t"enabledPlugins": {\n\t\t"demo@mkt": true\n\t}\n}\n';
const settings = () => readFileSync(ui.plugin.settings, "utf8");
const backups = () => (existsSync(join(ui.fx.configDir, "backups/agentry")) ? readdirSync(join(ui.fx.configDir, "backups/agentry")) : []);

describe("Plugins tab: enable and disable", () => {
	beforeEach(async () => {
		ui = createUi({ plugin: { settingsText: ON } });
		await ui.ready();
		await ui.press("4");
		await ui.until(/plugin: demo@mkt/);
	});

	test("space previews the diff and the new-session note; n cancels with nothing written", async () => {
		await ui.press(KEYS.space);
		await ui.until(/Disable demo@mkt \(preview\)/);
		assert.match(ui.frame(), /-\s+"demo@mkt": true/);
		assert.match(ui.frame(), /\+\s+"demo@mkt": false/);
		await ui.until(/sessions started after this/);
		assert.match(ui.frame(), /Apply this\? y = yes, n = cancel/);
		await ui.press("n");
		await ui.until(/Cancelled; nothing changed/);
		assert.equal(settings(), ON);
		assert.deepEqual(backups(), []);
	});

	test("keys other than y or n change nothing while the preview waits", async () => {
		await ui.press(KEYS.space);
		await ui.until(/Disable demo@mkt/);
		await ui.press("q", "5", KEYS.enter, KEYS.space, KEYS.right, "e");
		assert.equal(settings(), ON);
		await ui.until(/Disable demo@mkt \(preview\)/);
	});

	test("y writes through the engine (backup, verify), the row turns disabled, a second space re-enables it", async () => {
		await ui.press(KEYS.space);
		await ui.until(/Disable demo@mkt/);
		await ui.press("y");
		await ui.until(/disabled: gone/);
		assert.equal(settings(), ON.replace("true", "false"));
		assert.equal(backups().length, 1);
		await ui.until(/demo@mkt disabled\. Applies to new sessions/);
		await ui.until(/demo@mkt\s+(global\s+)?1\.0\.0\s+○ disabled/);

		await ui.press(KEYS.space);
		await ui.until(/Enable demo@mkt \(preview\)/);
		await ui.press("y");
		await ui.until(/demo@mkt\s+(global\s+)?1\.0\.0\s+● active/);
		assert.equal(settings(), ON);
		assert.equal(backups().length, 2);
	});

	test("fix --undo restores the file and a refresh shows the plugin active again", async () => {
		await ui.press(KEYS.space);
		await ui.until(/Disable demo@mkt/);
		await ui.press("y");
		await ui.until(/demo@mkt\s+(global\s+)?1\.0\.0\s+○ disabled/);
		assert.equal(ui.fx.run(["fix", "--undo", "--yes"]).status, 0);
		assert.equal(settings(), ON);
		await ui.press("r");
		await ui.until(/demo@mkt\s+(global\s+)?1\.0\.0\s+● active/);
	});

	test("a plugin that managed settings control is refused in the preview and y writes nothing", async () => {
		mkdirSync(ui.fx.managedDir, { recursive: true });
		writeFileSync(join(ui.fx.managedDir, "managed-settings.json"), '{"enabledPlugins":{"demo@mkt":true}}');
		await ui.press(KEYS.space);
		await ui.until(/set by managed settings/);
		assert.match(ui.frame(), /Nothing can be applied here/);
		await ui.press("y");
		assert.equal(settings(), ON);
		assert.deepEqual(backups(), []);
	});
});

describe("Skills tab: plugin skills group", () => {
	test("space on the plugin's skills row toggles the plugin; other loaded rows keep explaining", async () => {
		ui = createUi({ plugin: { settingsText: ON } });
		await ui.ready();
		await ui.moveTo(/^>\s+demo:\*/);
		assert.match(ui.frame(), /plugin skill \(comes with a/);
		await ui.press(KEYS.space);
		await ui.until(/Disable demo@mkt \(preview\)/);
		await ui.press("y");
		await ui.until(/demo@mkt disabled/);
		assert.equal(settings(), ON.replace("true", "false"));
		await ui.until(/demo:\*.*○ disabled/);
	});
});
