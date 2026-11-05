import assert from "node:assert/strict";
import type { Fixture } from "./helpers/fixture.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createFixture } from "./helpers/fixture.js";
import { installFakeClaude } from "./helpers/fake-claude.js";

const SECRET = "sk-supersecretvalue1234567890";
const DEMO = { type: "stdio", command: "echo", args: ["hi"], env: { API_KEY: SECRET, KEEP: "1" } };

let fx: Fixture;
let fake: ReturnType<typeof installFakeClaude>;
let extra: NodeJS.ProcessEnv;
beforeEach(() => {
	fx = createFixture();
	fake = installFakeClaude(join(fx.root, "fakebin"));
	extra = { PATH: `${join(fx.root, "fakebin")}:${process.env.PATH}` };
	writeFileSync(claudeJson(), `${JSON.stringify({ numStartups: 7, mcpServers: { demo: DEMO } }, null, 2)}\n`);
});
afterEach(() => fx.cleanup());

const claudeJson = () => join(fx.configDir, ".claude.json");
const servers = () => JSON.parse(readFileSync(claudeJson(), "utf8")).mcpServers;
const mcp = (args: string[]) => fx.run(["mcp", ...args], { env: extra });

describe("agentry mcp add", () => {
	test("--dry-run previews a masked command and runs nothing", () => {
		const { status, stdout, stderr } = mcp(["add", "files", "--command", "npx", "--arg=-y", "--arg", "@s/files", "--env", `FILES_TOKEN=${SECRET}`, "--dry-run"]);
		assert.equal(status, 0, stderr);
		assert.match(stdout, /Add user MCP server files \(stdio npx -y @s\/files; env FILES_TOKEN=<masked>\)/);
		assert.match(stdout, /run: claude mcp add-json files .* --scope user/);
		assert.doesNotMatch(stdout + stderr, new RegExp(SECRET));
		assert.deepEqual(fake.argv(), []);
		assert.equal(servers().files, undefined);
	});

	test("--yes runs claude mcp add-json with the real JSON, prints no secret, backs up, undo restores", () => {
		const { status, stdout, stderr } = mcp(["add", "files", "--command", "npx", "--arg=-y", "--env", `FILES_TOKEN=${SECRET}`, "--yes"]);
		assert.equal(status, 0, stderr + stdout);
		assert.deepEqual(servers().files, { type: "stdio", command: "npx", args: ["-y"], env: { FILES_TOKEN: SECRET } });
		assert.deepEqual(fake.argv().map((argv) => argv.slice(0, 3)), [["mcp", "add-json", "files"]]);
		assert.match(stdout, /files is added to user scope/);
		assert.doesNotMatch(stdout + stderr, new RegExp(SECRET));
		assert.equal(fx.run(["fix", "--undo", "--yes"]).status, 0);
		assert.equal(servers().files, undefined);
	});

	test("a url server with a header, and the project scope edits .mcp.json (created when missing)", () => {
		const { status, stdout } = mcp(["add", "docs", "--url", "https://example.com/mcp", "--header", `Authorization: Bearer ${SECRET}`, "--scope", "project", "--dry-run"]);
		assert.equal(status, 0);
		assert.match(stdout, /Add project MCP server docs \(http https:\/\/example\.com\/mcp; headers Authorization: Bearer <masked>\)/);
		assert.doesNotMatch(stdout, new RegExp(SECRET));
		assert.equal(existsSync(join(fx.repo, ".mcp.json")), false);
		assert.equal(mcp(["add", "docs", "--url", "https://example.com/mcp", "--header", `Authorization: Bearer ${SECRET}`, "--scope", "project", "--yes"]).status, 0);
		assert.deepEqual(JSON.parse(readFileSync(join(fx.repo, ".mcp.json"), "utf8")), { mcpServers: { docs: { type: "http", url: "https://example.com/mcp", headers: { Authorization: `Bearer ${SECRET}` } } } });
		assert.deepEqual(fake.argv(), []);
		assert.equal(fx.run(["fix", "--undo", "--yes"]).status, 0);
		assert.equal(existsSync(join(fx.repo, ".mcp.json")), false);
	});

	test("an existing .mcp.json keeps its other servers and formatting", () => {
		const text = '{\n  "mcpServers": {\n    "a": { "command": "x" }\n  }\n}\n';
		writeFileSync(join(fx.repo, ".mcp.json"), text);
		assert.equal(mcp(["add", "b", "--command", "y", "--scope", "project", "--yes"]).status, 0);
		const after = readFileSync(join(fx.repo, ".mcp.json"), "utf8");
		assert.ok(after.startsWith('{\n  "mcpServers": {\n    "a": { "command": "x" },'));
		assert.deepEqual(Object.keys(JSON.parse(after).mcpServers), ["a", "b"]);
	});

	test("refuses an existing name, bad usage exits 2, a failing claude exits 1", () => {
		const taken = mcp(["add", "demo", "--command", "x", "--yes"]);
		assert.equal(taken.status, 1);
		assert.match(taken.stderr, /already exists; not overwriting/);
		assert.equal(mcp(["add", "n", "--yes"]).status, 2);
		assert.equal(mcp(["add", "n", "--command", "x", "--url", "https://e.com", "--yes"]).status, 2);
		assert.equal(mcp(["add", "n", "--command", "x", "--env", "NOEQUALS", "--yes"]).status, 2);
		assert.equal(mcp(["add", "n", "--url", "ftp://e.com", "--yes"]).status, 2);
		assert.equal(mcp(["add", "n", "--command", "x", "--scope", "local", "--yes"]).status, 2);
		assert.equal(mcp(["add", "bad name", "--command", "x", "--yes"]).status, 2);
		const failing = fx.run(["mcp", "add", "n", "--command", "x", "--yes"], { env: { ...extra, FAKE_CLAUDE_FAIL: "1" } });
		assert.equal(failing.status, 1);
		assert.equal(servers().n, undefined);
	});
});

