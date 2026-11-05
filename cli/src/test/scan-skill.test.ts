// @ts-nocheck
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createBackups } from "../lib/backups.js";
import { createPaths } from "../lib/paths.js";
import { createScan } from "../lib/scan.js";
import { createFixture } from "./helpers/fixture.js";

// ws/{tracked,loose,link,none} are repos; the first three have .claude/skills/old, `tracked` has it committed.
let root;
let ws;
let paths;
let lines;
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-findskill-")));
	assert.ok(!root.startsWith(realpathSync(homedir())), "TMPDIR must be outside the home directory");
	ws = join(root, "home/ws");
	paths = createPaths({ env: { AGENTRY_HOME: join(root, "home"), CLAUDE_CONFIG_DIR: join(root, "home/.claude") } });
	for (const name of ["tracked", "loose", "link", "none"]) {
		mkdirSync(join(ws, name), { recursive: true });
		execFileSync("git", ["init", "-q"], { cwd: join(ws, name) });
	}
	const put = (file) => {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, "x");
	};
	put(join(ws, "tracked/.claude/skills/old/SKILL.md"));
	execFileSync("git", ["add", "-A"], { cwd: join(ws, "tracked") });
	put(join(ws, "loose/.claude/skills/old/SKILL.md"));
	mkdirSync(join(ws, "link/.claude/skills"), { recursive: true });
	mkdirSync(join(root, "shelf/old"), { recursive: true });
	symlinkSync(join(root, "shelf/old"), join(ws, "link/.claude/skills/old"), "dir");
	lines = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const scan = ({ tty = false, answer = true } = {}) =>
	createScan(paths, { out: (line) => lines.push(line), err: (line) => lines.push(line), platform: "linux", env: { PATH: "" }, fixOptions: { isTTY: () => tty, confirm: async () => answer } });
const text = () => lines.join("\n");

