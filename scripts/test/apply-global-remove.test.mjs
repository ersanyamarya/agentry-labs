import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(repo, "scripts", "apply-global.mjs");
const manifestScript = join(repo, "scripts", "setup-manifest.mjs");
const HOOK = 'sh "$HOME/.claude/helpers/trail-autobuild.sh"';
const rulesInRepo = readdirSync(join(repo, "rules")).filter((n) => n.endsWith(".md") && n !== "README.md");

// A temp home; `cfg` set means CLAUDE_CONFIG_DIR points there, else it is unset.
function sandbox(cfg) {
	const home = mkdtempSync(join(tmpdir(), "apply-rm-"));
	const config = cfg ?? join(home, ".claude");
	const env = { ...process.env };
	delete env.CLAUDE_CONFIG_DIR;
	if (cfg) env.CLAUDE_CONFIG_DIR = cfg;
	const run = (...extra) => spawnSync("node", [script, "--home", home, ...extra], { encoding: "utf8", env });
	const manifest = join(config, "agentry", "install-manifest.json");
	// Install, then record the report into the manifest the way setup.sh does.
	const install = () => {
		const report = join(home, "report.json");
		const r = run("--write", "--report", report);
		assert.equal(r.status, 0, r.stderr);
		const m = spawnSync("node", [manifestScript, "--config", config, "record", "config", report], { encoding: "utf8", env });
		assert.equal(m.status, 0, m.stderr);
	};
	const remove = (...extra) => run("--remove", manifest, ...extra);
	return { home, config, run, install, remove, manifest, settingsPath: join(config, "settings.json"), mcpPath: cfg ? join(cfg, ".claude.json") : join(home, ".claude.json") };
}
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, 2));
};
// Every file under dir except backups, .bak-* copies, the install manifest and the install report.
const files = (dir) =>
	existsSync(dir)
		? readdirSync(dir, { recursive: true })
				.filter((p) => statSync(join(dir, p)).isFile())
				.filter((p) => !/\.bak-/.test(p) && !p.split("/").includes("backups") && !p.split("/").includes("agentry") && p !== "report.json")
				.sort()
		: [];
const backupSets = (config) => {
	const dir = join(config, "backups", "agentry-setup");
	return existsSync(dir) ? readdirSync(dir).map((n) => join(dir, n)) : [];
};

test("removes only listed entries that still match", () => {
	const s = sandbox();
	s.install();
	const settings = read(s.settingsPath);
	settings.env.OTHER = "keep";
	settings.permissions = { allow: ["Bash(ls)"] };
	writeJson(s.settingsPath, settings);
	const config = read(s.mcpPath);
	config.mcpServers.other = { type: "http", url: "https://example.invalid" };
	writeJson(s.mcpPath, config);
	writeFileSync(join(s.config, "rules", "mine.md"), "mine");
	const r = s.remove("--write");
	assert.equal(r.status, 0, r.stderr);
	const after = read(s.settingsPath);
	assert.deepEqual(after, { env: { OTHER: "keep" }, permissions: { allow: ["Bash(ls)"] } });
	assert.deepEqual(read(s.mcpPath), { mcpServers: { other: { type: "http", url: "https://example.invalid" } } });
	assert.ok(existsSync(join(s.config, "rules", "mine.md")));
	for (const name of rulesInRepo) assert.ok(!existsSync(join(s.config, "rules", name)), name);
	assert.ok(!existsSync(join(s.config, "helpers", "trail-autobuild.sh")));
	assert.doesNotMatch(r.stdout, /"trail"|CONTEXT7_API_KEY/);
});

test("a hand-added hook survives", () => {
	const s = sandbox();
	s.install();
	const settings = read(s.settingsPath);
	settings.hooks.SessionStart.push({ hooks: [{ type: "command", command: "echo mine" }] });
	settings.hooks.SessionStart[0].hooks.push({ type: "command", command: "echo also-mine" });
	writeJson(s.settingsPath, settings);
	s.remove("--write");
	assert.deepEqual(read(s.settingsPath).hooks, {
		SessionStart: [{ hooks: [{ type: "command", command: "echo also-mine" }] }, { hooks: [{ type: "command", command: "echo mine" }] }],
	});
});

test("a hand-edited rule file survives and is reported", () => {
	const s = sandbox();
	s.install();
	const rule = join(s.config, "rules", rulesInRepo[0]);
	writeFileSync(rule, "edited");
	const r = s.remove("--write");
	assert.equal(readFileSync(rule, "utf8"), "edited");
	assert.ok(r.stdout.includes(`kept: ${rule} was edited`), r.stdout);
});

test("a changed statusLine survives and is reported", () => {
	const s = sandbox();
	s.install();
	const settings = read(s.settingsPath);
	settings.statusLine = { type: "command", command: "mine" };
	writeJson(s.settingsPath, settings);
	const r = s.remove("--write");
	assert.deepEqual(read(s.settingsPath).statusLine, { type: "command", command: "mine" });
	assert.ok(!("subagentStatusLine" in read(s.settingsPath)));
	assert.match(r.stdout, /kept: statusLine changed since install/);
});

