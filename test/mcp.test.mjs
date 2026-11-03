import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createMcpReader } from "../lib/inventory/mcp.mjs";
import { maskArgs, maskHeader, maskUrl, maskValue } from "../lib/mask.mjs";
import { createPaths } from "../lib/paths.mjs";

// Layout: <root>/home/.claude (config), <root>/home/ws/repo (git repo), so the .mcp.json walk passes through ~.
let root;
let home;
let configDir;
let ws;
let repo;
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-mcp-")));
	home = join(root, "home");
	configDir = join(home, ".claude");
	ws = join(home, "ws");
	repo = join(ws, "repo");
	mkdirSync(join(repo, "sub", "child"), { recursive: true });
	mkdirSync(configDir, { recursive: true });
	execFileSync("git", ["init", "-q"], { cwd: repo });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const writeJson = (file, value) => {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(value));
};
const claudeJson = (value) => writeJson(join(configDir, ".claude.json"), value);
const reader = ({ platform = "linux", env = {} } = {}) => createMcpReader(createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir, ...env } }), { platform });
const read = (cwd = repo, options) => reader(options).read({ cwd });
const byName = (result, name) => result.servers.filter((server) => server.name === name);
const one = (result, name) => {
	const [server, ...rest] = byName(result, name);
	assert.equal(rest.length, 0, `one ${name}`);
	return server;
};

describe("paths", () => {
	test(".claude.json sits in the home directory, or inside CLAUDE_CONFIG_DIR when that is set", () => {
		assert.equal(createPaths({ env: { AGENTRY_HOME: home } }).claudeJson, join(home, ".claude.json"));
		assert.equal(createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: "/c" } }).claudeJson, "/c/.claude.json");
	});

	test("CLAUDE_CODE_PLUGIN_CACHE_DIR replaces the plugins root", () => {
		assert.equal(createPaths({ env: { AGENTRY_HOME: home } }).pluginsDir, join(home, ".claude", "plugins"));
		assert.equal(createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CODE_PLUGIN_CACHE_DIR: "/p" } }).pluginsDir, "/p");
	});

	test("repoKey is the main checkout root from a subfolder and from a worktree, the folder itself outside git", () => {
		const paths = createPaths({ env: { AGENTRY_HOME: home } });
		execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: repo });
		execFileSync("git", ["worktree", "add", "-q", join(ws, "wt")], { cwd: repo });
		assert.equal(paths.repoKey(join(repo, "sub")), repo);
		assert.equal(paths.repoKey(join(ws, "wt")), repo);
		assert.equal(paths.projectRoot(join(ws, "wt")), join(ws, "wt"));
		assert.equal(paths.repoKey(ws), ws);
	});
});

describe("MCP reader: .claude.json", () => {
	test("reads user servers and the local servers of this repo, keyed by the repo root", () => {
		claudeJson({
			mcpServers: { context7: { type: "http", url: "https://mcp.example.com/mcp" } },
			projects: {
				[repo]: { mcpServers: { db: { command: "db-server", args: ["--port", "1"] } } },
				[join(repo, "sub")]: { mcpServers: { ignored: { command: "x" } } },
				[join(ws, "other")]: { mcpServers: { elsewhere: { command: "x" } } },
			},
		});
		const result = read(join(repo, "sub"));
		assert.deepEqual(one(result, "context7"), { name: "context7", transport: "http", scope: "user", source: join(configDir, ".claude.json"), url: "https://mcp.example.com/mcp", loadsIn: ["cli", "desktop"], state: "active" });
		assert.equal(one(result, "db").scope, "local");
		assert.deepEqual(one(result, "db").args, ["--port", "1"]);
		assert.equal(one(result, "db").transport, "stdio");
		assert.deepEqual(byName(result, "ignored"), []);
		assert.deepEqual(byName(result, "elsewhere"), []);
		assert.deepEqual(result.errors, []);
	});

	test("a local server added in the main checkout is seen from its worktree", () => {
		execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: repo });
		execFileSync("git", ["worktree", "add", "-q", join(ws, "wt")], { cwd: repo });
		claudeJson({ projects: { [repo]: { mcpServers: { db: { command: "db" } } } } });
		assert.equal(one(read(join(ws, "wt")), "db").scope, "local");
	});

	test("disabledMcpServers in the project entry marks a server disabled", () => {
		claudeJson({ mcpServers: { graft: { command: "graft" } }, projects: { [repo]: { disabledMcpServers: ["graft"] } } });
		assert.equal(one(read(), "graft").state, "disabled");
	});
});