describe("scan --find-skill", () => {
	test("lists every project with the skill and marks git-tracked, untracked and shelf links", () => {
		assert.equal(scan().runFindSkill({ roots: [ws], name: "old" }), 0);
		assert.match(text(), /tracked\/\.claude\/skills\/old {2}\(git-tracked\)/);
		assert.match(text(), /loose\/\.claude\/skills\/old {2}\(not tracked by git\)/);
		assert.match(text(), /link\/\.claude\/skills\/old {2}\(link into the shelf/);
		assert.doesNotMatch(text(), /none\//);
		assert.match(text(), /3 projects with/);
	});

	test("--json and a name nothing has", () => {
		scan().runFindSkill({ roots: [ws], name: "old", json: true });
		const data = JSON.parse(text());
		assert.deepEqual(data.hits.map((hit) => [hit.tracked, hit.link]).sort(), [[false, false], [false, true], [true, false]]);
		lines = [];
		scan().runFindSkill({ roots: [ws], name: "ghost" });
		assert.match(text(), /No project under .* has \.claude\/skills\/ghost/);
	});

	test("refuses names that are paths, and a missing root", () => {
		assert.equal(scan().runFindSkill({ roots: [ws], name: "../x" }), 2);
		assert.equal(scan().runFindSkill({ roots: [ws], name: ".hidden" }), 2);
		assert.equal(scan().runFindSkill({ roots: [join(ws, "nope")], name: "old" }), 2);
	});
});

describe("scan --remove-skill", () => {
	test("--dry-run and a non-terminal run without --yes only preview", async () => {
		assert.equal(await scan().runRemoveSkill({ roots: [ws], name: "old", dryRun: true }), 0);
		assert.match(text(), /Would delete .* from 2 projects \(no copy kept\)/);
		assert.match(text(), /1 of them is not tracked by git and cannot be recovered/);
		assert.match(text(), /skip .*link\/\.claude\/skills\/old/);
		assert.match(text(), /Dry run: nothing deleted/);
		lines = [];
		await scan().runRemoveSkill({ roots: [ws], name: "old" });
		assert.match(text(), /run again with --yes/);
		assert.ok(existsSync(join(ws, "loose/.claude/skills/old")));
	});

	test("a terminal asks; n cancels, y deletes the real folders and leaves the shelf link", async () => {
		await scan({ tty: true, answer: false }).runRemoveSkill({ roots: [ws], name: "old" });
		assert.match(text(), /Cancelled/);
		assert.ok(existsSync(join(ws, "tracked/.claude/skills/old")));
		await scan({ tty: true }).runRemoveSkill({ roots: [ws], name: "old" });
		assert.ok(!existsSync(join(ws, "tracked/.claude/skills/old")) && !existsSync(join(ws, "loose/.claude/skills/old")));
		assert.ok(existsSync(join(ws, "link/.claude/skills/old")), "a shelf link is not ours to delete");
		assert.ok(existsSync(join(root, "shelf/old")));
	});

	test("nothing to remove is not an error", async () => {
		assert.equal(await scan().runRemoveSkill({ roots: [ws], name: "ghost", yes: true }), 0);
		assert.match(text(), /Nothing to remove/);
	});
});

describe("scan --global", () => {
	const globalSkill = () => join(paths.configDir, "skills/old");
	beforeEach(() => {
		mkdirSync(globalSkill(), { recursive: true });
		writeFileSync(join(globalSkill(), "SKILL.md"), "global body");
	});

	test("--find-skill lists the global copy only with global", () => {
		scan().runFindSkill({ roots: [ws], name: "old" });
		assert.doesNotMatch(text(), /\(global\)/);
		lines = [];
		scan().runFindSkill({ roots: [ws], name: "old", global: true });
		assert.match(text(), /~\/\.claude\/skills\/old {2}\(global\)/);
		assert.match(text(), /4 projects with/);
	});

	test("--remove-skill leaves the global copy without global, previews with it, then deletes and keeps a copy", async () => {
		await scan().runRemoveSkill({ roots: [ws], name: "old", global: true, dryRun: true });
		assert.match(text(), /from 2 projects and ~\/\.claude\/skills/);
		assert.ok(existsSync(globalSkill()));
		await scan({ tty: true }).runRemoveSkill({ roots: [ws], name: "old" });
		assert.ok(existsSync(globalSkill()), "no global flag, no global delete");
		lines = [];
		await scan({ tty: true }).runRemoveSkill({ roots: [ws], name: "old", global: true });
		assert.ok(!existsSync(globalSkill()));
		const [entry] = createBackups(paths, { out() {}, err() {} }).entries();
		assert.equal(entry.id.startsWith("removed/"), true);
		assert.equal(entry.from, globalSkill());
		assert.equal(readFileSync(join(entry.path, "SKILL.md"), "utf8"), "global body");
	});

	test("--no-backup keeps no copy and the preview says so", async () => {
		await scan().runRemoveSkill({ roots: [ws], name: "old", global: true, backup: false, yes: true });
		assert.ok(!existsSync(globalSkill()));
		assert.equal(createBackups(paths, { out() {}, err() {} }).entries().length, 0);
		assert.match(text(), /\(no copy kept\)/);
	});
});

describe("CLI", () => {
	test("flags route to the scan and conflicting flags are usage errors", () => {
		const fx = createFixture();
		try {
			mkdirSync(join(fx.repo, ".claude/skills/old"), { recursive: true });
			writeFileSync(join(fx.repo, ".claude/skills/old/SKILL.md"), "x");
			const found = fx.run(["scan", fx.root, "--find-skill", "old"]);
			assert.equal(found.status, 0, found.stderr);
			assert.match(found.stdout, /repo\/\.claude\/skills\/old/);
			assert.equal(fx.run(["scan", fx.root, "--find-skill", "old", "--yes"]).status, 2);
			assert.equal(fx.run(["scan", fx.root, "--find-skill", "old", "--fix"]).status, 2);
			assert.equal(fx.run(["scan", fx.root, "--remove-skill", "old", "--yes", "--dry-run"]).status, 2);
			const preview = fx.run(["scan", fx.root, "--remove-skill", "old"]);
			assert.match(preview.stdout, /run again with --yes/);
			assert.ok(existsSync(join(fx.repo, ".claude/skills/old")));
			assert.equal(fx.run(["scan", fx.root, "--remove-skill", "old", "--yes"]).status, 0);
			assert.ok(!existsSync(join(fx.repo, ".claude/skills/old")));
		} finally {
			fx.cleanup();
		}
	});
});