test("a changed MCP entry survives", () => {
	const s = sandbox();
	s.install();
	const config = read(s.mcpPath);
	config.mcpServers.context7.headers.CONTEXT7_API_KEY = "literal-secret";
	writeJson(s.mcpPath, config);
	const r = s.remove("--write");
	assert.equal(read(s.mcpPath).mcpServers.context7.headers.CONTEXT7_API_KEY, "literal-secret");
	assert.match(r.stdout, /kept: MCP server context7 changed since install/);
	assert.doesNotMatch(r.stdout, /literal-secret/);
});

test("a dry run writes nothing and creates no backup", () => {
	const s = sandbox();
	s.install();
	const before = files(s.home).map((p) => [p, readFileSync(join(s.home, p), "utf8")]);
	const r = s.remove();
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /Dry run\. Re-run with --write to apply\./);
	assert.deepEqual(files(s.home).map((p) => [p, readFileSync(join(s.home, p), "utf8")]), before);
	assert.ok(!existsSync(join(s.config, "backups")));
});

test("a backup set holds the touched files before the write", () => {
	const s = sandbox();
	s.install();
	const settingsBefore = readFileSync(s.settingsPath, "utf8");
	const mcpBefore = readFileSync(s.mcpPath, "utf8");
	const helper = join(s.config, "helpers", "trail-autobuild.sh");
	const helperBefore = readFileSync(helper, "utf8");
	s.remove("--write");
	const sets = backupSets(s.config);
	assert.equal(sets.length, 1);
	const m = read(join(sets[0], "manifest.json"));
	assert.equal(m.version, 1);
	assert.equal(m.tool, "agentry-labs-setup");
	assert.equal(m.status, "applied");
	const byPath = Object.fromEntries(m.files.map((f) => [f.path, f]));
	for (const [path, content] of [[s.settingsPath, settingsBefore], [s.mcpPath, mcpBefore], [helper, helperBefore]]) {
		const entry = byPath[path];
		assert.ok(entry, path);
		assert.equal(entry.kind, "file");
		assert.equal(entry.backup, join(sets[0], "files", path.slice(1)));
		assert.equal(readFileSync(entry.backup, "utf8"), content);
		assert.match(entry.sha256, /^[0-9a-f]{64}$/);
	}
});

test("a second remove reports nothing to remove", () => {
	const s = sandbox();
	s.install();
	s.remove("--write");
	const r = s.remove("--write");
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /Nothing to remove\./);
	assert.match(r.stdout, /already gone/);
	assert.equal(backupSets(s.config).length, 1);
});

test("CLAUDE_CONFIG_DIR keeps everything inside it", () => {
	const cfg = mkdtempSync(join(tmpdir(), "apply-rm-cfg-"));
	const s = sandbox(cfg);
	s.install();
	const r = s.remove("--write");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(readdirSync(s.home), ["report.json"]);
	assert.deepEqual(readdirSync(cfg).sort(), ["agentry", "backups"]);
	assert.equal(backupSets(cfg).length, 1);
	assert.ok(backupSets(cfg)[0].startsWith(cfg));
});

test("a missing manifest or one without a config part exits 2", () => {
	const s = sandbox();
	assert.equal(s.remove().status, 2);
	writeJson(s.manifest, { version: 1, parts: { trail: {} } });
	const r = s.remove("--write");
	assert.equal(r.status, 2);
	assert.match(r.stderr, /usage/);
	assert.equal(s.run("--remove").status, 2);
});

test("round trip from an empty home leaves no file or folder behind", () => {
	const s = sandbox();
	s.install();
	const r = s.remove("--write");
	assert.equal(r.status, 0, r.stderr);
	const left = readdirSync(s.home, { recursive: true }).filter((p) => !/\.bak-/.test(p) && !/^\.claude\/(agentry|backups)(\/|$)/.test(p) && p !== "report.json");
	assert.deepEqual(left, [".claude"]);
});

test("round trip: install, record, remove returns the home to its pre-install state", () => {
	const s = sandbox();
	const preSettings = { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }] }, env: { MINE: "1" }, model: "opus" };
	const preConfig = { numStartups: 3, mcpServers: { local: { command: "x" } } };
	writeJson(s.settingsPath, preSettings);
	writeJson(s.mcpPath, preConfig);
	writeFileSync(join(s.home, "notes.txt"), "hi");
	const before = files(s.home);
	s.install();
	const r = s.remove("--write");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(read(s.settingsPath), preSettings);
	assert.deepEqual(read(s.mcpPath), preConfig);
	assert.deepEqual(files(s.home), before);
	assert.equal(relative(s.home, s.config), ".claude");
});
