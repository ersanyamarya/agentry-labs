import assert from "node:assert/strict";
import type { Rule } from "../lib/doctor-rules.js";
import type { Finding, FixRegistry, RunCommand } from "../lib/types.js";
import type { Paths } from "../lib/paths.js";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createDoctor } from "../lib/doctor.js";
import { createFix, previewDiff } from "../lib/fix.js";
import { createPaths } from "../lib/paths.js";
import { createFixture } from "./helpers/fixture.js";

// A fake doctor rule flags target.json while it contains BAD; the fake fix rewrites BAD to GOOD. Never the real home.
let root: string;
let home: string;
let configDir: string;
let repo: string;
let target: string;
let paths: Paths;
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-fix-")));
	assert.ok(!root.startsWith(realpathSync(homedir())), "TMPDIR must be outside the home directory");
	home = join(root, "home");
	configDir = join(home, ".claude");
	repo = join(home, "ws", "repo");
	target = join(repo, "target.json");
	mkdirSync(repo, { recursive: true });
	mkdirSync(configDir, { recursive: true });
	execFileSync("git", ["init", "-q"], { cwd: repo });
	writeFileSync(target, '{\n\t"name": "demo",\n\t"value": "BAD",\n\t"keep": true\n}\n');
	paths = createPaths({ env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir } });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const fakeRule: Rule = {
	id: "fake-bad",
	run: () => (existsSync(target) && readFileSync(target, "utf8").includes("BAD") ? [{ id: "fake-bad", severity: "warning", message: "target.json says BAD", file: target }] : []),
};
const textFix = (replace = (text: string | undefined) => (text ?? "").replace("BAD", "GOOD")): FixRegistry => ({
	"fake-bad": (finding: Finding) => ({ ruleId: finding.id, file: finding.file, describe: () => "Replace BAD with GOOD", apply: replace }),
});

const setup = ({ fixes = textFix(), tty = false, answers = [], onConfirm = () => {}, runCommand }: { fixes?: FixRegistry; tty?: boolean; answers?: boolean[]; onConfirm?: (n: number) => unknown; runCommand?: RunCommand } = {}) => {
	const lines: string[] = [];
	const asked: string[] = [];
	const ran: { argv: string[]; cwd?: string }[] = [];
	const fix = createFix(paths, {
		out: (line) => lines.push(line),
		err: (line) => lines.push(line),
		fixes,
		doctor: () => createDoctor(paths, { out: () => {}, platform: "linux", env: { PATH: "" }, rules: [fakeRule], renames: {}, launchctlGetenv: () => "" }),
		isTTY: () => tty,
		confirm: async (question) => {
			asked.push(question);
			onConfirm(asked.length);
			return answers[asked.length - 1] ?? false;
		},
		runCommand:
			runCommand ??
			((argv, options) => {
				ran.push({ argv, cwd: options.cwd });
				return { status: 0, stdout: "", stderr: "" };
			}),
		now: () => new Date("2026-11-03T10:20:30.456Z"),
	});
	return { fix, lines, asked, ran, output: () => lines.join("\n") };
};

const backupSets = () => (existsSync(paths.backupsDir) ? readdirSync(paths.backupsDir) : []);
const manifest = () => JSON.parse(readFileSync(join(paths.backupsDir, backupSets()[0], "manifest.json"), "utf8"));
const original = () => '{\n\t"name": "demo",\n\t"value": "BAD",\n\t"keep": true\n}\n';

