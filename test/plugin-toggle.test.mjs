import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { addPlugin, createFixture } from "./helpers/fixture.mjs";

let fx;
beforeEach(() => {
	fx = createFixture();
});
afterEach(() => fx.cleanup());

const settingsPath = () => join(fx.configDir, "settings.json");
const settings = () => readFileSync(settingsPath(), "utf8");
const backups = () => (existsSync(join(fx.configDir, "backups/agentry")) ? readdirSync(join(fx.configDir, "backups/agentry")) : []);
const ON = '{\n\t"model": "x",\n\t"enabledPlugins": {\n\t\t"demo@mkt": true,\n\t\t"other@mkt": true\n\t}\n}\n';

describe("agentry plugin disable|enable", () => {
	test("--dry-run previews the diff and the new-session note, and writes nothing", () => {
		addPlugin(fx, { settingsText: ON });
		const { status, stdout } = fx.run(["plugin", "disable", "demo", "--dry-run"]);
		assert.equal(status, 0);
		assert.match(stdout, /Disable demo@mkt in user settings/);
		assert.match(stdout, /-\t\t"demo@mkt": true,\n\+\t\t"demo@mkt": false,/);
		assert.match(stdout, /Dry run: nothing written/);
		assert.match(stdout, /sessions started after this/);
		assert.equal(settings(), ON);
		assert.deepEqual(backups(), []);
	});

	test("without a terminal and without --yes it only previews", () => {
		addPlugin(fx, { settingsText: ON });
		const { status, stdout } = fx.run(["plugin", "disable", "demo@mkt"]);
		assert.equal(status, 0);
		assert.match(stdout, /Not a terminal, so preview only/);
		assert.equal(settings(), ON);
	});

	test("--yes edits only that entry, backs up the file, and fix --undo restores it byte for byte", () => {
		addPlugin(fx, { settingsText: ON });
		const { status, stdout } = fx.run(["plugin", "disable", "demo", "--yes"]);
		assert.equal(status, 0, stdout);
		assert.equal(settings(), ON.replace('"demo@mkt": true', '"demo@mkt": false'));
		assert.match(stdout, /verify \[plugin-toggle\].*: gone/);
		assert.equal(backups().length, 1);
		assert.match(fx.run(["status", "--json"]).stdout, /"state": "disabled"/);

		assert.equal(fx.run(["fix", "--undo", "--yes"]).status, 0);
		assert.equal(settings(), ON);
		assert.equal(fx.run(["plugin", "enable", "demo", "--yes"]).stdout.match(/already enabled/)?.length, 1);
	});

	test("enable flips it back; already-correct state is a no-op that says so", () => {
		addPlugin(fx, { settingsText: ON.replace('"demo@mkt": true', '"demo@mkt": false') });
		assert.equal(fx.run(["plugin", "enable", "demo", "--yes"]).status, 0);
		assert.equal(settings(), ON);
		const again = fx.run(["plugin", "enable", "demo", "--yes"]);
		assert.equal(again.status, 0);
		assert.match(again.stdout, /demo@mkt is already enabled \(user settings\)/);
		assert.equal(backups().length, 1);
	});

	test("adds the entry or the whole enabledPlugins object when missing, creates a missing settings file", () => {
		addPlugin(fx, {});
		assert.match(fx.run(["plugin", "disable", "demo", "--yes"]).stdout, /wrote/);
		assert.equal(settings(), '{\n\t"enabledPlugins": {\n\t\t"demo@mkt": false\n\t}\n}\n');
		writeFileSync(settingsPath(), '{\n  "model": "x"\n}\n');
		assert.equal(fx.run(["plugin", "disable", "demo", "--yes"]).status, 0);
		assert.equal(settings(), '{\n  "model": "x",\n  "enabledPlugins": {\n    "demo@mkt": false\n  }\n}\n');
	});

	test("a default-enabled plugin says so", () => {
		addPlugin(fx, {});
		assert.match(fx.run(["plugin", "enable", "demo"]).stdout, /already enabled \(by default\)/);
	});

	test("refuses an unparsable settings file without touching it", () => {
		addPlugin(fx, { settingsText: "{ not json" });
		const { status } = fx.run(["plugin", "disable", "demo", "--yes"]);
		assert.notEqual(status, 0);
		assert.equal(settings(), "{ not json");
	});
});

