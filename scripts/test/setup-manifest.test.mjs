import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { configStatus, diffSettings, forget, load, manifestPath, record } from "../setup-manifest.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "setup-manifest.mjs");
const cfg = () => mkdtempSync(join(tmpdir(), "manifest-"));

test("round trip: record merges and unions, forget drops a part", () => {
	const dir = cfg();
	assert.deepEqual(load(dir).parts, {});
	record(dir, "config", { hooks: [{ event: "SessionStart", command: "a" }], files: [{ path: "/x", sha256: "1" }] });
	record(dir, "config", { hooks: [{ event: "SessionStart", command: "a" }, { event: "Stop", command: "b" }] });
	record(dir, "trail", { tools: { manager: "npm", packages: { trail: "1" } } });
	const m = load(dir);
	assert.equal(m.version, 1);
	assert.equal(m.parts.config.hooks.length, 2);
	assert.equal(m.parts.config.files.length, 1);
	assert.equal(m.parts.trail.tools.manager, "npm");
	forget(dir, "config");
	assert.deepEqual(Object.keys(load(dir).parts), ["trail"]);
});

test("forget with keys keeps the rest of the part, and drops the part once empty", () => {
	const dir = cfg();
	record(dir, "context-mode", { tools: { manager: "npm" }, wired: true });
	forget(dir, "context-mode", ["wired"]);
	assert.deepEqual(load(dir).parts["context-mode"], { tools: { manager: "npm" } });
	forget(dir, "context-mode", ["tools"]);
	assert.deepEqual(load(dir).parts, {});
});

test("writes are atomic: no temp file is left behind", () => {
	const dir = cfg();
	record(dir, "agentry", { tools: { manager: "mise" } });
	assert.ok(existsSync(manifestPath(dir)));
	assert.deepEqual(readdirSync(join(dir, "agentry")), ["install-manifest.json"]);
});

test("diffSettings lists added hook commands and top-level keys only", () => {
	const before = { env: { A: "1" }, hooks: { Stop: [{ hooks: [{ command: "keep" }] }] } };
	const after = {
		env: { A: "1" },
		statusLine: { type: "command" },
		hooks: { Stop: [{ hooks: [{ command: "keep" }] }, { hooks: [{ command: "new-stop" }] }], SessionStart: [{ hooks: [{ command: "new-start" }] }] },
	};
	assert.deepEqual(diffSettings(before, after), {
		hooks: [{ event: "Stop", command: "new-stop" }, { event: "SessionStart", command: "new-start" }],
		keys: ["statusLine"],
	});
});

test("CLI: record, show, diff-settings, forget", () => {
	const dir = cfg();
	const file = join(dir, "in.json");
	writeFileSync(file, JSON.stringify({ wired: true }));
	const run = (...a) => spawnSync("node", [script, "--config", dir, ...a], { encoding: "utf8" });
	assert.equal(run("record", "context-mode", file).status, 0);
	assert.equal(JSON.parse(run("show").stdout).parts["context-mode"].wired, true);
	const b = join(dir, "b.json");
	const c = join(dir, "c.json");
	writeFileSync(b, "{}");
	writeFileSync(c, JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "x" }] }] } }));
	assert.deepEqual(JSON.parse(run("diff-settings", b, c).stdout).hooks, [{ event: "Stop", command: "x" }]);
	assert.equal(run("forget", "context-mode").status, 0);
	assert.deepEqual(JSON.parse(run("show").stdout).parts, {});
	assert.equal(run("bogus").status, 2);
});

test("configStatus reports missing and changed entries", () => {
	const dir = cfg();
	assert.equal(configStatus(dir).recorded, false);
	const file = join(dir, "f.txt");
	writeFileSync(file, "hello");
	writeFileSync(join(dir, "settings.json"), JSON.stringify({ statusLine: { type: "x" }, hooks: {} }));
	record(dir, "config", {
		files: [{ path: file, sha256: "0".repeat(64) }, { path: join(dir, "gone"), sha256: "1" }],
		hooks: [{ event: "Stop", command: "c" }],
		settings: [{ key: "statusLine", value: { type: "y" } }, { key: "env.A", value: "1" }],
	});
	const st = configStatus(dir, dir);
	assert.equal(st.total, 5);
	assert.deepEqual(st.changed.sort(), [file, "statusLine"].sort());
	assert.deepEqual(st.missing.sort(), [join(dir, "gone"), "Stop hook", "env.A"].sort());
});

test("configStatus reads the copilot part from <home>/.copilot", () => {
	const dir = cfg();
	const home = cfg();
	mkdirSync(join(home, ".copilot"));
	writeFileSync(join(home, ".copilot", "settings.json"), JSON.stringify({ includeCoAuthoredBy: true }));
	writeFileSync(join(home, ".copilot", "mcp-config.json"), JSON.stringify({ mcpServers: { context7: { type: "http" } } }));
	assert.equal(configStatus(dir, home, "copilot").recorded, false);
	record(dir, "copilot", {
		settings: [{ key: "includeCoAuthoredBy", value: false }],
		mcp: ["context7", "other"],
	});
	const st = configStatus(dir, home, "copilot");
	assert.equal(st.total, 3);
	assert.deepEqual(st.changed, ["includeCoAuthoredBy"]);
	assert.deepEqual(st.missing, ["mcp other"]);
	assert.equal(configStatus(dir, home).recorded, false);
});

test("forgetting the last part deletes the manifest and its empty folder", () => {
	const dir = cfg();
	record(dir, "trail", { wired: true });
	forget(dir, "trail");
	assert.ok(!existsSync(join(dir, "agentry")));
});
