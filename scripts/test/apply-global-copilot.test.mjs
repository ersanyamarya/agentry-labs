import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(repo, "scripts", "apply-global.mjs");
const manifestScript = join(repo, "scripts", "setup-manifest.mjs");
const rulesInRepo = readdirSync(join(repo, "rules")).filter((n) => n.endsWith(".md") && n !== "README.md");
const OLD_CONTEXT7 = { type: "local", command: "bunx", args: ["--bun", "-y", "@upstash/context7-mcp@latest"], tools: ["*"] };

// A temp home with a .copilot dir. COPILOT_HOME is cleared so the run is hermetic.
function sandbox({ copilot = true } = {}) {
	const home = mkdtempSync(join(tmpdir(), "apply-cop-"));
	const ch = join(home, ".copilot");
	if (copilot) mkdirSync(ch);
	const env = { ...process.env };
	delete env.COPILOT_HOME;
	delete env.CLAUDE_CONFIG_DIR;
	const run = (...extra) => spawnSync("node", [script, "--home", home, ...extra], { encoding: "utf8", env });
	const config = join(home, ".claude");
	const manifest = join(config, "agentry", "install-manifest.json");
	const install = () => {
		const report = join(home, "report.json");
		const r = run("--copilot", "--write", "--report", report);
		assert.equal(r.status, 0, r.stderr);
		const m = spawnSync("node", [manifestScript, "--config", config, "record", "copilot", report], { encoding: "utf8", env });
		assert.equal(m.status, 0, m.stderr);
		return JSON.parse(readFileSync(report, "utf8"));
	};
	const remove = (...extra) => run("--remove", manifest, "--part", "copilot", ...extra);
	return { home, ch, run, install, remove, config, settings: join(ch, "settings.json"), mcp: join(ch, "mcp-config.json") };
}
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, 2));
};
const listBackups = (dir) => (existsSync(dir) ? readdirSync(dir) : []);

test("copilot dir absent: says so and writes nothing", () => {
	const s = sandbox({ copilot: false });
	const r = s.run("--copilot", "--write");
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /Copilot not found/);
	assert.ok(!existsSync(s.ch));
});

test("preview writes nothing", () => {
	const s = sandbox();
	const r = s.run("--copilot");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(readdirSync(s.ch), []);
});

test("--write adds each item, and a second run says Nothing to add.", () => {
	const s = sandbox();
	const report = s.install();
	assert.equal(read(s.settings).includeCoAuthoredBy, false);
	const ctx = read(s.mcp).mcpServers.context7;
	assert.equal(ctx.type, "http");
	assert.equal(ctx.headers.CONTEXT7_API_KEY, "${CONTEXT7_API_KEY}");
	assert.equal(readFileSync(join(s.ch, "hooks", "trail-autobuild.json"), "utf8"), readFileSync(join(repo, "global", "copilot", "hooks", "trail-autobuild.json"), "utf8"));
	for (const rule of rulesInRepo) {
		const f = join(s.ch, "instructions", rule.replace(/\.md$/, ".instructions.md"));
		assert.match(readFileSync(f, "utf8"), /^---\napplyTo: "\*\*"\ndescription: /);
	}
	assert.deepEqual(report.mcp, ["context7"]);
	assert.deepEqual(report.settings, [{ key: "includeCoAuthoredBy", value: false }]);
	assert.equal(report.files.length, 1 + rulesInRepo.length);
	assert.match(s.run("--copilot").stdout, /Nothing to add\./);
});

test("an unedited local bunx context7 entry is replaced after a backup", () => {
	const s = sandbox();
	writeJson(s.mcp, { mcpServers: { context7: OLD_CONTEXT7 } });
	const r = s.run("--copilot", "--write");
	assert.equal(r.status, 0, r.stderr);
	assert.equal(read(s.mcp).mcpServers.context7.type, "http");
	assert.ok(readdirSync(s.ch).some((n) => n.startsWith("mcp-config.json.bak-")));
});