describe("refusals and usage", () => {
	test("unknown plugin exits 1 and lists the installed ones", () => {
		addPlugin(fx, {});
		const { status, stderr } = fx.run(["plugin", "disable", "nope"]);
		assert.equal(status, 1);
		assert.match(stderr, /refused: No plugin "nope". Plugins: demo@mkt/);
	});

	test("a bare name in two marketplaces is ambiguous (exit 2)", () => {
		const first = addPlugin(fx, {});
		const installed = JSON.parse(readFileSync(join(fx.configDir, "plugins/installed_plugins.json"), "utf8"));
		installed.plugins["demo@other"] = installed.plugins[first.id];
		writeFileSync(join(fx.configDir, "plugins/installed_plugins.json"), JSON.stringify(installed));
		const { status, stderr } = fx.run(["plugin", "disable", "demo"]);
		assert.equal(status, 2);
		assert.match(stderr, /several plugins: demo@mkt, demo@other/);
		assert.equal(fx.run(["plugin", "disable", "demo@other", "--dry-run"]).status, 0);
	});

	test("managed settings that name the plugin win: refused, nothing written", () => {
		addPlugin(fx, { settingsText: ON });
		mkdirSync(fx.managedDir, { recursive: true });
		writeFileSync(join(fx.managedDir, "managed-settings.json"), '{"enabledPlugins":{"demo@mkt":true}}');
		const { status, stderr } = fx.run(["plugin", "disable", "demo", "--yes"]);
		assert.equal(status, 1);
		assert.match(stderr, /set by managed settings/);
		assert.equal(settings(), ON);
		assert.deepEqual(backups(), []);
	});

	test("a higher scope that names the plugin wins: refused unless --scope targets it", () => {
		addPlugin(fx, { settingsText: ON });
		mkdirSync(join(fx.repo, ".claude"), { recursive: true });
		writeFileSync(join(fx.repo, ".claude/settings.local.json"), '{\n\t"enabledPlugins": {\n\t\t"demo@mkt": true\n\t}\n}\n');
		const refused = fx.run(["plugin", "disable", "demo", "--scope", "user", "--yes"]);
		assert.equal(refused.status, 1);
		assert.match(refused.stderr, /local settings .* also set demo@mkt and win over user; use --scope local/);
		assert.equal(settings(), ON);

		// without --scope the deciding layer (local) is the one edited
		assert.equal(fx.run(["plugin", "disable", "demo", "--yes"]).status, 0);
		assert.match(readFileSync(join(fx.repo, ".claude/settings.local.json"), "utf8"), /"demo@mkt": false/);
		assert.equal(settings(), ON);
	});

	test("--scope local creates settings.local.json when the folder exists, and refuses when it does not", () => {
		addPlugin(fx, {});
		const missing = fx.run(["plugin", "disable", "demo", "--scope", "local", "--yes"]);
		assert.equal(missing.status, 1);
		assert.match(missing.stderr, /does not exist/);
		mkdirSync(join(fx.repo, ".claude"));
		assert.equal(fx.run(["plugin", "disable", "demo", "--scope", "local", "--yes"]).status, 0);
		assert.equal(readFileSync(join(fx.repo, ".claude/settings.local.json"), "utf8"), '{\n\t"enabledPlugins": {\n\t\t"demo@mkt": false\n\t}\n}\n');
		assert.match(fx.run(["fix", "--undo", "--yes"]).stdout, /deleted .*settings\.local\.json/);
		assert.ok(!existsSync(join(fx.repo, ".claude/settings.local.json")));
	});

	test("bad usage exits 2 and the help lists the command", () => {
		assert.equal(fx.run(["plugin"]).status, 2);
		assert.equal(fx.run(["plugin", "toggle", "x"]).status, 2);
		addPlugin(fx, {});
		assert.equal(fx.run(["plugin", "disable", "demo", "--scope", "everywhere"]).status, 2);
		assert.equal(fx.run(["plugin", "disable", "demo", "--yes", "--dry-run"]).status, 2);
		assert.match(fx.run(["--help"]).stdout, /plugin enable\|disable <name> \[--scope/);
	});
});