describe("MCP reader: .mcp.json", () => {
	test("reads the start folder and every parent, including ~ and above the repo, but not child folders", () => {
		writeJson(join(repo, "sub", ".mcp.json"), { mcpServers: { here: { command: "a" } } });
		writeJson(join(repo, ".mcp.json"), { mcpServers: { "repo-root": { command: "b" } } });
		writeJson(join(ws, ".mcp.json"), { mcpServers: { parent: { command: "c" } } });
		writeJson(join(home, ".mcp.json"), { mcpServers: { stray: { command: "d" } } });
		writeJson(join(repo, "sub", "child", ".mcp.json"), { mcpServers: { child: { command: "e" } } });
		const result = read(join(repo, "sub"));
		assert.equal(one(result, "here").source, join(repo, "sub", ".mcp.json"));
		assert.equal(one(result, "repo-root").scope, "project");
		assert.equal(one(result, "parent").source, join(ws, ".mcp.json"));
		assert.equal(one(result, "stray").source, join(home, ".mcp.json"));
		assert.deepEqual(byName(result, "child"), []);
	});

	test("the nearest .mcp.json wins a name clash; local beats project beats user", () => {
		writeJson(join(repo, ".mcp.json"), { mcpServers: { s: { command: "inner" }, both: { command: "project" } } });
		writeJson(join(ws, ".mcp.json"), { mcpServers: { s: { command: "outer" } } });
		claudeJson({ mcpServers: { both: { command: "user" }, top: { command: "user" } }, projects: { [repo]: { mcpServers: { top: { command: "local" } } } } });
		const result = read();
		const [inner, outer] = byName(result, "s");
		assert.equal(inner.command, "inner");
		assert.equal(inner.state, "pending-approval");
		assert.equal(outer.state, "shadowed");
		assert.deepEqual(outer.shadowedBy, { name: "s", scope: "project", source: join(repo, ".mcp.json") });
		assert.deepEqual(byName(result, "both").map((s) => [s.scope, s.state]), [["project", "pending-approval"], ["user", "shadowed"]]);
		assert.deepEqual(byName(result, "top").map((s) => [s.scope, s.state]), [["local", "active"], ["user", "shadowed"]]);
	});

	test("approval: pending by default, enableAllProjectMcpServers in user settings, project approvals only when trusted, rejections", () => {
		writeJson(join(repo, ".mcp.json"), { mcpServers: { a: { command: "a" }, b: { command: "b" }, c: { command: "c" } } });
		writeJson(join(repo, ".claude", "settings.local.json"), { enabledMcpjsonServers: ["a"], disabledMcpjsonServers: ["c"] });
		claudeJson({ projects: { [repo]: { hasTrustDialogAccepted: false } } });
		let result = read();
		assert.deepEqual(["a", "b", "c"].map((name) => one(result, name).state), ["pending-approval", "pending-approval", "rejected"]);

		claudeJson({ projects: { [repo]: { hasTrustDialogAccepted: true, enabledMcpjsonServers: ["b"] } } });
		result = read();
		assert.deepEqual(["a", "b", "c"].map((name) => one(result, name).state), ["active", "active", "rejected"]);

		claudeJson({});
		writeJson(join(configDir, "settings.json"), { enableAllProjectMcpServers: true });
		result = read();
		assert.deepEqual(["a", "b", "c"].map((name) => one(result, name).state), ["active", "active", "rejected"]);
	});

	test("accepts streamable-http as http and a bare name map", () => {
		writeJson(join(repo, ".mcp.json"), { remote: { type: "streamable-http", url: "https://x.example/mcp" } });
		assert.equal(one(read(), "remote").transport, "http");
	});
});

