import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(repo, "scripts", "apply-global.mjs");
const HOOK = 'sh "$HOME/.claude/helpers/trail-autobuild.sh"';

function sandbox() {
	const home = mkdtempSync(join(tmpdir(), "apply-"));
	const env = { ...process.env };
	delete env.CLAUDE_CONFIG_DIR;
	const run = (...extra) => {
		const r = spawnSync("node", [script, "--home", home, ...extra], { encoding: "utf8", env: { ...env, ...(run.env ?? {}) } });
		return r;
	};
	return { home, run };
}
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const tree = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).sort().join(",") : "");
const rulesInRepo = readdirSync(join(repo, "rules")).filter((n) => n.endsWith(".md") && n !== "README.md");

test("first run into an empty home adds everything", () => {
	const { home, run } = sandbox();
	const r = run("--write");
	assert.equal(r.status, 0, r.stderr);
	const settings = read(join(home, ".claude/settings.json"));
	assert.equal(settings.hooks.SessionStart[0].hooks[0].command, HOOK);
	assert.equal(settings.statusLine.type, "command");
	assert.equal(settings.subagentStatusLine.type, "command");
	assert.equal(settings.env.TRAIL_INVOKED_AS, "trail");
	assert.deepEqual(settings.attribution, { commit: "", pr: "", sessionUrl: false });
	assert.ok(read(join(home, ".claude.json")).mcpServers.context7);
	const helper = join(home, ".claude/helpers/trail-autobuild.sh");
	assert.equal(statSync(helper).mode & 0o777, 0o755);
	for (const name of rulesInRepo) assert.ok(existsSync(join(home, ".claude/rules", name)), name);
	assert.ok(!existsSync(join(home, ".claude/rules/README.md")));
});

test("second run prints Nothing to add and changes no byte", () => {
	const { home, run } = sandbox();
	run("--write");
	const before = tree(join(home, ".claude"));
	const settingsBefore = readFileSync(join(home, ".claude/settings.json"), "utf8");
	const r = run("--write");
	assert.match(r.stdout, /Nothing to add\./);
	assert.equal(readFileSync(join(home, ".claude/settings.json"), "utf8"), settingsBefore);
	assert.equal(tree(join(home, ".claude")), before);
});

test("the author's existing SessionStart entry is not duplicated", () => {
	const { home, run } = sandbox();
	mkdirSync(join(home, ".claude"), { recursive: true });
	writeFileSync(join(home, ".claude/settings.json"), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: HOOK }] }] } }));
	run("--write");
	const settings = read(join(home, ".claude/settings.json"));
	assert.equal(settings.hooks.SessionStart.length, 1);
});

test("a different statusLine is left as is", () => {
	const { home, run } = sandbox();
	mkdirSync(join(home, ".claude"), { recursive: true });
	writeFileSync(join(home, ".claude/settings.json"), JSON.stringify({ statusLine: { type: "command", command: "mine" } }));
	run("--write");
	assert.equal(read(join(home, ".claude/settings.json")).statusLine.command, "mine");
});

test("a changed helper or rule is replaced and a backup kept", () => {
	const { home, run } = sandbox();
	run("--write");
	const helper = join(home, ".claude/helpers/trail-autobuild.sh");
	const rule = join(home, ".claude/rules", rulesInRepo[0]);
	writeFileSync(helper, "changed");
	writeFileSync(rule, "changed");
	const r = run("--write");
	assert.match(r.stdout, /update \(backup kept\)/);
	assert.notEqual(readFileSync(helper, "utf8"), "changed");
	const names = readdirSync(join(home, ".claude/helpers"));
	assert.ok(names.some((n) => n.startsWith("trail-autobuild.sh.bak-")));
	assert.ok(readdirSync(join(home, ".claude/rules")).some((n) => n.includes(".bak-")));
});

test("CLAUDE_CONFIG_DIR keeps everything inside it", () => {
	const { home, run } = sandbox();
	const cfg = mkdtempSync(join(tmpdir(), "apply-cfg-"));
	run.env = { CLAUDE_CONFIG_DIR: cfg };
	const r = run("--write");
	assert.equal(r.status, 0, r.stderr);
	assert.ok(existsSync(join(cfg, "settings.json")));
	assert.ok(existsSync(join(cfg, ".claude.json")));
	assert.ok(existsSync(join(cfg, "helpers/trail-autobuild.sh")));
	assert.equal(tree(home), "");
});

test("--report lists exactly what was added", () => {
	const { home, run } = sandbox();
	const reportFile = join(home, "report.json");
	run("--write", "--report", reportFile);
	const report = read(reportFile);
	assert.deepEqual(report.hooks, [{ event: "SessionStart", command: HOOK }]);
	assert.deepEqual(report.settings.map((s) => s.key).sort(), ["attribution", "env.TRAIL_INVOKED_AS", "statusLine", "subagentStatusLine"]);
	assert.deepEqual(report.mcp, ["context7"]);
	assert.ok(report.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
	assert.ok(report.files.some((f) => f.path.endsWith("helpers/trail-autobuild.sh")));
	run("--write", "--report", reportFile);
	const again = read(reportFile);
	assert.deepEqual([again.hooks, again.settings, again.mcp, again.files], [[], [], [], []]);
});

test("a dry run writes nothing", () => {
	const { home, run } = sandbox();
	const r = run();
	assert.match(r.stdout, /Dry run/);
	assert.equal(tree(home), "");
});
