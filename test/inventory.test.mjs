import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createHooksReader } from "../lib/inventory/hooks.mjs";
import { createPluginsReader } from "../lib/inventory/plugins.mjs";
import { createSkillsReader } from "../lib/inventory/skills.mjs";
import { createPaths } from "../lib/paths.mjs";
import { createStatus } from "../lib/status.mjs";
import { createFixture } from "./helpers/fixture.mjs";

// Layout: <root>/home/.claude (config), <root>/home/ws/repo (git repo). Nothing here reads the real home.
let root;
let home;
let configDir;
let repo;
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-inv-")));
	assert.ok(!root.startsWith(realpathSync(homedir())), "TMPDIR must be outside the home directory");
	home = join(root, "home");
	configDir = join(home, ".claude");
	repo = join(home, "ws", "repo");
	mkdirSync(join(repo, "sub"), { recursive: true });
	mkdirSync(configDir, { recursive: true });
	execFileSync("git", ["init", "-q"], { cwd: repo });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const writeJson = (file, value) => {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(value));
};
const skill = (dir, name, description = "does a thing") => {
	mkdirSync(join(dir, name), { recursive: true });
	writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`);
};
const paths = () => createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir } });
const pluginRoot = (name) => join(configDir, "plugins", "cache", "mk", name, "1.0.0");
const install = (installed) => writeJson(join(configDir, "plugins", "installed_plugins.json"), { version: 2, plugins: installed });
const settings = (scope, value) => writeJson(scope === "user" ? join(configDir, "settings.json") : join(repo, ".claude", scope === "local" ? "settings.local.json" : "settings.json"), value);
const names = (items) => items.map((item) => item.name ?? item.id).sort();

describe("skills reader", () => {
	test("reads personal, project and plugin skills; skips synced but reports it", () => {
		skill(join(configDir, "skills"), "mine");
		skill(join(configDir, "skills", "synced"), "from-claude-ai");
		skill(join(repo, ".claude", "skills"), "proj", "x".repeat(40));
		const dir = pluginRoot("tools");
		skill(join(dir, "skills"), "s1");
		install({ "tools@mk": [{ scope: "user", installPath: dir, version: "1.0.0" }] });
		const { skills, skipped } = createSkillsReader(paths()).read({ cwd: repo });
		assert.deepEqual(names(skills), ["mine", "proj", "tools:s1"]);
		assert.equal(skills.find((item) => item.name === "proj").tokens, 10);
		assert.equal(skills.find((item) => item.name === "proj").source, join(repo, ".claude", "skills", "proj"));
		assert.equal(skills.find((item) => item.name === "tools:s1").plugin, "tools@mk");
		assert.deepEqual(skipped.map(({ path, count }) => ({ path, count })), [{ path: join(configDir, "skills", "synced"), count: 1 }]);
	});

	test("marks file, shelf link, other symlink and broken symlink", () => {
		const skills = join(repo, ".claude", "skills");
		skill(skills, "plain");
		skill(join(configDir, "skill-shelf", "video"), "trim");
		skill(join(root, "elsewhere"), "outside");
		symlinkSync(join(configDir, "skill-shelf", "video", "trim"), join(skills, "trim"));
		symlinkSync(join(root, "elsewhere", "outside"), join(skills, "outside"));
		symlinkSync(join(root, "gone"), join(skills, "dangling"));
		const result = createSkillsReader(paths()).read({ cwd: repo }).skills;
		const by = (name) => result.find((item) => item.name === name);
		assert.equal(by("plain").kind, "file");
		assert.equal(by("trim").kind, "symlink");
		assert.equal(by("trim").shelfGroup, "video");
		assert.equal(by("outside").kind, "symlink");
		assert.equal(by("outside").shelfGroup, undefined);
		assert.equal(by("dangling").kind, "broken");
		assert.equal(by("dangling").state, "broken");
		assert.equal(by("dangling").tokens, null);
	});

	test("a disabled plugin's skills are listed as disabled; a plugin installed for another project adds none", () => {
		const off = pluginRoot("off");
		const other = pluginRoot("other");
		skill(join(off, "skills"), "a");
		skill(join(other, "skills"), "b");
		install({
			"off@mk": [{ scope: "user", installPath: off, version: "1.0.0" }],
			"other@mk": [{ scope: "local", projectPath: join(root, "another"), installPath: other, version: "1.0.0" }],
		});
		settings("user", { enabledPlugins: { "off@mk": false } });
		const result = createSkillsReader(paths()).read({ cwd: repo }).skills;
		assert.deepEqual(result.map((item) => [item.name, item.state]), [["off:a", "disabled"]]);
	});
});

describe("hooks reader", () => {
	const hook = (command, matcher) => ({ hooks: { PreToolUse: [{ ...(matcher && { matcher }), hooks: [{ type: "command", command }] }] } });

	test("reads user, project and local settings and plugin hooks.json with owner, matcher and masked secrets", () => {
		writeJson(join(home, ".claude.json"), {});
		writeJson(join(configDir, ".claude.json"), { projects: { [repo]: { hasTrustDialogAccepted: true } } });
		settings("user", hook("echo user"));
		settings("project", hook("echo project --token abcdef0123456789abcdef0123", "Bash"));
		settings("local", hook("echo local"));
		const dir = pluginRoot("tools");
		writeJson(join(dir, "hooks", "hooks.json"), hook("${CLAUDE_PLUGIN_ROOT}/run.sh", "Write"));
		install({ "tools@mk": [{ scope: "user", installPath: dir, version: "1.0.0" }] });
		writeJson(join(repo, ".claude", "settings.local.json"), { ...hook("echo local"), enabledPlugins: { "tools@mk": true } });
		const { hooks, trusted } = createHooksReader(paths()).read({ cwd: repo });
		assert.equal(trusted, true);
		assert.deepEqual(hooks.map((item) => [item.scope, item.event, item.matcher, item.state]), [
			["user", "PreToolUse", "*", "active"],
			["project", "PreToolUse", "Bash", "active"],
			["local", "PreToolUse", "*", "active"],
			["plugin", "PreToolUse", "Write", "active"],
		]);
		assert.equal(hooks[1].source, join(repo, ".claude", "settings.json"));
		assert.ok(!JSON.stringify(hooks).includes("abcdef0123456789abcdef0123"));
		assert.equal(hooks[3].plugin, "tools@mk");
		assert.equal(hooks[3].command, `${dir}/run.sh`);
		assert.equal(hooks[3].source, join(dir, "hooks", "hooks.json"));
	});

	test("project hooks in an untrusted folder, hooks of a disabled plugin and disableAllHooks are flagged", () => {
		settings("project", hook("echo p"));
		let result = createHooksReader(paths()).read({ cwd: repo });
		assert.equal(result.trusted, false);
		assert.equal(result.hooks[0].state, "untrusted");
		const dir = pluginRoot("tools");
		writeJson(join(dir, "hooks", "hooks.json"), hook("x"));
		install({ "tools@mk": [{ scope: "user", installPath: dir, version: "1.0.0" }] });
		settings("user", { enabledPlugins: { "tools@mk": false }, disableAllHooks: true });
		result = createHooksReader(paths()).read({ cwd: repo });
		assert.equal(result.disableAllHooks, true);
		assert.ok(result.hooks.every((item) => item.state === "disabled"));
	});

	test("accepts a plugin hooks.json without the outer hooks key, reports invalid JSON without its text", () => {
		const dir = pluginRoot("tools");
		writeJson(join(dir, "hooks", "hooks.json"), hook("x").hooks);
		install({ "tools@mk": [{ scope: "user", installPath: dir, version: "1.0.0" }] });
		writeFileSync(join(configDir, "settings.json"), '{"env": {"K": "supersecretvalue"');
		const { hooks, errors } = createHooksReader(paths()).read({ cwd: repo });
		assert.equal(hooks.length, 1);
		assert.deepEqual(errors, [{ source: join(configDir, "settings.json"), message: "invalid JSON" }]);
	});
});

describe("plugins reader", () => {
	test("reports scope, projectPath, version and marketplaces; a local install for another project does not apply here", () => {
		const a = pluginRoot("both");
		const b = pluginRoot("elsewhere");
		install({
			"both@mk": [
				{ scope: "user", installPath: a, version: "1.0.0" },
				{ scope: "local", projectPath: repo, installPath: a, version: "1.1.0" },
				{ scope: "local", projectPath: join(root, "other"), installPath: a, version: "0.9.0" },
			],
			"elsewhere@mk": [{ scope: "local", projectPath: join(root, "other"), installPath: b, version: "2.0.0" }],
		});
		writeJson(join(configDir, "plugins", "known_marketplaces.json"), { mk: { source: { source: "github", repo: "o/r" }, installLocation: "/x" } });
		const { plugins, marketplaces } = createPluginsReader(paths()).read({ cwd: repo });
		const both = plugins.find((item) => item.id === "both@mk");
		assert.equal(both.version, "1.1.0");
		assert.equal(both.installScope, "local");
		assert.deepEqual(both.installs.map((item) => item.appliesHere), [true, true, false]);
		assert.equal(both.installs[2].projectPath, join(root, "other"));
		assert.equal(plugins.find((item) => item.id === "elsewhere@mk").state, "not-here");
		assert.equal(plugins.find((item) => item.id === "elsewhere@mk").installPath, undefined);
		assert.deepEqual(marketplaces, [{ name: "mk", source: "o/r", sourceType: "github", installLocation: "/x" }]);
	});

	test("enabledPlugins: local beats project beats user; no entry means disabled; unknown ids are not-installed", () => {
		const a = pluginRoot("a");
		install({ "a@mk": [{ scope: "user", installPath: a, version: "1.0.0" }] });
		const state = () => createPluginsReader(paths()).read({ cwd: repo }).plugins.find((item) => item.id === "a@mk");
		assert.equal(state().state, "disabled");
		assert.equal(state().enabledBy.scope, "default");
		settings("user", { enabledPlugins: { "a@mk": false, "ghost@mk": true } });
		assert.equal(state().state, "disabled");
		assert.equal(state().enabledBy.scope, "user");
		settings("local", { enabledPlugins: { "a@mk": true } });
		assert.equal(state().state, "active");
		assert.equal(state().enabledBy.scope, "local");
		const ghost = createPluginsReader(paths()).read({ cwd: repo }).plugins.find((item) => item.id === "ghost@mk");
		assert.equal(ghost.state, "not-installed");
	});

	test("a project-scope install matches a start folder inside the repo", () => {
		const a = pluginRoot("a");
		install({ "a@mk": [{ scope: "project", projectPath: repo, installPath: a, version: "1.0.0" }] });
		settings("project", { enabledPlugins: { "a@mk": true } });
		assert.equal(createPluginsReader(paths()).read({ cwd: join(repo, "sub") }).plugins[0].state, "active");
	});
});

describe("status", () => {
	test("--json has a stable shape and leaks no secret", () => {
		skill(join(configDir, "skills"), "mine");
		writeJson(join(repo, ".mcp.json"), { mcpServers: { api: { type: "http", url: "https://h/mcp", headers: { Authorization: "Bearer sk-live-0123456789abcdef0123456789" } } } });
		writeJson(join(home, "ws", ".mcp.json"), { mcpServers: { parent: { command: "node", args: ["s.js"], env: { KEY: "supersecretvalue1234567890" } } } });
		settings("user", { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo done" }] }] } });
		const lines = [];
		const status = createStatus(paths(), { out: (line) => lines.push(line), platform: "linux" });
		assert.equal(status.run({ path: repo, json: true }), 0);
		const data = JSON.parse(lines.join("\n"));
		assert.deepEqual(Object.keys(data), ["version", "project", "skills", "mcp", "hooks", "plugins", "tokens", "errors"]);
		assert.deepEqual(Object.keys(data.project), ["cwd", "root", "repoKey", "trusted"]);
		assert.deepEqual(Object.keys(data.skills), ["items", "skipped"]);
		assert.deepEqual(Object.keys(data.skills.items[0]), ["name", "scope", "source", "kind", "state", "tokens"]);
		assert.deepEqual(Object.keys(data.hooks), ["items", "disableAllHooks"]);
		assert.deepEqual(Object.keys(data.hooks.items[0]), ["id", "event", "matcher", "type", "command", "scope", "source", "state", "tokens"]);
		assert.deepEqual(Object.keys(data.plugins), ["items", "marketplaces"]);
		assert.deepEqual(Object.keys(data.tokens), ["measured", "unit", "notMeasured"]);
		assert.deepEqual(data.tokens.notMeasured, ["MCP tool lists", "hook output"]);
		assert.equal(data.tokens.measured, data.skills.items[0].tokens);
		assert.deepEqual(data.mcp.servers.map((server) => [server.name, server.scope, server.tokens]).sort(), [
			["api", "project", null],
			["parent", "project", null],
		]);
		assert.equal(data.mcp.servers.find((server) => server.name === "parent").source, join(home, "ws", ".mcp.json"));
		assert.equal(data.hooks.items[0].tokens, null);
		assert.ok(!lines.join("\n").includes("0123456789abcdef0123456789"));
		assert.ok(!lines.join("\n").includes("supersecretvalue"));
	});

	test("human output groups Skills, MCP servers, Hooks and Plugins and says what is not measured; errors for a missing folder", () => {
		const lines = [];
		const errors = [];
		const status = createStatus(paths(), { out: (line) => lines.push(line), err: (line) => errors.push(line), platform: "linux" });
		assert.equal(status.run({ path: repo }), 0);
		const text = lines.join("\n");
		for (const heading of ["Skills:", "MCP servers:", "Hooks:", "Plugins:", "Not measured: MCP tool lists, hook output"]) {
			assert.ok(text.includes(heading), heading);
		}
		assert.equal(status.run({ path: join(root, "missing") }), 1);
		assert.match(errors[0], /Not a folder/);
	});

	test("the CLI runs status on a fixture, changes nothing and accepts a path", () => {
		const fixture = createFixture();
		try {
			skill(join(fixture.repo, ".claude", "skills"), "local-one");
			const { status, stdout } = fixture.run(["status", "--json"]);
			assert.equal(status, 0);
			assert.ok(JSON.parse(stdout).skills.items.some((item) => item.name === "local-one"));
			assert.equal(fixture.run(["status", fixture.repo, "--json"], { cwd: fixture.root }).status, 0);
			assert.equal(fixture.run(["status", join(fixture.root, "nope")]).status, 1);
		} finally {
			fixture.cleanup();
		}
	});
});
