import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { installFakeClaude } from "./helpers/fake-claude.js";
import { KEYS, createUi } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
let fake: ReturnType<typeof installFakeClaude>;
let oldPath: string | undefined;
const ON = '{\n\t"enabledPlugins": {\n\t\t"demo@mkt": true\n\t}\n}\n';
beforeEach(async () => {
	ui = createUi({ plugin: { settingsText: ON } });
	fake = installFakeClaude(join(ui.fx.root, "fakebin"));
	oldPath = process.env.PATH;
	process.env.PATH = `${join(ui.fx.root, "fakebin")}:${oldPath}`;
	process.env.CLAUDE_CONFIG_DIR = ui.fx.configDir;
	await ui.ready();
	await ui.press("4");
	await ui.until(/plugin: demo@mkt/);
});
afterEach(() => {
	ui.stop();
	process.env.PATH = oldPath;
	delete process.env.CLAUDE_CONFIG_DIR;
});

const enabled = () => JSON.parse(readFileSync(join(ui.fx.configDir, "settings.json"), "utf8")).enabledPlugins;

describe("Plugins tab: install and uninstall", () => {
	test("the footer offers i install and x uninstall", () => {
		assert.match(ui.frame()!, /i install/);
		assert.match(ui.frame()!, /x uninstall/);
	});

	test("x previews the claude command, n cancels with nothing run, y uninstalls and the row goes", async () => {
		await ui.press("x");
		await ui.until(/Uninstall demo@mkt at user scope \(preview\)/);
		assert.match(ui.frame()!, /run: claude plugin uninstall demo@mkt --scope user/);
		assert.deepEqual(fake.argv(), []);
		await ui.press("n");
		await ui.until(/Cancelled; nothing changed/);
		assert.deepEqual(fake.argv(), []);

		await ui.press("x");
		await ui.until(/Uninstall demo@mkt/);
		await ui.press("y");
		await ui.until(/demo@mkt is uninstalled at user scope/);
		assert.deepEqual(fake.argv(), [["plugin", "uninstall", "demo@mkt", "--scope", "user"]]);
		assert.equal(enabled()["demo@mkt"], undefined);
	});

	test("i asks for name@marketplace, rejects a bare name, then previews per scope and y installs", async () => {
		await ui.press("i");
		await ui.until(/Plugin \(name@marketplace\): _/);
		await ui.press("q", "x", KEYS.enter);
		await ui.until(/Type it as name@marketplace/);
		assert.deepEqual(fake.argv(), []);

		await ui.press("i");
		await ui.until(/Plugin \(name@marketplace\): _/);
		await ui.press(..."other@mkt".split(""), KEYS.enter);
		await ui.until(/Where should it be installed/);
		await ui.press(KEYS.enter);
		await ui.until(/Install other@mkt at user scope \(preview\)/);
		assert.match(ui.frame()!, /run: claude plugin install other@mkt --scope user/);
		assert.deepEqual(fake.argv(), []);
		await ui.press("y");
		await ui.until(/other@mkt is installed at user scope/);
		assert.deepEqual(fake.argv(), [["plugin", "install", "other@mkt", "--scope", "user"]]);
		assert.equal(enabled()["other@mkt"], true);
		assert.ok(existsSync(join(ui.fx.configDir, "backups/agentry")));
	});

	test("installing something already installed shows the refusal and cannot be applied", async () => {
		await ui.press("i");
		await ui.press(..."demo@mkt".split(""), KEYS.enter, KEYS.enter);
		await ui.until(/already installed at user scope/);
		await ui.press("y");
		assert.deepEqual(fake.argv(), []);
	});
});
