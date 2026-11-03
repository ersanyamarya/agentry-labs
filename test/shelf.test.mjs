import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createFixture } from "./helpers/fixture.mjs";

let fx;
beforeEach(() => {
	fx = createFixture();
});
afterEach(() => fx.cleanup());

// git init seeds the file with comment lines; only the entries matter.
const exclude = () =>
	readFileSync(join(fx.repo, ".git/info/exclude"), "utf8")
		.split("\n")
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => `${line}\n`)
		.join("");

describe("shelf list", () => {
	test("shows every group as off with skill and agent counts", () => {
		const { status, stdout } = fx.run(["shelf", "list"]);
		assert.equal(status, 0);
		assert.match(stdout, /audit +1 skills +off\n {2}review\n/);
		assert.match(stdout, /video +2 skills, 1 agent +off\n {2}ffmpeg-install, trim, editor\.md\n/);
	});

	test("reports on (this project) and on (global)", () => {
		fx.run(["shelf", "on", "video"]);
		assert.match(fx.run(["shelf", "list"]).stdout, /video .*on \(this project\)/);
		fx.run(["shelf", "on", "audit", "--global"]);
		assert.match(fx.run(["shelf", "list"]).stdout, /audit .*on \(global\)/);
	});
});

describe("shelf on", () => {
	test("symlinks skills and agents into the project and excludes them from git", () => {
		const { status, stdout } = fx.run(["shelf", "on", "video"]);
		assert.equal(status, 0);
		assert.equal(stdout, `video on in ${join(fx.repo, ".claude")}: 3 of 3 changed.\n`);
		const link = join(fx.repo, ".claude/skills/trim");
		assert.ok(lstatSync(link).isSymbolicLink());
		assert.equal(readlinkSync(link), join(fx.configDir, "skill-shelf/video/trim"));
		assert.ok(existsSync(join(fx.repo, ".claude/agents/editor.md")));
		assert.equal(exclude(), ".claude/skills/ffmpeg-install\n.claude/skills/trim\n.claude/agents/editor.md\n");
	});

	test("is idempotent", () => {
		fx.run(["shelf", "on", "video"]);
		assert.match(fx.run(["shelf", "on", "video"]).stdout, /: 0 of 3 changed\./);
	});

	test("with --global links into the config dir and leaves the project alone", () => {
		const { stdout } = fx.run(["shelf", "on", "audit", "--global"]);
		assert.equal(stdout, `audit on in ${fx.configDir}: 1 of 1 changed.\n`);
		assert.ok(lstatSync(join(fx.configDir, "skills/review")).isSymbolicLink());
		assert.ok(!existsSync(join(fx.repo, ".claude")));
	});

	test("skips a name that already exists and is not a shelf link", () => {
		mkdirSync(join(fx.repo, ".claude/skills/trim"), { recursive: true });
		const { stdout, stderr } = fx.run(["shelf", "on", "video"]);
		assert.match(stderr, /skip trim: .* already exists and is not a shelf link/);
		assert.match(stdout, /: 2 of 3 changed\./);
	});

	test("unknown group exits 1 and lists the groups", () => {
		const { status, stderr } = fx.run(["shelf", "on", "nope"]);
		assert.equal(status, 1);
		assert.match(stderr, /No group "nope" in .*skill-shelf\. Groups: audit, video/);
	});

	test("works from a subfolder of the repo", () => {
		const sub = join(fx.repo, "src");
		mkdirSync(sub);
		fx.run(["shelf", "on", "audit"], { cwd: sub });
		assert.ok(existsSync(join(fx.repo, ".claude/skills/review")));
	});
});

describe("shelf off", () => {
	test("removes the links and the exclude lines but keeps other exclude entries", () => {
		writeFileSync(join(fx.repo, ".git/info/exclude"), "keep-me\n");
		fx.run(["shelf", "on", "video"]);
		const { stdout } = fx.run(["shelf", "off", "video"]);
		assert.equal(stdout, `video off in ${join(fx.repo, ".claude")}: 3 of 3 changed.\n`);
		assert.ok(!existsSync(join(fx.repo, ".claude/skills/trim")));
		assert.equal(exclude(), "keep-me\n");
	});

	test("does not remove a real folder with the same name", () => {
		mkdirSync(join(fx.repo, ".claude/skills/trim"), { recursive: true });
		assert.match(fx.run(["shelf", "off", "video"]).stdout, /: 0 of 3 changed\./);
		assert.ok(existsSync(join(fx.repo, ".claude/skills/trim")));
	});
});
