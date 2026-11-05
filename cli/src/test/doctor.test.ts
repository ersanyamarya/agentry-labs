import assert from "node:assert/strict";
import type { Fixture } from "./helpers/fixture.js";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createDoctor } from "../lib/doctor.js";
import { createPaths } from "../lib/paths.js";
import { createFixture } from "./helpers/fixture.js";

// Layout: <root>/home/.claude (config), <root>/home/ws/repo (git repo), <root>/bin (PATH). Never reads the real home.
let root: string;
let home: string;
let configDir: string;
let repo: string;
let bin: string;
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-doc-")));
	assert.ok(!root.startsWith(realpathSync(homedir())), "TMPDIR must be outside the home directory");
	home = join(root, "home");
	configDir = join(home, ".claude");
	repo = join(home, "ws", "repo");
	bin = join(root, "bin");
	mkdirSync(repo, { recursive: true });
	mkdirSync(configDir, { recursive: true });
	mkdirSync(bin);
	execFileSync("git", ["init", "-q"], { cwd: repo });
	writeFileSync(join(bin, "tool"), "#!/bin/sh\n");
	chmodSync(join(bin, "tool"), 0o755);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const writeJson = (file: string, value: unknown) => {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(value, null, "\t"));
};
const claudeJson = (value: unknown) => writeJson(join(configDir, ".claude.json"), value);
const userSettings = (value: unknown) => writeJson(join(configDir, "settings.json"), value);
const skill = (dir: string, name: string) => {
	mkdirSync(join(dir, name), { recursive: true });
	writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: does a thing\n---\n`);
};
const pluginRoot = (name: string) => join(configDir, "plugins", "cache", "mk", name, "1.0.0");
const install = (installed: Record<string, unknown>) => writeJson(join(configDir, "plugins", "installed_plugins.json"), { version: 2, plugins: installed });
const doctor = ({ launchctl = "" } = {}) =>
	createDoctor(createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir } }), { out: () => {}, platform: "darwin", env: { PATH: bin }, launchctlGetenv: () => launchctl, renames: { graft: "trail" } });
const findings = (id: string, options?: { launchctl?: string }) => doctor(options).collect(repo).findings.filter((item) => item.id === id);

describe("duplicates", () => {
	test("dup-plugin-scope: the same plugin at user and local scope", () => {
		const dir = pluginRoot("tools");
		mkdirSync(dir, { recursive: true });
		install({ "tools@mk": [{ scope: "user", installPath: dir, version: "1.0.0" }, { scope: "local", projectPath: repo, installPath: dir, version: "1.0.0" }] });
		const [item, ...rest] = findings("dup-plugin-scope");
		assert.equal(rest.length, 0);
		assert.equal(item.severity, "warning");
		assert.equal(item.file, join(configDir, "plugins", "installed_plugins.json"));
		assert.match(item.fix!, new RegExp(`cd ${repo} && claude plugin uninstall tools@mk --scope local`));
	});

	test("dup-plugin-scope: an install for another project is not a duplicate", () => {
		const dir = pluginRoot("tools");
		mkdirSync(dir, { recursive: true });
		install({ "tools@mk": [{ scope: "user", installPath: dir }, { scope: "local", projectPath: join(root, "elsewhere"), installPath: dir }] });
		assert.deepEqual(findings("dup-plugin-scope"), []);
	});

	test("dup-skill-name: a personal and a project skill with one name", () => {
		skill(join(configDir, "skills"), "same");
		skill(join(repo, ".claude", "skills"), "same");
		const [item] = findings("dup-skill-name");
		assert.equal(item.severity, "warning");
		assert.equal(item.file, join(repo, ".claude", "skills", "same"));
		assert.match(item.fix!, /rm /);
	});

	test("dup-mcp-scope: one server name in .mcp.json and user scope, with the line", () => {
		claudeJson({ mcpServers: { dup: { command: "tool" } } });
		writeJson(join(repo, ".mcp.json"), { mcpServers: { dup: { command: "tool" } } });
		userSettings({ enableAllProjectMcpServers: true });
		const [item] = findings("dup-mcp-scope");
		assert.equal(item.severity, "warning");
		assert.equal(item.file, join(repo, ".mcp.json"));
		assert.equal(item.line, 3);
		assert.match(item.message, /also in user scope/);
		assert.match(item.fix!, /claude mcp remove dup -s project/);
	});

	test("dup-mcp-plugin: context-mode in .mcp.json while the plugin is enabled", () => {
		const dir = pluginRoot("context-mode");
		writeJson(join(dir, ".mcp.json"), { mcpServers: { "context-mode": { command: "tool", args: ["${CLAUDE_PLUGIN_ROOT}/start.mjs"] } } });
		install({ "context-mode@mk": [{ scope: "user", installPath: dir, version: "1.0.0" }] });
		userSettings({ enabledPlugins: { "context-mode@mk": true }, enableAllProjectMcpServers: true });
		writeJson(join(repo, ".mcp.json"), { mcpServers: { "context-mode": { command: "tool", args: ["serve"] } } });
		const [item] = findings("dup-mcp-plugin");
		assert.equal(item.severity, "warning");
		assert.equal(item.file, join(repo, ".mcp.json"));
		assert.equal(item.line, 3);
		assert.match(item.fix!, /context-mode@mk|plugin already provides/);
	});
});

describe("broken references", () => {
	test("missing-mcp-command: a server whose command is not on PATH (error, exit 1)", () => {
		claudeJson({ mcpServers: { graft: { command: "graft-not-installed", args: ["mcp"] } } });
		const [item] = findings("missing-mcp-command");
		assert.equal(item.severity, "error");
		assert.equal(item.file, join(configDir, ".claude.json"));
		assert.equal(item.line, 3);
		assert.match(item.fix!, /claude mcp remove graft -s user/);
		assert.equal(doctor().run({ path: repo }), 1);
	});

	test("missing-hook-file: a hook command pointing at a file that is gone", () => {
		userSettings({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "bash $HOME/hooks/gone.sh --flag" }] }] } });
		const [item] = findings("missing-hook-file");
		assert.equal(item.severity, "error");
		assert.equal(item.file, join(configDir, "settings.json"));
		assert.ok(item.line! > 0);
		assert.match(item.message, new RegExp(`${home}/hooks/gone.sh`));
	});

	test("broken-skill-link: a symlink to a folder that no longer exists", () => {
		mkdirSync(join(configDir, "skills"), { recursive: true });
		symlinkSync(join(root, "gone"), join(configDir, "skills", "dead"));
		const [item] = findings("broken-skill-link");
		assert.equal(item.severity, "warning");
		assert.equal(item.file, join(configDir, "skills", "dead"));
		assert.match(item.fix!, /rm /);
	});

	test("plugin-not-installed: enabledPlugins names a plugin that isn't installed", () => {
		userSettings({ enabledPlugins: { "ghost@mk": true, "off@mk": false } });
		const [item, ...rest] = findings("plugin-not-installed");
		assert.equal(rest.length, 0);
		assert.equal(item.file, join(configDir, "settings.json"));
		assert.equal(item.line, 3);
		assert.match(item.fix!, /claude plugin install ghost@mk/);
	});
});

describe("placeholders", () => {
	const header = () => claudeJson({ mcpServers: { ctx: { type: "http", url: "https://example.test/mcp", headers: { Authorization: "Bearer ${CTX_KEY}" } } } });

	test("unset-placeholder: ${VAR} in a header that launchd doesn't have", () => {
		header();
		const [item] = findings("unset-placeholder");
		assert.equal(item.severity, "warning");
		assert.equal(item.file, join(configDir, ".claude.json"));
		assert.match(item.message, /\$\{CTX_KEY\}/);
		assert.match(item.fix!, /launchctl setenv CTX_KEY "<value>"/);
		assert.match(item.fix!, /literal value/);
	});

	test("unset-placeholder: nothing when launchd has it, when a default exists, or off macOS; no value is ever read", () => {
		header();
		assert.deepEqual(findings("unset-placeholder", { launchctl: "set" }), []);
		claudeJson({ mcpServers: { ctx: { type: "http", url: "https://example.test/mcp", headers: { Authorization: "Bearer ${CTX_KEY:-fallback}" } } } });
		assert.deepEqual(findings("unset-placeholder"), []);
		header();
		const linux = createDoctor(createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir } }), { out: () => {}, platform: "linux", env: { PATH: bin }, launchctlGetenv: () => "" });
		assert.deepEqual(linux.collect(repo).findings.filter((item) => item.id === "unset-placeholder"), []);
	});
});

describe("stale names", () => {
	test("stale-name: permission entries, MCP name and command, and hook commands", () => {
		userSettings({
			permissions: { allow: ["Bash(graft:*)", "mcp__graft__find", "Read(graft/**)"] },
			statusLine: { type: "command", command: "node ~/.claude/helpers/graft-statusline.cjs" },
			hooks: { SessionStart: [{ hooks: [{ type: "command", command: "graft check" }] }], PreToolUse: [{ matcher: "mcp__graft__", hooks: [{ type: "command", command: "node ~/.claude/helpers/graft-hooks.cjs pre" }] }] },
		});
		claudeJson({ mcpServers: { graft: { command: "tool", args: ["mcp"] }, other: { command: "tool", args: ["graft", "serve"] } } });
		const items = findings("stale-name");
		const what = items.map((item) => item.message.split(" still")[0]).sort();
		assert.deepEqual(what, ['MCP server "graft"', 'MCP server "other"', 'Permission allow entry "Bash(graft:*)"', 'Permission allow entry "mcp__graft__find"', "PreToolUse hook", "PreToolUse hook matcher", "SessionStart hook", "statusLine command"]);
		assert.ok(items.every((item) => item.severity === "warning" && item.file && /trail/.test(item.fix!)));
		assert.ok(items.find((item) => item.message.startsWith("Permission"))!.line! > 0);
	});
});

describe("shelf", () => {
	// A skill folder on the shelf, in the group `group`; returns its path.
	const shelfSkill = (group: string, name: string) => {
		skill(join(configDir, "skill-shelf", group), name);
		return join(configDir, "skill-shelf", group, name);
	};

	test("shelf-duplicate: a real global folder identical to a shelved copy (file list and bytes)", () => {
		writeFileSync(join(shelfSkill("video", "trim"), "run.sh"), "echo\n");
		skill(join(configDir, "skills"), "trim");
		writeFileSync(join(configDir, "skills", "trim", "run.sh"), "echo\n");
		const [item, ...rest] = findings("shelf-duplicate");
		assert.equal(rest.length, 0);
		assert.equal(item.severity, "warning");
		assert.equal(item.file, join(configDir, "skills", "trim"));
		assert.match(item.message, /video\/trim/);
		assert.match(item.fix!, /rm -r ".*skills\/trim"/);
		assert.match(item.fix!, /agentry shelf on video\/trim/);
	});

	test("shelf-duplicate: nothing when the file list or the bytes differ, or the global copy is a link into the shelf", () => {
		const copy = shelfSkill("video", "trim");
		writeFileSync(join(copy, "run.sh"), "echo\n");
		skill(join(configDir, "skills"), "trim");
		assert.deepEqual(findings("shelf-duplicate"), []);
		writeFileSync(join(configDir, "skills", "trim", "run.sh"), "echo changed\n");
		assert.deepEqual(findings("shelf-duplicate"), []);
		rmSync(join(configDir, "skills", "trim"), { recursive: true });
		symlinkSync(copy, join(configDir, "skills", "trim"));
		assert.deepEqual(findings("shelf-duplicate"), []);
	});
});

describe("clean setup", () => {
	test("reports nothing and exits 0", () => {
		const hookFile = join(home, "hooks", "ok.sh");
		mkdirSync(dirname(hookFile), { recursive: true });
		writeFileSync(hookFile, "#!/bin/sh\n");
		skill(join(configDir, "skills"), "mine");
		skill(join(repo, ".claude", "skills"), "theirs");
		skill(join(configDir, "skill-shelf", "video"), "other");
		writeFileSync(join(repo, "bundles.tsv"), "global\tskills/mine\n");
		const dir = pluginRoot("tools");
		skill(join(dir, "skills"), "s1");
		install({ "tools@mk": [{ scope: "user", installPath: dir, version: "1.0.0" }] });
		userSettings({
			enabledPlugins: { "tools@mk": true },
			permissions: { allow: ["Bash(git status:*)"] },
			hooks: { SessionStart: [{ hooks: [{ type: "command", command: `bash ${hookFile}` }] }] },
		});
		claudeJson({ mcpServers: { ctx: { command: "tool", env: { LITERAL: "x" } }, web: { type: "http", url: "https://example.test", headers: { Authorization: "Bearer ${SET_KEY}" } } } });
		const run = doctor({ launchctl: "set" });
		const data = run.collect(repo);
		assert.deepEqual(data.findings, []);
		assert.deepEqual(data.summary, { error: 0, warning: 0, info: 0 });
		assert.equal(run.run({ path: repo }), 0);
	});
});

describe("agentry doctor (CLI)", () => {
	let fx: Fixture;
	beforeEach(() => {
		fx = createFixture();
	});
	afterEach(() => fx.cleanup());

	test("--json lists findings and the exit code follows the error count", () => {
		writeJson(join(fx.configDir, ".claude.json"), { mcpServers: { broken: { command: "agentry-no-such-command" } } });
		const { status, stdout } = fx.run(["doctor", "--json"]);
		assert.equal(status, 1);
		const data = JSON.parse(stdout);
		assert.deepEqual(data.summary, { error: 1, warning: 0, info: 0 });
		assert.deepEqual(Object.keys(data.findings[0]).sort(), ["file", "fix", "id", "line", "message", "severity"]);
	});

	test("human output names severity, rule, file and fix; warnings alone exit 0", () => {
		writeJson(join(fx.configDir, "settings.json"), { enabledPlugins: { "ghost@mk": true } });
		const { status, stdout } = fx.run(["doctor"]);
		assert.equal(status, 0);
		assert.match(stdout, /^warning {2}\[plugin-not-installed\]/);
		assert.match(stdout, /settings\.json:3/);
		assert.match(stdout, /fix: claude plugin install ghost@mk/);
		assert.match(stdout, /0 errors, 1 warning\n/);
	});

	test("a clean setup prints so, and a bad folder exits 2", () => {
		const clean = fx.run(["doctor"]);
		assert.equal(clean.status, 0);
		assert.equal(clean.stdout, "No problems found.\n");
		assert.equal(fx.run(["doctor", join(fx.root, "missing")]).status, 2);
		assert.equal(fx.run(["doctor", "a", "b"]).status, 2);
	});
});
