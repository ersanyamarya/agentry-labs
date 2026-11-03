import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createDoctor } from "../lib/doctor.mjs";
import { createFix } from "../lib/fix.mjs";
import { createFixes } from "../lib/fix-rules.mjs";
import { createFixUndo } from "../lib/fix-undo.mjs";
import { createPaths } from "../lib/paths.mjs";

// Layout: <root>/home/.claude (config), <root>/home/ws/repo (git repo), <root>/bin (PATH with a fake `trail`). Never the real home.
let root;
let home;
let configDir;
let repo;
let bin;
let paths;
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-fixrules-")));
	assert.ok(!root.startsWith(realpathSync(homedir())), "TMPDIR must be outside the home directory");
	home = join(root, "home");
	configDir = join(home, ".claude");
	repo = join(home, "ws", "repo");
	bin = join(root, "bin");
	mkdirSync(repo, { recursive: true });
	mkdirSync(bin);
	execFileSync("git", ["init", "-q"], { cwd: repo });
	for (const name of ["trail", "tool"]) {
		writeFileSync(join(bin, name), "#!/bin/sh\n");
		chmodSync(join(bin, name), 0o755);
	}
	paths = createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir } });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const put = (file, text) => {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
};
const json = (value) => `${JSON.stringify(value, null, "\t")}\n`;
const settings = () => join(configDir, "settings.json");
const dotClaudeJson = () => join(configDir, ".claude.json");
const mcpJson = () => join(repo, ".mcp.json");

const setup = ({ runCommand, renames = { graft: "trail" } } = {}) => {
	const lines = [];
	const ran = [];
	const fix = createFix(paths, {
		out: (line) => lines.push(line),
		err: (line) => lines.push(line),
		fixes: createFixes({ renames, env: { PATH: bin } }),
		doctor: () => createDoctor(paths, { out: () => {}, err: () => {}, platform: "linux", env: { PATH: bin }, launchctlGetenv: () => "", renames }),
		isTTY: () => false,
		runCommand:
			runCommand ??
			((argv, options) => {
				ran.push({ argv, cwd: options.cwd });
				return { status: 0, stdout: "", stderr: "" };
			}),
		now: () => new Date("2026-11-03T10:20:30.456Z"),
	});
	return { fix, lines, ran, output: () => lines.join("\n") };
};
const undo = async () => {
	const lines = [];
	const code = await createFixUndo(paths, { out: (line) => lines.push(line), err: (line) => lines.push(line) }).run({ yes: true });
	return { code, output: lines.join("\n") };
};
const dirTree = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).sort() : []);

describe("stale-name", () => {
	test("swaps a permission, a command found on PATH and a matcher; formatting and other bytes untouched", async () => {
		const original = '{\n\t"permissions": {\n\t\t"allow": [\n\t\t\t"Bash(graft ask:*)",\n\t\t\t"Read"\n\t\t]\n\t},\n\t"hooks": {\n\t\t"PreToolUse": [\n\t\t\t{\n\t\t\t\t"matcher": "Bash|mcp__graft__|mcp__trail__",\n\t\t\t\t"hooks": [{ "type": "command", "command": "graft hook pre" }]\n\t\t\t}\n\t\t]\n\t},\n\t"keep": "é  graft-less"\n}\n';
		put(settings(), original);
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		const expected = original.replace("Bash(graft ask:*)", "Bash(trail ask:*)").replace("Bash|mcp__graft__|mcp__trail__", "Bash|mcp__trail__").replace('"graft hook pre"', '"trail hook pre"');
		assert.equal(readFileSync(settings(), "utf8"), expected);
		assert.match(output(), /verify \[stale-name\].*: gone/);
	});

	test("graft-hooks.cjs stays: the swapped path would not exist, so the finding gets no fix and the reason is shown", async () => {
		const helper = join(configDir, "helpers", "graft-hooks.cjs");
		put(helper, "// hook\n");
		const original = json({ hooks: { Stop: [{ hooks: [{ type: "command", command: `node "${helper}" stop || exit 0` }] }] }, statusLine: { type: "command", command: `node ${helper}` } });
		put(settings(), original);
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		assert.equal(readFileSync(settings(), "utf8"), original);
		assert.match(output(), /\[stale-name\] Stop hook still uses the old name "graft" \(now "trail"\)\n\s+no fix: .*trail-hooks\.cjs does not exist/);
		assert.match(output(), /statusLine command still uses.*\n\s+no fix: /);
		assert.deepEqual(dirTree(paths.backupsDir), [], "nothing to back up when nothing changes");
	});

	test("the same command is swapped once the new file exists", async () => {
		const helper = join(configDir, "helpers", "graft-hooks.cjs");
		put(helper, "// old\n");
		put(join(configDir, "helpers", "trail-hooks.cjs"), "// new\n");
		const original = json({ hooks: { Stop: [{ hooks: [{ type: "command", command: `node "${helper}" stop` }] }] } });
		put(settings(), original);
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		assert.equal(readFileSync(settings(), "utf8"), original.replace("graft-hooks.cjs", "trail-hooks.cjs"));
	});

	test("a bare argument or a command missing from PATH is not swapped", async () => {
		const original = json({ hooks: { Stop: [{ hooks: [{ type: "command", command: "npx graft-mcp --stop" }] }] }, statusLine: { type: "command", command: "echo graft" } });
		put(settings(), original);
		const { fix, output } = setup();
		await fix.run({ path: repo, yes: true });
		assert.equal(readFileSync(settings(), "utf8"), original);
		assert.match(output(), /no fix: .*cannot be checked/);
		assert.match(output(), /no fix: .*cannot be checked|not on PATH/);
	});

	test("an MCP server named by an old key is left alone", async () => {
		const original = json({ mcpServers: { graft: { command: process.execPath, args: ["-e", "0"] } } });
		put(mcpJson(), original);
		put(settings(), json({ enabledMcpjsonServers: ["graft"] }));
		const { fix, output } = setup();
		await fix.run({ path: repo, yes: true });
		assert.equal(readFileSync(mcpJson(), "utf8"), original);
		assert.match(output(), /no fix: .*name is a key/);
	});
});