describe("preview", () => {
	test("--dry-run prints a unified diff and writes nothing", async () => {
		const { fix, output, asked } = setup({ tty: true });
		assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
		assert.match(output(), /\[fake-bad\] Replace BAD with GOOD/);
		assert.match(output(), /--- ~\/ws\/repo\/target\.json\n\+\+\+ ~\/ws\/repo\/target\.json\n@@ -1,5 \+1,5 @@\n \{\n \t"name": "demo",\n-\t"value": "BAD",\n\+\t"value": "GOOD",\n \t"keep": true\n \}/);
		assert.match(output(), /Dry run: nothing written/);
		assert.equal(readFileSync(target, "utf8"), original());
		assert.deepEqual(asked, []);
		assert.deepEqual(backupSets(), []);
	});

	test("without a terminal the default is preview only", async () => {
		const { fix, output, asked } = setup({ tty: false });
		assert.equal(await fix.run({ path: repo }), 0);
		assert.match(output(), /-\t"value": "BAD"/);
		assert.match(output(), /Not a terminal, so preview only: nothing written\. Pass --yes to apply\./);
		assert.equal(readFileSync(target, "utf8"), original());
		assert.deepEqual(asked, []);
		assert.deepEqual(backupSets(), []);
	});

	test("findings without a registered fix are listed, nothing to apply", async () => {
		const { fix, output } = setup({ fixes: {} });
		assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
		assert.match(output(), /1 finding has no automatic fix \(see agentry doctor\):\n {2}\[fake-bad\] target\.json says BAD/);
		assert.match(output(), /Nothing to apply\./);
	});

	test("a clean folder has nothing to fix", async () => {
		writeFileSync(target, "{}\n");
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo }), 0);
		assert.match(output(), /^Nothing to fix\.$/m);
	});

	test("a missing folder is a usage error", async () => {
		const { fix } = setup();
		assert.equal(await fix.run({ path: join(root, "nope") }), 2);
	});
});

describe("apply", () => {
	test("--yes backs up, writes, writes the manifest and verifies the finding is gone", async () => {
		execFileSync("git", ["add", "target.json"], { cwd: repo });
		const before = statSync(target);
		const { fix, output, asked } = setup({ tty: false });
		assert.equal(await fix.run({ path: repo, yes: true }), 0);
		assert.deepEqual(asked, []);
		assert.equal(readFileSync(target, "utf8"), original().replace("BAD", "GOOD"));
		assert.deepEqual(backupSets(), ["2026-11-03T10-20-30-456Z"]);
		const set = join(paths.backupsDir, "2026-11-03T10-20-30-456Z");
		const data = manifest();
		assert.equal(data.version, 1);
		assert.equal(data.status, "done");
		assert.equal(data.cwd, repo);
		assert.equal(data.createdAt, "2026-11-03T10:20:30.456Z");
		assert.deepEqual(data.commands, []);
		assert.equal(data.files.length, 1);
		const [entry] = data.files;
		assert.equal(entry.path, target);
		assert.equal(entry.realPath, target);
		assert.equal(entry.kind, "file");
		assert.equal(entry.backup, join("files", target.slice(1)));
		assert.equal(readFileSync(join(set, entry.backup), "utf8"), original());
		assert.equal(entry.mtimeMs, before.mtimeMs);
		assert.equal(entry.mode, before.mode & 0o7777);
		assert.match(entry.sha256, /^[0-9a-f]{64}$/);
		assert.equal(entry.gitTracked, true);
		assert.deepEqual(entry.ruleIds, ["fake-bad"]);
		assert.equal(entry.result, "written");
		assert.match(output(), /Backup: ~\/\.claude\/backups\/agentry\/2026-11-03T10-20-30-456Z/);
		assert.match(output(), /verify \[fake-bad\] target\.json says BAD: gone/);
	});

	test("an untracked file is recorded as not git-tracked", async () => {
		const { fix } = setup();
		assert.equal(await fix.run({ path: repo, yes: true }), 0);
		assert.equal(manifest().files[0].gitTracked, false);
	});

	test("in a terminal it asks first; no means nothing is written", async () => {
		const { fix, output, asked } = setup({ tty: true, answers: [false] });
		assert.equal(await fix.run({ path: repo }), 0);
		assert.deepEqual(asked, ["\nApply 1 change? [y/N] "]);
		assert.match(output(), /Nothing written\./);
		assert.equal(readFileSync(target, "utf8"), original());
		assert.deepEqual(backupSets(), []);
	});

	test("in a terminal, yes applies", async () => {
		const { fix, asked } = setup({ tty: true, answers: [true] });
		assert.equal(await fix.run({ path: repo }), 0);
		assert.equal(asked.length, 1);
		assert.match(readFileSync(target, "utf8"), /GOOD/);
	});

	test("the write is atomic: old mode kept, no temp file left", async () => {
		chmodSync(target, 0o640);
		const { fix } = setup();
		assert.equal(await fix.run({ path: repo, yes: true }), 0);
		assert.equal(statSync(target).mode & 0o7777, 0o640);
		assert.deepEqual(readdirSync(repo).filter((name) => name.includes("agentry") || name.endsWith(".tmp")), []);
	});

	test("a symlinked file is written through the link, which stays a link", async () => {
		const real = join(root, "dotfiles", "target.json");
		mkdirSync(join(root, "dotfiles"));
		writeFileSync(real, original());
		rmSync(target);
		symlinkSync(real, target);
		const { fix } = setup();
		assert.equal(await fix.run({ path: repo, yes: true }), 0);
		assert.ok(lstatSync(target).isSymbolicLink());
		assert.match(readFileSync(real, "utf8"), /GOOD/);
		assert.equal(manifest().files[0].realPath, real);
	});

	test("verify reports a finding that is still there and exits 1", async () => {
		const { fix, output } = setup({ fixes: textFix((text) => (text ?? "").replace('"keep": true', '"keep": false')) });
		assert.equal(await fix.run({ path: repo, yes: true }), 1);
		assert.match(output(), /verify \[fake-bad\] target\.json says BAD: still reported/);
	});

	test("a fix that throws is reported by code only and exits 1", async () => {
		const { fix, output } = setup({
			fixes: textFix(() => {
				throw Object.assign(new Error("secret file content sk-live-123"), { code: "EBOOM" });
			}),
		});
		assert.equal(await fix.run({ path: repo, yes: true }), 1);
		assert.match(output(), /could not plan \(EBOOM\)/);
		assert.doesNotMatch(output(), /sk-live/);
	});
});