describe("agentry mcp set", () => {
	test("--dry-run shows a masked diff; --yes changes only the env and args, keeps the rest of the file", () => {
		const before = readFileSync(claudeJson(), "utf8");
		const dry = mcp(["set", "demo", "--env", "API_KEY=sk-newsecretvalue0987654321", "--unset-env", "KEEP", "--arg=-v", "--dry-run"]);
		assert.equal(dry.status, 0, dry.stderr);
		assert.match(dry.stdout, /Edit user MCP server demo: set env API_KEY; unset env KEEP; replace args \(1\)/);
		assert.doesNotMatch(dry.stdout, /sk-/);
		assert.equal(readFileSync(claudeJson(), "utf8"), before);
		const { status, stdout } = mcp(["set", "demo", "--env", "API_KEY=sk-newsecretvalue0987654321", "--unset-env", "KEEP", "--arg=-v", "--yes"]);
		assert.equal(status, 0, stdout);
		assert.deepEqual(servers().demo, { type: "stdio", command: "echo", args: ["-v"], env: { API_KEY: "sk-newsecretvalue0987654321" } });
		assert.equal(JSON.parse(readFileSync(claudeJson(), "utf8")).numStartups, 7);
		assert.doesNotMatch(stdout, /sk-/);
		assert.equal(fx.run(["fix", "--undo", "--yes"]).status, 0);
		assert.equal(readFileSync(claudeJson(), "utf8"), before);
	});

	test("removing the last env var drops the env key; adding env to a server without any creates it", () => {
		assert.equal(mcp(["set", "demo", "--unset-env", "API_KEY", "--unset-env", "KEEP", "--yes"]).status, 0);
		assert.equal(servers().demo.env, undefined);
		assert.equal(mcp(["set", "demo", "--env", "A=b=c", "--yes"]).status, 0);
		assert.deepEqual(servers().demo.env, { A: "b=c" });
	});

	test("an unchanged request is a no-op; refusals: missing server, url server, project server, no change given", () => {
		assert.match(mcp(["set", "demo", "--env", "KEEP=1"]).stdout, /nothing to change/);
		assert.equal(mcp(["set", "ghost", "--env", "A=b", "--yes"]).status, 1);
		writeFileSync(claudeJson(), JSON.stringify({ mcpServers: { remote: { type: "http", url: "https://e.com/mcp" } } }));
		assert.match(mcp(["set", "remote", "--env", "A=b", "--yes"]).stderr, /url server/);
		writeFileSync(join(fx.repo, ".mcp.json"), JSON.stringify({ mcpServers: { projsrv: { command: "x" } } }));
		assert.match(mcp(["set", "projsrv", "--env", "A=b", "--yes"]).stderr, /project server/);
		assert.equal(mcp(["set", "demo"]).status, 2);
	});
});