describe("MCP entries", () => {
	const server = { command: process.execPath, args: ["-e", "0"] };

	test("dup-mcp-scope: identical entries → the repo's entry goes, the shared user entry stays, siblings are byte-identical", async () => {
		const original = `{\n\t"mcpServers": {\n\t\t"keep": { "command": "tool" },\n\t\t"shared": ${JSON.stringify(server)},\n\t\t"also": { "command": "tool" }\n\t}\n}\n`;
		put(mcpJson(), original);
		put(dotClaudeJson(), json({ mcpServers: { shared: server } }));
		put(settings(), json({ enabledMcpjsonServers: ["shared", "keep", "also"] }));
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		assert.equal(readFileSync(mcpJson(), "utf8"), original.replace(`\t\t"shared": ${JSON.stringify(server)},\n`, ""));
		assert.deepEqual(JSON.parse(readFileSync(dotClaudeJson(), "utf8")), { mcpServers: { shared: server } });
	});

	test("dup-mcp-scope: differing entries are not touched", async () => {
		const original = json({ mcpServers: { shared: { ...server, args: ["-e", "1"] } } });
		put(mcpJson(), original);
		put(dotClaudeJson(), json({ mcpServers: { shared: server } }));
		put(settings(), json({ enabledMcpjsonServers: ["shared"] }));
		const { fix, output } = setup();
		await fix.run({ path: repo, yes: true });
		assert.equal(readFileSync(mcpJson(), "utf8"), original);
		assert.match(output(), /no fix: the project and user entries differ/);
	});

	test("missing-mcp-command: removes only that server", async () => {
		const original = `{\n  "mcpServers": {\n    "ok": { "command": "tool" },\n    "gone": { "command": "/no/such/command", "env": { "TOKEN": "s3cret-value" } }\n  }\n}\n`;
		put(mcpJson(), original);
		put(settings(), json({ enableAllProjectMcpServers: true }));
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
		assert.doesNotMatch(output(), /s3cret-value/, "secrets never reach the preview");
		assert.equal(readFileSync(mcpJson(), "utf8"), original);
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		assert.equal(readFileSync(mcpJson(), "utf8"), '{\n  "mcpServers": {\n    "ok": { "command": "tool" }\n  }\n}\n');
	});

	test("an unparsable file is refused, not rewritten", () => {
		const fixes = createFixes({ renames: { graft: "trail" }, env: { PATH: bin } });
		put(settings(), '{ "permissions": { "allow": ["Bash(graft x)",] } }');
		const finding = { id: "stale-name", file: settings(), message: 'Permission allow entry "Bash(graft x)" still uses the old name "graft" (now "trail")' };
		assert.match(fixes["stale-name"](finding, { paths, cwd: repo, project: { root: repo } }).unfixable, /not valid JSON/);
		put(mcpJson(), '{"mcpServers": {"a": {"command": "/no/cmd"},}}');
		const second = fixes["missing-mcp-command"]({ id: "missing-mcp-command", file: mcpJson(), message: 'MCP server "a" runs "/no/cmd", which is not on PATH or does not exist' }, { paths, cwd: repo });
		assert.match(second.unfixable, /not valid JSON/);
		// A file that went bad after planning: apply throws a typed error that carries no file content.
		const removal = fixes["dup-mcp-plugin"]({ id: "dup-mcp-plugin", file: mcpJson(), message: 'MCP server "a" (project) duplicates the server of enabled plugin p@m' }, { paths, cwd: repo });
		assert.throws(() => removal.apply('{"mcpServers": {"a": {},}}'), (error) => error.code === "EJSONPARSE" && !error.message.includes("mcpServers"));
	});
});

