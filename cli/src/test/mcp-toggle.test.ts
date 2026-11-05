// @ts-nocheck
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createFixture } from "./helpers/fixture.js";
import { installFakeClaude } from "./helpers/fake-claude.js";

const SECRET = "sk-supersecretvalue1234567890";
const DEMO = { type: "stdio", command: "echo", args: ["hi"], env: { API_KEY: SECRET } };
const OTHER = { type: "http", url: "https://example.com/mcp", headers: { Authorization: "Bearer tok-abcdefghijklmnopqrstuvwxyz1" } };

let fx;
let fake;
let extra;
beforeEach(() => {
	fx = createFixture();
	fake = installFakeClaude(join(fx.root, "fakebin"));
	extra = { PATH: `${join(fx.root, "fakebin")}:${process.env.PATH}` };
	writeFileSync(claudeJson(), `${JSON.stringify({ numStartups: 7, mcpServers: { demo: DEMO, other: OTHER } }, null, 2)}\n`);
});
afterEach(() => fx.cleanup());

const claudeJson = () => join(fx.configDir, ".claude.json");
const servers = () => JSON.parse(readFileSync(claudeJson(), "utf8")).mcpServers;
const parkedFile = () => join(fx.configDir, "agentry/parked-mcp.json");
const backups = () => (existsSync(join(fx.configDir, "backups/agentry")) ? readdirSync(join(fx.configDir, "backups/agentry")) : []);
const mcp = (args, env = {}) => fx.run(["mcp", ...args], { env: { ...extra, ...env } });

describe("agentry mcp disable", () => {
	test("--dry-run previews with secrets masked, runs nothing, writes nothing", () => {
		const before = readFileSync(claudeJson(), "utf8");
		const { status, stdout, stderr } = mcp(["disable", "demo", "--dry-run"]);
		assert.equal(status, 0, stderr);
		assert.match(stdout, /Park user MCP server demo \(stdio echo hi; env API_KEY=<masked>\)/);
		assert.match(stdout, /run: claude mcp remove demo --scope user/);
		assert.doesNotMatch(stdout + stderr, new RegExp(SECRET));
		assert.equal(readFileSync(claudeJson(), "utf8"), before);
		assert.equal(existsSync(parkedFile()), false);
		assert.deepEqual(fake.argv(), []);
	});

	test("--yes saves the parked copy (0600) first, removes only that server, backs up ~/.claude.json, prints no secret", () => {
		const { status, stdout, stderr } = mcp(["disable", "demo", "--yes"]);
		assert.equal(status, 0, stderr + stdout);
		assert.deepEqual(Object.keys(servers()), ["other"]);
		assert.equal(JSON.parse(readFileSync(claudeJson(), "utf8")).numStartups, 7);
		assert.deepEqual(fake.argv(), [["mcp", "remove", "demo", "--scope", "user"]]);
		assert.equal(statSync(parkedFile()).mode & 0o777, 0o600);
		assert.equal(statSync(join(fx.configDir, "agentry")).mode & 0o777, 0o700);
		assert.deepEqual(JSON.parse(readFileSync(parkedFile(), "utf8")).servers.demo.config, DEMO);
		assert.match(stdout, /demo is parked/);
		assert.match(stdout, /verify \[mcp-toggle\].*gone/);
		assert.doesNotMatch(stdout + stderr, new RegExp(SECRET));
		assert.equal(backups().length, 1);
		const manifest = readFileSync(join(fx.configDir, "backups/agentry", backups()[0], "manifest.json"), "utf8");
		assert.doesNotMatch(manifest, new RegExp(SECRET));

		const listed = mcp(["list-parked"]).stdout;
		assert.match(listed, /^demo {2}parked .*stdio echo hi; env API_KEY=<masked>/);
		assert.doesNotMatch(listed, new RegExp(SECRET));
	});

	test("enable previews masked, then round-trips to an identical config and deletes the parked copy", () => {
		mcp(["disable", "demo", "--yes"]);
		const preview = mcp(["enable", "demo", "--dry-run"]);
		assert.equal(preview.status, 0);
		assert.match(preview.stdout, /Add back user MCP server demo \(stdio echo hi; env API_KEY=<masked>\)/);
		assert.match(preview.stdout, /run: claude mcp add-json demo <parked config> --scope user/);
		assert.doesNotMatch(preview.stdout, new RegExp(SECRET));
		assert.deepEqual(Object.keys(servers()), ["other"]);

		const { status, stdout, stderr } = mcp(["enable", "demo", "--yes"]);
		assert.equal(status, 0, stderr + stdout);
		assert.deepEqual(servers().demo, DEMO);
		assert.deepEqual(servers().other, OTHER);
		assert.deepEqual(JSON.parse(readFileSync(parkedFile(), "utf8")).servers, {});
		assert.match(stdout, /demo is back in user scope/);
		assert.doesNotMatch(stdout + stderr, new RegExp(SECRET));
		const [, add] = fake.argv();
		assert.deepEqual(add.slice(0, 3), ["mcp", "add-json", "demo"]);
		assert.deepEqual(JSON.parse(add[3]), DEMO);
		assert.deepEqual(add.slice(4), ["--scope", "user"]);
	});

	test("fix --undo puts the entry back in ~/.claude.json", () => {
		const before = readFileSync(claudeJson(), "utf8");
		mcp(["disable", "demo", "--yes"]);
		assert.equal(fx.run(["fix", "--undo", "--yes"]).status, 0);
		assert.equal(readFileSync(claudeJson(), "utf8"), before);
	});

	test("when the remove fails the parked copy stays and the server is still configured", () => {
		const { status, stdout, stderr } = mcp(["disable", "demo", "--yes"], { FAKE_CLAUDE_FAIL: "1" });
		assert.equal(status, 1);
		assert.match(stdout + stderr, /command failed/);
		assert.deepEqual(servers().demo, DEMO);
		assert.deepEqual(JSON.parse(readFileSync(parkedFile(), "utf8")).servers.demo.config, DEMO);
		// the same config can be parked again
		assert.equal(mcp(["disable", "demo", "--yes"]).status, 0);
		assert.equal(servers().demo, undefined);
	});

	test("when the parked copy cannot be saved nothing is removed", () => {
		writeFileSync(join(fx.configDir, "agentry"), "a file where the folder should be");
		const { status, stdout, stderr } = mcp(["disable", "demo", "--yes"]);
		assert.equal(status, 1);
		assert.match(stdout + stderr, /could not save the parked copy/);
		assert.deepEqual(servers().demo, DEMO);
		assert.deepEqual(fake.argv(), []);
	});
});