test("an edited context7 entry is left as is with a warning that names it and never prints the key", () => {
	const s = sandbox();
	const edited = { ...OLD_CONTEXT7, args: ["-y", "@upstash/context7-mcp", "--api-key", "ctx7sk-LITERAL-SECRET-1234"] };
	writeJson(s.mcp, { mcpServers: { context7: edited } });
	const r = s.run("--copilot", "--write");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(read(s.mcp).mcpServers.context7, edited);
	assert.match(r.stdout, /context7/);
	assert.doesNotMatch(r.stdout + r.stderr, /LITERAL-SECRET/);
});

test("present includeCoAuthoredBy and an http context7 entry are left as is", () => {
	const s = sandbox();
	writeJson(s.settings, { includeCoAuthoredBy: true, other: 1 });
	const http = { type: "http", url: "https://example.test/mcp", headers: { K: "ctx7sk-ANOTHER-SECRET-9876" }, tools: ["*"] };
	writeJson(s.mcp, { mcpServers: { context7: http } });
	const r = s.run("--copilot", "--write");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(read(s.settings), { includeCoAuthoredBy: true, other: 1 });
	assert.deepEqual(read(s.mcp).mcpServers.context7, http);
	assert.doesNotMatch(r.stdout + r.stderr, /ANOTHER-SECRET/);
});

test("remove deletes unchanged items, keeps edited ones, backs up first", () => {
	const s = sandbox();
	s.install();
	const rule = join(s.ch, "instructions", rulesInRepo[0].replace(/\.md$/, ".instructions.md"));
	writeFileSync(rule, `${readFileSync(rule, "utf8")}\nmy edit\n`);
	const r = s.remove("--write");
	assert.equal(r.status, 0, r.stderr);
	assert.ok(existsSync(rule), "edited file kept");
	assert.ok(!existsSync(join(s.ch, "hooks", "trail-autobuild.json")));
	assert.equal(read(s.settings).includeCoAuthoredBy, undefined);
	assert.equal(read(s.mcp).mcpServers?.context7, undefined);
	assert.ok(listBackups(join(s.config, "backups", "agentry-setup")).length > 0);
});

test("remove keeps a settings key the user changed, and previews without --write", () => {
	const s = sandbox();
	s.install();
	writeJson(s.settings, { includeCoAuthoredBy: true });
	const preview = s.remove();
	assert.equal(preview.status, 0, preview.stderr);
	assert.ok(existsSync(join(s.ch, "hooks", "trail-autobuild.json")), "preview removes nothing");
	s.remove("--write");
	assert.equal(read(s.settings).includeCoAuthoredBy, true);
});

test("an unknown part is refused, and the default part is config, not copilot", () => {
	const s = sandbox();
	s.install();
	const manifest = join(s.config, "agentry", "install-manifest.json");
	assert.equal(s.run("--remove", manifest, "--part", "bogus").status, 2);
	const cfgRun = s.run("--remove", manifest);
	assert.equal(cfgRun.status, 2);
	assert.match(cfgRun.stderr, /no config part/);
	assert.ok(existsSync(join(s.ch, "hooks", "trail-autobuild.json")), "default part leaves copilot files");
});

// ---- trusted folders ----
const JSONC = '// User settings belong in settings.json.\n// This file is managed automatically.\n{\n  "firstLaunchAt": "2026-01-01", // keep\n  "host": "https://github.com",\n  "loggedInUsers": [{ "login": "x" }]\n}\n';
const trustFile = (s, ...dirs) => {
	const f = join(s.home, "trust.txt");
	writeFileSync(f, `${dirs.join("\n")}\n`);
	return f;
};