describe("links, skills and plugins", () => {
	test("broken-skill-link: prune, then undo recreates the link", async () => {
		const link = join(configDir, "skills", "ghost");
		mkdirSync(dirname(link), { recursive: true });
		symlinkSync(join(root, "nowhere"), link);
		const { fix, output } = setup({ runCommand: (argv, { cwd }) => {
			execFileSync(argv[0], argv.slice(1), { cwd });
			return { status: 0, stdout: "", stderr: "" };
		} });
		assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
		assert.match(output(), /Remove the broken skill link "ghost"/);
		assert.ok(lstatSync(link).isSymbolicLink());
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		assert.equal(existsSync(link) || (() => { try { lstatSync(link); return true; } catch { return false; } })(), false);
		assert.equal((await undo()).code, 0);
		assert.equal(readlinkSync(link), join(root, "nowhere"));
	});

	test("shelf-duplicate: removes the global copy, undo restores the folder byte for byte", async () => {
		const body = "---\nname: dupe\ndescription: x\n---\nbody\n";
		put(join(configDir, "skills", "dupe", "SKILL.md"), body);
		put(join(configDir, "skills", "dupe", "notes", "a.txt"), "a\n");
		put(join(configDir, "skill-shelf", "misc", "dupe", "SKILL.md"), body);
		put(join(configDir, "skill-shelf", "misc", "dupe", "notes", "a.txt"), "a\n");
		const { fix, output } = setup({ runCommand: (argv, { cwd }) => {
			execFileSync(argv[0], argv.slice(1), { cwd });
			return { status: 0, stdout: "", stderr: "" };
		} });
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		assert.equal(existsSync(join(configDir, "skills", "dupe")), false);
		assert.equal(existsSync(join(configDir, "skill-shelf", "misc", "dupe", "SKILL.md")), true);
		assert.equal((await undo()).code, 0);
		assert.equal(readFileSync(join(configDir, "skills", "dupe", "SKILL.md"), "utf8"), body);
		assert.equal(readFileSync(join(configDir, "skills", "dupe", "notes", "a.txt"), "utf8"), "a\n");
	});

	test("dup-plugin-scope: one uninstall command per extra install, run from the project folder", async () => {
		const dir = join(configDir, "plugins", "cache", "mk", "tools", "1.0.0");
		mkdirSync(dir, { recursive: true });
		const file = join(configDir, "plugins", "installed_plugins.json");
		const both = json({ version: 2, plugins: { "tools@mk": [{ scope: "user", installPath: dir }, { scope: "local", projectPath: repo, installPath: dir }] } });
		put(file, both);
		const { fix, output, ran } = setup({
			runCommand: (argv, { cwd }) => {
				ran.push({ argv, cwd });
				writeFileSync(file, json({ version: 2, plugins: { "tools@mk": [{ scope: "user", installPath: dir }] } }));
				return { status: 0, stdout: "", stderr: "" };
			},
		});
		assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
		assert.match(output(), /run: claude plugin uninstall tools@mk --scope local/);
		assert.deepEqual(ran, []);
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		assert.deepEqual(ran, [{ argv: ["claude", "plugin", "uninstall", "tools@mk", "--scope", "local"], cwd: repo }]);
		assert.match(output(), /verify \[dup-plugin-scope\].*gone/);
		assert.equal((await undo()).code, 0);
		assert.equal(readFileSync(file, "utf8"), both, "the plugin list is restored byte for byte");
	});
});

describe("backup and undo through a real fix", () => {
	test("--yes writes a backup set; undo returns every file to its original bytes", async () => {
		const original = '{\n\t"permissions": {\n\t\t"allow": ["Bash(graft ask:*)"]\n\t}\n}\n';
		put(settings(), original);
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
		assert.notEqual(readFileSync(settings(), "utf8"), original);
		const [set] = readdirSync(paths.backupsDir);
		const manifest = JSON.parse(readFileSync(join(paths.backupsDir, set, "manifest.json"), "utf8"));
		assert.equal(manifest.status, "done");
		assert.deepEqual(manifest.files[0].ruleIds, ["stale-name"]);
		assert.equal((await undo()).code, 0);
		assert.equal(readFileSync(settings(), "utf8"), original);
	});

	test("--dry-run prints the diff and writes nothing", async () => {
		const original = '{\n\t"permissions": {\n\t\t"allow": ["Bash(graft ask:*)"]\n\t}\n}\n';
		put(settings(), original);
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
		assert.match(output(), /-\t\t"allow": \["Bash\(graft ask:\*\)"\]\n\+\t\t"allow": \["Bash\(trail ask:\*\)"\]/);
		assert.match(output(), /Dry run: nothing written/);
		assert.equal(readFileSync(settings(), "utf8"), original);
		assert.deepEqual(dirTree(paths.backupsDir), []);
	});

	test("a file git tracks is marked in the preview", async () => {
		put(mcpJson(), json({ mcpServers: { gone: { command: "/no/such/command" } } }));
		put(settings(), json({ enableAllProjectMcpServers: true }));
		execFileSync("git", ["add", ".mcp.json"], { cwd: repo });
		const { fix, output } = setup();
		await fix.run({ path: repo, dryRun: true });
		assert.match(output(), /\.mcp\.json is tracked in git/);
	});
});