describe("concurrent modification", () => {
	test("a file changed after the preview is planned and previewed again", async () => {
		const { fix, asked, output } = setup({
			tty: true,
			answers: [true, true],
			onConfirm: (n: number) => n === 1 && writeFileSync(target, original().replace('"keep": true', '"keep": true,\n\t"added": 1')),
		});
		assert.equal(await fix.run({ path: repo }), 0);
		assert.equal(asked.length, 2);
		assert.match(output(), /~\/ws\/repo\/target\.json changed on disk after the preview; planning again\./);
		const text = readFileSync(target, "utf8");
		assert.match(text, /"value": "GOOD"/);
		assert.match(text, /"added": 1/);
		assert.equal(backupSets().length, 1);
		assert.match(readFileSync(join(paths.backupsDir, backupSets()[0], manifest().files[0].backup), "utf8"), /"added": 1/);
	});

	test("a file that keeps changing is never written", async () => {
		const { fix, asked, output } = setup({
			tty: true,
			answers: [true, true, true],
			onConfirm: (n: number) => writeFileSync(target, `${original()}\n`.repeat(n)),
		});
		assert.equal(await fix.run({ path: repo }), 1);
		assert.equal(asked.length, 3);
		assert.match(output(), /keeps changing on disk; nothing written/);
		assert.doesNotMatch(readFileSync(target, "utf8"), /GOOD/);
		assert.deepEqual(backupSets(), []);
	});
});