test("trust: JSONC config.json keeps every byte outside the added key", () => {
	const s = sandbox();
	const cfg = join(s.ch, "config.json");
	writeFileSync(cfg, JSONC);
	const dir = join(s.home, "my repo");
	const r = s.run("--copilot", "--write", "--trust-file", trustFile(s, dir));
	assert.equal(r.status, 0, r.stderr);
	const after = readFileSync(cfg, "utf8");
	assert.ok(after.startsWith("// User settings belong in settings.json.\n// This file is managed automatically.\n{\n"));
	assert.match(after, /\/\/ keep/);
	assert.match(after, /"loggedInUsers": \[\{ "login": "x" \}\]/);
	const stripped = after.replace(/^\/\/.*$/gm, "").replace(/ \/\/ keep/, "");
	assert.deepEqual(JSON.parse(stripped).trustedFolders, [dir]);
	assert.ok(listBackups(join(s.config, "backups", "agentry-setup")).length > 0 || readdirSync(s.ch).some((n) => n.startsWith("config.json.bak-")));
});

test("trust: an existing entry is not duplicated, and a second run says Nothing to add.", () => {
	const s = sandbox();
	writeFileSync(join(s.ch, "config.json"), JSONC.replace('"host"', '"trustedFolders": ["/already"],\n  "host"'));
	const f = trustFile(s, "/already", "/new one");
	assert.equal(s.run("--copilot", "--write", "--trust-file", f).status, 0);
	const text = readFileSync(join(s.ch, "config.json"), "utf8");
	assert.equal(text.split('"/already"').length - 1, 1);
	assert.match(text, /"\/new one"/);
	assert.match(s.run("--copilot", "--trust-file", f).stdout, /Nothing to add\./);
});

test("trust: preview writes nothing; unparseable and missing config.json are handled", () => {
	const s = sandbox();
	const cfg = join(s.ch, "config.json");
	writeFileSync(cfg, JSONC);
	s.run("--copilot", "--trust-file", trustFile(s, "/a"));
	assert.equal(readFileSync(cfg, "utf8"), JSONC);
	writeFileSync(cfg, "{ not json");
	const bad = s.run("--copilot", "--write", "--trust-file", trustFile(s, "/a"));
	assert.notEqual(bad.status, 0);
	assert.equal(readFileSync(cfg, "utf8"), "{ not json");
	const none = sandbox();
	const r = none.run("--copilot", "--write", "--trust-file", trustFile(none, "/a"));
	assert.equal(r.status, 0, r.stderr);
	assert.ok(!existsSync(join(none.ch, "config.json")));
});

test("trust: remove deletes only recorded folders still present, restoring the file", () => {
	const s = sandbox();
	const cfg = join(s.ch, "config.json");
	writeFileSync(cfg, JSONC.replace('"host"', '"trustedFolders": ["/mine-before"],\n  "host"'));
	const before = readFileSync(cfg, "utf8");
	const report = join(s.home, "report.json");
	assert.equal(s.run("--copilot", "--write", "--trust-file", trustFile(s, "/one", "/two"), "--report", report).status, 0);
	assert.deepEqual(JSON.parse(readFileSync(report, "utf8")).trustedFolders, ["/one", "/two"]);
	spawnSync("node", [manifestScript, "--config", s.config, "record", "copilot", report], { encoding: "utf8" });
	// the user removes /two themselves
	writeFileSync(cfg, readFileSync(cfg, "utf8").replace(/,?\s*"\/two"/, ""));
	const r = s.remove("--write");
	assert.equal(r.status, 0, r.stderr);
	const after = readFileSync(cfg, "utf8");
	assert.match(after, /\/mine-before/);
	assert.doesNotMatch(after, /"\/one"/);
	assert.match(after, /\/\/ User settings belong/);
	assert.notEqual(before, "");
});

test("trust: relative lines are refused and COPILOT_ALLOW_ALL is never written", () => {
	const s = sandbox();
	writeFileSync(join(s.ch, "config.json"), JSONC);
	assert.notEqual(s.run("--copilot", "--write", "--trust-file", trustFile(s, "relative/dir")).status, 0);
	assert.doesNotMatch(readFileSync(join(s.ch, "config.json"), "utf8"), /ALLOW_ALL/);
});