describe("refusals and usage", () => {
	test("unknown names, unparked names and existing names", () => {
		assert.match(mcp(["disable", "nope"]).stderr, /refused: No user-scope MCP server "nope"/);
		assert.equal(mcp(["disable", "nope"]).status, 1);
		assert.match(mcp(["enable", "demo"]).stderr, /refused: demo is not parked. Parked: none/);
		mcp(["disable", "demo", "--yes"]);
		const servers2 = JSON.parse(readFileSync(claudeJson(), "utf8"));
		servers2.mcpServers.demo = { type: "stdio", command: "other" };
		writeFileSync(claudeJson(), JSON.stringify(servers2));
		const { status, stderr } = mcp(["enable", "demo", "--yes"]);
		assert.equal(status, 1);
		assert.match(stderr, /already exists; not overwriting/);
		assert.match(mcp(["disable", "demo", "--yes"]).stderr, /already parked with a different config/);
	});

	test("a project .mcp.json server is turned off for this project only, and back on again", () => {
		writeFileSync(join(fx.repo, ".mcp.json"), JSON.stringify({ mcpServers: { fromrepo: { command: "echo" } } }));
		const off = mcp(["disable", "fromrepo", "--yes"]);
		assert.equal(off.status, 0, off.stderr);
		const projects = JSON.parse(readFileSync(claudeJson(), "utf8")).projects;
		assert.deepEqual(Object.values(projects).map((project) => project.disabledMcpServers), [["fromrepo"]]);
		assert.equal(mcp(["disable", "fromrepo", "--yes"]).status, 0);
		const on = mcp(["enable", "fromrepo", "--yes"]);
		assert.equal(on.status, 0, on.stderr);
		assert.deepEqual(Object.values(JSON.parse(readFileSync(claudeJson(), "utf8")).projects).map((project) => project.disabledMcpServers), [[]]);
		assert.deepEqual(fake.argv(), []);
	});

	test("remove deletes a project .mcp.json entry from the file, and a user server through claude mcp remove, without parking", () => {
		writeFileSync(join(fx.repo, ".mcp.json"), JSON.stringify({ mcpServers: { fromrepo: { command: "echo" }, keep: { command: "echo" } } }));
		const project = mcp(["remove", "fromrepo", "--yes"]);
		assert.equal(project.status, 0, project.stderr);
		assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(fx.repo, ".mcp.json"), "utf8")).mcpServers), ["keep"]);
		const user = mcp(["remove", "demo", "--yes"]);
		assert.equal(user.status, 0, user.stderr);
		assert.deepEqual(fake.argv(), [["mcp", "remove", "demo", "--scope", "user"]]);
		assert.equal(existsSync(parkedFile()), false);
		assert.doesNotMatch(user.stdout + user.stderr, new RegExp(SECRET));
	});

	test("remove --dry-run changes nothing; a parked copy alone can be deleted", () => {
		assert.equal(mcp(["remove", "demo", "--dry-run"]).status, 0);
		assert.deepEqual(fake.argv(), []);
		assert.equal(mcp(["disable", "demo", "--yes"]).status, 0);
		assert.equal(mcp(["remove", "demo"]).status, 1);
		assert.equal(mcp(["remove", "demo", "--yes"]).status, 0);
		assert.deepEqual(Object.keys(JSON.parse(readFileSync(parkedFile(), "utf8")).servers), []);
	});

	test("desktop servers are still refused with who manages them", () => {
		const { status, stderr } = mcp(["disable", "nothing-here", "--yes"]);
		assert.equal(status, 1);
		assert.match(stderr, /No user-scope MCP server/);
	});

	test("usage errors exit 2 and the help lists the commands", () => {
		assert.equal(mcp([]).status, 2);
		assert.equal(mcp(["toggle", "x"]).status, 2);
		assert.equal(mcp(["disable", "demo", "--yes", "--dry-run"]).status, 2);
		assert.match(fx.run(["--help"]).stdout, /mcp disable\|enable <name>/);
		assert.equal(mcp(["list-parked"]).status, 0);
	});
});