describe("command fixes", () => {
	const commandFix = {
		"fake-bad": (finding: Finding) => ({
			ruleId: finding.id,
			file: finding.file,
			describe: () => "Run the cleaner",
			apply: () => ({ command: ["cleaner", "--api-key", "sk-abcdef1234567890xyz", "remove"], cwd: repo }),
		}),
	};

	test("previewed with secrets masked and not run under --dry-run", async () => {
		const { fix, ran, output } = setup({ fixes: commandFix });
		assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
		assert.match(output(), /\[fake-bad\] Run the cleaner\n {2}run: cleaner --api-key <masked> remove\n {2}in: {2}~\/ws\/repo/);
		assert.doesNotMatch(output(), /sk-abcdef/);
		assert.deepEqual(ran, []);
	});

	test("not run when the prompt is declined", async () => {
		const { fix, ran } = setup({ fixes: commandFix, tty: true, answers: [false] });
		assert.equal(await fix.run({ path: repo }), 0);
		assert.deepEqual(ran, []);
	});

	test("run after confirm, from its folder, recorded in the manifest", async () => {
		const { fix, ran, output } = setup({
			fixes: commandFix,
			tty: true,
			answers: [true],
			runCommand: (argv: string[], { cwd }) => {
				ran.push({ argv, cwd });
				writeFileSync(target, "{}\n");
				return { status: 0, stdout: "removed sk-abcdef1234567890xyz\n", stderr: "" };
			},
		});
		assert.equal(await fix.run({ path: repo }), 0);
		assert.deepEqual(ran, [{ argv: ["cleaner", "--api-key", "sk-abcdef1234567890xyz", "remove"], cwd: repo }]);
		assert.doesNotMatch(output(), /sk-abcdef/);
		assert.match(output(), /verify \[fake-bad\] target\.json says BAD: gone/);
		const data = manifest();
		assert.deepEqual(data.commands, [{ ruleId: "fake-bad", command: ["cleaner", "--api-key", "<masked>", "remove"], cwd: repo, exitCode: 0 }]);
		assert.equal(data.files[0].result, "command");
		assert.equal(readFileSync(join(paths.backupsDir, backupSets()[0], data.files[0].backup), "utf8"), original());
	});

	test("a failing command exits 1", async () => {
		const { fix } = setup({ fixes: commandFix, runCommand: () => ({ status: 3, stdout: "", stderr: "" }) });
		assert.equal(await fix.run({ path: repo, yes: true }), 1);
		assert.equal(manifest().status, "partial");
	});
});

describe("secrets in previews", () => {
	test("a secret in the file stays masked in the diff", async () => {
		writeFileSync(target, '{\n\t"env": {\n\t\t"API_KEY": "sk-abcdef1234567890xyz"\n\t},\n\t"value": "BAD",\n\t"url": "https://x.example/mcp?token=hunter2hunter2"\n}\n');
		const { fix, output } = setup();
		assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
		assert.match(output(), / \t\t"API_KEY": "<masked>"/);
		assert.match(output(), / \t"url": "https:\/\/x\.example\/mcp\?token=<masked>"/);
		assert.match(output(), /\+\t"value": "GOOD"/);
		assert.doesNotMatch(output(), /sk-abcdef|hunter2/);
	});

	test("a change to a secret value only is summarised, not shown", () => {
		const before = '{\n\t"env": { "TOKEN": "aaaaaaaa1111" }\n}\n';
		const diff = previewDiff("/x/settings.json", before, before.replace("aaaaaaaa1111", "bbbbbbbb2222"));
		assert.equal(diff.text, undefined);
		assert.match(diff.hidden, /only in masked values; \+1 -1 lines/);
	});

	test("a JSON file that does not parse is summarised, not shown", () => {
		const diff = previewDiff("/x/settings.json", '{ "key": "sk-abcdef1234567890xyz", BAD\n', '{ "key": "sk-abcdef1234567890xyz", GOOD\n');
		assert.equal(diff.text, undefined);
		assert.match(diff.hidden, /not valid JSON/);
	});

	test("a large file with a small change diffs quickly with context only around the change", () => {
		const big = Array.from({ length: 20000 }, (_, i) => `line ${i}\n`).join("");
		const started = Date.now();
		const diff = previewDiff("/x/notes.txt", big, big.replace("line 10000\n", "line ten thousand\n"));
		assert.ok(Date.now() - started < 1000);
		assert.equal(diff.text, "@@ -9998,7 +9998,7 @@\n line 9997\n line 9998\n line 9999\n-line 10000\n+line ten thousand\n line 10001\n line 10002\n line 10003");
	});
});

describe("CLI", () => {
	test("fix --dry-run on a clean fixture says nothing to fix", () => {
		const fixture = createFixture();
		try {
			const { status, stdout } = fixture.run(["fix", "--dry-run"]);
			assert.equal(status, 0);
			assert.match(stdout, /Nothing to fix\./);
			assert.ok(!existsSync(join(fixture.configDir, "backups")));
		} finally {
			fixture.cleanup();
		}
	});

	test("usage errors exit 2", () => {
		const fixture = createFixture();
		try {
			assert.equal(fixture.run(["fix", "a", "b"]).status, 2);
			assert.equal(fixture.run(["fix", "--yes", "--dry-run"]).status, 2);
			assert.equal(fixture.run(["fix", "--json"]).status, 2);
		} finally {
			fixture.cleanup();
		}
	});
});