describe("MCP reader: plugins", () => {
	let installed;
	beforeEach(() => {
		installed = {};
	});
	const install = (id, entries) => {
		installed[id] = entries;
		writeJson(join(configDir, "plugins", "installed_plugins.json"), { version: 2, plugins: installed });
	};
	const pluginRoot = (name) => join(configDir, "plugins", "cache", "mk", name, "1.0.0");

	test("reads inline plugin.json servers, the plugin's .mcp.json and manifest paths, with ${CLAUDE_PLUGIN_ROOT} expanded", () => {
		const dir = pluginRoot("tools");
		writeJson(join(dir, ".claude-plugin", "plugin.json"), { name: "tools", mcpServers: { inline: { command: "${CLAUDE_PLUGIN_ROOT}/bin/server", args: ["${CLAUDE_PLUGIN_ROOT}/cfg.json"] } } });
		writeJson(join(dir, ".mcp.json"), { mcpServers: { file: { command: "node", args: ["x.js"] } } });
		install("tools@mk", [{ scope: "user", installPath: dir, version: "1.0.0" }]);
		const result = read();
		const inline = one(result, "plugin:tools:inline");
		assert.equal(inline.command, join(dir, "bin", "server"));
		assert.deepEqual(inline.args, [join(dir, "cfg.json")]);
		assert.equal(inline.plugin, "tools@mk");
		assert.equal(inline.source, join(dir, ".claude-plugin", "plugin.json"));
		assert.equal(inline.state, "active");
		assert.equal(one(result, "plugin:tools:file").source, join(dir, ".mcp.json"));

		writeJson(join(dir, ".claude-plugin", "plugin.json"), { name: "tools", mcpServers: "./extra.json" });
		writeJson(join(dir, "extra.json"), { mcpServers: { extra: { command: "e" } } });
		assert.equal(one(read(), "plugin:tools:extra").source, join(dir, "extra.json"));
	});

	test("a disabled plugin's servers are disabled; local beats user in enabledPlugins", () => {
		const dir = pluginRoot("tools");
		writeJson(join(dir, ".mcp.json"), { mcpServers: { s: { command: "s" } } });
		install("tools@mk", [{ scope: "user", installPath: dir }]);
		writeJson(join(configDir, "settings.json"), { enabledPlugins: { "tools@mk": false } });
		assert.equal(one(read(), "plugin:tools:s").state, "disabled");
		writeJson(join(repo, ".claude", "settings.local.json"), { enabledPlugins: { "tools@mk": true } });
		assert.equal(one(read(), "plugin:tools:s").state, "active");
	});

	test("a local-scope install applies only to its own project", () => {
		const dir = pluginRoot("only-there");
		writeJson(join(dir, ".mcp.json"), { mcpServers: { s: { command: "s" } } });
		install("only-there@mk", [{ scope: "local", projectPath: join(ws, "other"), installPath: dir }]);
		assert.deepEqual(byName(read(), "plugin:only-there:s"), []);
		install("only-there@mk", [{ scope: "local", projectPath: repo, installPath: dir }]);
		assert.equal(one(read(), "plugin:only-there:s").scope, "plugin");
	});

	test("a plugin server with the same endpoint as a user server is shadowed", () => {
		const dir = pluginRoot("ctx");
		writeJson(join(dir, ".mcp.json"), { mcpServers: { ctx: { command: "npx", args: ["ctx-mode"] } } });
		install("ctx@mk", [{ scope: "user", installPath: dir }]);
		claudeJson({ mcpServers: { "context-mode": { command: "npx", args: ["ctx-mode"] } } });
		const plugin = one(read(), "plugin:ctx:ctx");
		assert.equal(plugin.state, "shadowed");
		assert.equal(plugin.shadowedBy.name, "context-mode");
	});
});

