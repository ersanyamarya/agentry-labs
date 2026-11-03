import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
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

describe("shelf on in a worktree", () => {
	test("writes the exclude lines to the shared git dir, where .git is a file", () => {
		execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-qm", "init"], { cwd: fx.repo });
		const tree = join(fx.root, "tree");
		execFileSync("git", ["worktree", "add", "-q", tree], { cwd: fx.repo });
		assert.ok(lstatSync(join(tree, ".git")).isFile());
		const { status } = fx.run(["shelf", "on", "audit"], { cwd: tree });
		assert.equal(status, 0);
		assert.ok(lstatSync(join(tree, ".claude/skills/review")).isSymbolicLink());
		assert.equal(exclude(), ".claude/skills/review\n");
		assert.equal(fx.run(["shelf", "off", "audit"], { cwd: tree }).status, 0);
		assert.equal(exclude(), "");
	});
});

describe("shelf targets", () => {
	test("accepts several groups, group/skill and bare skill names in one call", () => {
		const { status, stdout } = fx.run(["shelf", "on", "audit", "video/trim", "ffmpeg-install"]);
		assert.equal(status, 0);
		assert.match(stdout, /^audit on in .*: 1 of 1 changed\.\nvideo\/trim on in .*: 1 of 1 changed\.\nvideo\/ffmpeg-install on in .*: 1 of 1 changed\.\n$/);
		assert.ok(existsSync(join(fx.repo, ".claude/skills/review")));
		assert.ok(!existsSync(join(fx.repo, ".claude/agents/editor.md")));
		fx.run(["shelf", "off", "trim", "review"]);
		assert.ok(!existsSync(join(fx.repo, ".claude/skills/trim")));
		assert.ok(existsSync(join(fx.repo, ".claude/skills/ffmpeg-install")));
	});

	test("an ambiguous skill name lists the matches, exits 2 and changes nothing", () => {
		fx.cleanup();
		fx = createFixture({ shelf: { video: { skills: ["trim"] }, audio: { skills: ["trim", "mix"] } } });
		const { status, stderr } = fx.run(["shelf", "on", "mix", "trim"]);
		assert.equal(status, 2);
		assert.match(stderr, /"trim" is in several groups: audio\/trim, video\/trim/);
		assert.ok(!existsSync(join(fx.repo, ".claude")));
	});

	test("an unknown target exits 1 before anything is linked", () => {
		const { status, stderr } = fx.run(["shelf", "on", "audit", "video/nope"]);
		assert.equal(status, 1);
		assert.match(stderr, /No skill "nope" in group "video"/);
		assert.ok(!existsSync(join(fx.repo, ".claude")));
	});
});

describe("shelf status", () => {
	test("shows groups, project and global links", () => {
		fx.run(["shelf", "on", "video"]);
		fx.run(["shelf", "on", "audit/review", "--global"]);
		const { status, stdout } = fx.run(["shelf", "status"]);
		assert.equal(status, 0);
		assert.match(stdout, /audit +on \(global\)\nvideo +on \(this project\)/);
		assert.match(stdout, /project \(.*\)\n {2}video\/ffmpeg-install\n {2}video\/trim\n {2}video\/editor\.md \(agent\)/);
		assert.match(stdout, /global \(.*\)\n {2}audit\/review\n/);
	});

	test("--json has a stable shape and reports broken links", () => {
		fx.run(["shelf", "on", "video"]);
		rmSync(join(fx.configDir, "skill-shelf/video/trim"), { recursive: true });
		const result = JSON.parse(fx.run(["shelf", "status", "--json"]).stdout);
		assert.deepEqual(Object.keys(result), ["shelf", "groups", "project", "global"]);
		assert.deepEqual(result.groups, [
			{ name: "audit", state: "off" },
			{ name: "video", state: "on (this project)" },
		]);
		assert.deepEqual(Object.keys(result.project), ["base", "links", "broken"]);
		assert.deepEqual(result.project.links.map(({ group, kind, name }) => `${group}/${kind}/${name}`), ["video/skills/ffmpeg-install", "video/agents/editor.md"]);
		assert.equal(result.project.broken.length, 1);
		assert.deepEqual(Object.keys(result.project.broken[0]), ["kind", "name", "link", "target"]);
		assert.equal(result.project.broken[0].name, "trim");
		assert.deepEqual(result.global.links, []);
	});

	test("is read-only", () => {
		fx.run(["shelf", "status"]);
		assert.ok(!existsSync(join(fx.repo, ".claude")));
	});
});

describe("shelf shelve / unshelve", () => {
	const globalSkill = (name) => {
		mkdirSync(join(fx.configDir, "skills", name), { recursive: true });
		writeFileSync(join(fx.configDir, "skills", name, "SKILL.md"), "x\n");
	};

	test("shelve moves a global skill into a group and unshelve moves it back", () => {
		globalSkill("pdf");
		const shelved = fx.run(["shelf", "shelve", "pdf", "docs"]);
		assert.equal(shelved.status, 0);
		assert.ok(existsSync(join(fx.configDir, "skill-shelf/docs/pdf/SKILL.md")));
		assert.ok(!existsSync(join(fx.configDir, "skills/pdf")));
		assert.equal(fx.run(["shelf", "unshelve", "pdf"]).status, 0);
		assert.ok(existsSync(join(fx.configDir, "skills/pdf/SKILL.md")));
		assert.ok(!existsSync(join(fx.configDir, "skill-shelf/docs/pdf")));
	});

	test("shelve refuses to overwrite, to move a missing skill or a shelf link", () => {
		globalSkill("trim");
		assert.match(fx.run(["shelf", "shelve", "trim", "video"]).stderr, /already exists; not overwriting/);
		assert.ok(existsSync(join(fx.configDir, "skills/trim")));
		assert.equal(fx.run(["shelf", "shelve", "ghost", "video"]).status, 1);
		fx.run(["shelf", "on", "audit", "--global"]);
		assert.match(fx.run(["shelf", "shelve", "review", "audit"]).stderr, /not a skill folder/);
	});

	test("shelve refuses while a shelf link with that name exists", () => {
		fx.run(["shelf", "on", "video/trim"]);
		globalSkill("trim");
		const { status, stderr } = fx.run(["shelf", "shelve", "trim", "other"]);
		assert.equal(status, 1);
		assert.match(stderr, /A shelf link named trim exists/);
		assert.ok(existsSync(join(fx.configDir, "skills/trim")));
	});

	test("unshelve refuses while linked in the project or globally, then works after off", () => {
		fx.run(["shelf", "on", "video/trim"]);
		const project = fx.run(["shelf", "unshelve", "trim"]);
		assert.equal(project.status, 1);
		assert.match(project.stderr, /still linked/);
		fx.run(["shelf", "off", "trim"]);
		fx.run(["shelf", "on", "trim", "--global"]);
		assert.equal(fx.run(["shelf", "unshelve", "video/trim"]).status, 1);
		fx.run(["shelf", "off", "trim", "--global"]);
		assert.equal(fx.run(["shelf", "unshelve", "video/trim"]).status, 0);
		assert.ok(existsSync(join(fx.configDir, "skills/trim/SKILL.md")));
	});

	test("unshelve refuses to overwrite and rejects groups and ambiguous names", () => {
		globalSkill("trim");
		assert.match(fx.run(["shelf", "unshelve", "trim"]).stderr, /already exists; not overwriting/);
		assert.equal(fx.run(["shelf", "unshelve", "video"]).status, 2);
		assert.ok(existsSync(join(fx.configDir, "skill-shelf/video/trim")));
	});
});
