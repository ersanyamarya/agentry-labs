import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createPaths } from "../lib/paths.mjs";
import { createScan } from "../lib/scan.mjs";
import { createFixture } from "./helpers/fixture.mjs";

// <root>/home/.claude holds a user-level stale permission; <root>/home/ws/{one,two} are repos with their own.
let root;
let home;
let configDir;
let ws;
let paths;
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-scanfix-")));
	assert.ok(!root.startsWith(realpathSync(homedir())), "TMPDIR must be outside the home directory");
	home = join(root, "home");
	configDir = join(home, ".claude");
	ws = join(home, "ws");
	paths = createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir } });
	put(join(configDir, "settings.json"), settingsWith("Bash(graft user:*)"));
	for (const name of ["one", "two"]) {
		mkdirSync(join(ws, name), { recursive: true });
		execFileSync("git", ["init", "-q"], { cwd: join(ws, name) });
		put(join(ws, name, ".claude", "settings.json"), settingsWith(`Bash(graft ${name}:*)`));
	}
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const put = (file, text) => {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
};
const settingsWith = (entry) => `{\n\t"permissions": {\n\t\t"allow": ["${entry}"]\n\t}\n}\n`;
const read = (file) => readFileSync(file, "utf8");
const userFile = () => join(configDir, "settings.json");

const setup = ({ tty = true, answers = [] } = {}) => {
	const lines = [];
	const asked = [];
	const scan = createScan(paths, {
		out: (line) => lines.push(line),
		err: (line) => lines.push(line),
		platform: "linux",
		env: { PATH: "" },
		fixOptions: {
			isTTY: () => tty,
			confirm: async (question) => {
				asked.push(question);
				return answers[asked.length - 1] ?? true;
			},
			now: () => new Date("2026-11-03T10:20:30.456Z"),
		},
	});
	return { scan, asked, output: () => lines.join("\n") };
};

describe("scan --fix", () => {
	test("two repos fixed with one confirm each, and the user-level fix applied once", async () => {
		const { scan, asked, output } = setup();
		assert.equal(await scan.runFix({ roots: [ws], cache: false }), 0, output());
		assert.equal(asked.length, 3, asked.join("|"));
		assert.match(asked[0], /for user-level/);
		assert.match(asked[1], /for ~\/ws\/(one|two)\?/);
		assert.notEqual(asked[1], asked[2]);
		assert.equal(read(userFile()), settingsWith("Bash(trail user:*)"));
		assert.equal(read(join(ws, "one", ".claude", "settings.json")), settingsWith("Bash(trail one:*)"));
		assert.equal(read(join(ws, "two", ".claude", "settings.json")), settingsWith("Bash(trail two:*)"));
		assert.equal(output().match(/=== user-level/g).length, 1, "global findings are fixed once, not per repo");
		assert.equal(readdirSync(paths.backupsDir).length, 3, "one backup set per confirmed scope");
	});

	test("declining one repo leaves it alone", async () => {
		const { scan, output } = setup({ answers: [true, false, true] });
		await scan.runFix({ roots: [ws], cache: false });
		const changed = ["one", "two"].filter((name) => read(join(ws, name, ".claude", "settings.json")).includes("trail"));
		assert.equal(changed.length, 1, output());
		assert.match(output(), /Nothing written\./);
	});

	test("--yes asks nothing; a second run finds nothing to fix", async () => {
		const first = setup({ tty: false });
		assert.equal(await first.scan.runFix({ roots: [ws], yes: true, cache: false }), 0, first.output());
		assert.deepEqual(first.asked, []);
		assert.equal(read(join(ws, "one", ".claude", "settings.json")), settingsWith("Bash(trail one:*)"));
		const second = setup();
		assert.equal(await second.scan.runFix({ roots: [ws], cache: false }), 0);
		assert.match(second.output(), /Nothing to fix/);
		assert.deepEqual(second.asked, []);
	});

	test("without a terminal it previews only; --dry-run writes nothing either", async () => {
		const before = [userFile(), join(ws, "one", ".claude", "settings.json")].map(read);
		for (const options of [{ tty: false }, { tty: true }]) {
			const { scan, asked, output } = setup(options);
			assert.equal(await scan.runFix({ roots: [ws], dryRun: options.tty, cache: false }), 0);
			assert.match(output(), /(Not a terminal, so preview only|Dry run): nothing written/);
			assert.deepEqual(asked, []);
		}
		assert.deepEqual([userFile(), join(ws, "one", ".claude", "settings.json")].map(read), before);
		assert.equal(existsSync(paths.backupsDir), false);
	});

	test("files git tracks are marked in the repo's preview", async () => {
		execFileSync("git", ["add", ".claude/settings.json"], { cwd: join(ws, "one") });
		const { scan, output } = setup({ tty: false });
		await scan.runFix({ roots: [ws], cache: false });
		assert.match(output(), /one\/\.claude\/settings\.json is tracked in git/);
		assert.doesNotMatch(output(), /two\/\.claude\/settings\.json is tracked in git/);
	});

	test("a missing root is a usage error", async () => {
		const { scan } = setup();
		assert.equal(await scan.runFix({ roots: [join(root, "nope")] }), 2);
	});
});

describe("agentry scan --fix (CLI)", () => {
	test("rejects --json, --yes with --dry-run, and --yes without --fix; non-TTY previews", () => {
		const fx = createFixture();
		try {
			assert.equal(fx.run(["scan", "--fix", "--json"]).status, 2);
			assert.equal(fx.run(["scan", "--fix", "--yes", "--dry-run"]).status, 2);
			assert.equal(fx.run(["scan", "--yes"]).status, 2);
			const preview = fx.run(["scan", fx.repo, "--fix"]);
			assert.equal(preview.status, 0, preview.stderr);
			assert.match(preview.stdout, /Nothing to fix/);
		} finally {
			fx.cleanup();
		}
	});
});