describe("MCP reader: desktop app", () => {
	const desktop = () => join(home, "Library", "Application Support", "Claude");
	beforeEach(() => {
		writeJson(join(desktop(), "claude_desktop_config.json"), { mcpServers: { fs: { command: "npx", args: ["server-fs"] } }, preferences: {} });
		const ext = join(desktop(), "Claude Extensions", "local.mcpb.acme.tool");
		writeJson(join(ext, "manifest.json"), { name: "tool", display_name: "Acme Tool", server: { type: "node", mcp_config: { command: "node", args: ["${__dirname}/server/index.js"], env: { ACME_KEY: "acme-secret-value-123" } } } });
		writeJson(join(desktop(), "Claude Extensions Settings", "local.mcpb.acme.tool.json"), { isEnabled: false });
		writeFileSync(join(desktop(), "Claude Extensions", ".DS_Store"), "");
	});

	test("on macOS reads claude_desktop_config.json and installed extensions, loaded by the desktop app only", () => {
		const result = read(repo, { platform: "darwin" });
		const fs = one(result, "fs");
		assert.equal(fs.scope, "desktop-config");
		assert.deepEqual(fs.loadsIn, ["desktop"]);
		const ext = one(result, "Acme Tool");
		assert.equal(ext.scope, "desktop-extension");
		assert.equal(ext.state, "disabled");
		assert.deepEqual(ext.args, [join(desktop(), "Claude Extensions", "local.mcpb.acme.tool", "server", "index.js")]);
		assert.deepEqual(ext.env, { ACME_KEY: "<masked>" });
	});

	test("elsewhere skips the desktop app", () => {
		assert.deepEqual(byName(read(repo, { platform: "linux" }), "fs"), []);
	});
});

describe("masking", () => {
	const SECRETS = ["sk-live-0123456789abcdef", "hunter2-password", "ghp_abcdefghijklmnop1234", "q1w2e3r4t5y6u7i8o9p0zz", "tok3n-in-path-abcdefghij12345", "basic-userinfo-pass", "default-secret-value"];

	test("no secret literal survives in servers or errors", () => {
		claudeJson({
			mcpServers: {
				remote: {
					type: "http",
					url: `https://user:${SECRETS[5]}@mcp.example.com/${SECRETS[4]}/mcp?api_key=${SECRETS[3]}&region=\${REGION}`,
					headers: { Authorization: `Bearer ${SECRETS[0]}`, "X-Key": "${API_KEY}", "X-Fallback": `\${K:-${SECRETS[6]}}` },
				},
				local: {
					command: "npx",
					args: ["-y", "server", "--token", SECRETS[2], `--api-key=${SECRETS[1]}`, `API_TOKEN=${SECRETS[0]}`, `Authorization: Bearer ${SECRETS[3]}`, SECRETS[4], "--verbose"],
					env: { DB_PASSWORD: SECRETS[1], PLAIN: "trail", REF: "${CONTEXT7_API_KEY}" },
				},
			},
		});
		writeFileSync(join(repo, ".mcp.json"), `{"mcpServers": {"x": {"env": {"K": "${SECRETS[0]}"}}`);
		const result = read();
		const text = JSON.stringify(result);
		for (const secret of SECRETS) {
			assert.ok(!text.includes(secret), `leaked ${secret}`);
		}

		const remote = one(result, "remote");
		assert.equal(remote.url, "https://<masked>@mcp.example.com/<masked>/mcp?api_key=<masked>&region=${REGION}");
		assert.deepEqual(remote.headers, { Authorization: "Bearer <masked>", "X-Key": "${API_KEY}", "X-Fallback": "${K:-<masked>}" });
		const local = one(result, "local");
		assert.deepEqual(local.args, ["-y", "server", "--token", "<masked>", "--api-key=<masked>", "API_TOKEN=<masked>", "Authorization: Bearer <masked>", "<masked>", "--verbose"]);
		assert.deepEqual(local.env, { DB_PASSWORD: "<masked>", PLAIN: "<masked>", REF: "${CONTEXT7_API_KEY}" });
		assert.deepEqual(result.errors, [{ source: join(repo, ".mcp.json"), message: "invalid JSON" }]);
	});

	test("helpers keep references and harmless text", () => {
		assert.equal(maskValue(""), "");
		assert.equal(maskValue("pre-${A}-post"), "<masked>${A}<masked>");
		assert.equal(maskValue(42), "<masked>");
		assert.equal(maskHeader("Basic abc"), "Basic <masked>");
		assert.equal(maskUrl("${BASE:-https://api.example.com}/mcp"), "${BASE:-<masked>}/mcp");
		assert.equal(maskUrl("https://mcp.context7.com/mcp"), "https://mcp.context7.com/mcp");
		assert.deepEqual(maskArgs(["-y", "@scope/pkg@latest", "./server/index.js", "--port=3000", "--url=https://h.example/x?key=abc"]), ["-y", "@scope/pkg@latest", "./server/index.js", "--port=3000", "--url=https://h.example/x?key=<masked>"]);
	});
});
