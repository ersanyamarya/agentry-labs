import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { Fixture } from "./helpers/fixture.js";
import { createFixture } from "./helpers/fixture.js";

let fx: Fixture;
beforeEach(() => {
  fx = createFixture();
});
afterEach(() => fx.cleanup());

const projectSkill = (name = "mine") => join(fx.repo, ".claude/skills", name);
const globalSkill = (name = "mine") => join(fx.configDir, "skills", name);
const make = (dir: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: mine\n---\n");
};

describe("agentry shelf promote", () => {
  test("--dry-run says what moves and moves nothing", () => {
    make(projectSkill());
    const { status, stdout } = fx.run([
      "shelf",
      "promote",
      "mine",
      "--dry-run",
    ]);
    assert.equal(status, 0);
    assert.match(
      stdout,
      /would promote mine: .*\.claude\/skills\/mine -> .*home\/\.claude\/skills\/mine/
    );
    assert.ok(existsSync(projectSkill()) && !existsSync(globalSkill()));
  });

  test("moves the folder (no copy kept)", () => {
    make(projectSkill());
    const { status, stdout } = fx.run(["shelf", "promote", "mine"]);
    assert.equal(status, 0);
    assert.match(stdout, /promoted mine to global scope/);
    assert.ok(!existsSync(projectSkill()));
    assert.ok(existsSync(join(globalSkill(), "SKILL.md")));
  });

  test("refuses a name clash, a missing skill and a link", () => {
    make(projectSkill());
    make(globalSkill());
    let result = fx.run(["shelf", "promote", "mine"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already exists; not overwriting/);
    assert.ok(existsSync(projectSkill()));

    result = fx.run(["shelf", "promote", "nope"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No project skill folder "nope"/);

    make(join(fx.root, "elsewhere"));
    mkdirSync(join(fx.repo, ".claude/skills"), { recursive: true });
    symlinkSync(join(fx.root, "elsewhere"), projectSkill("linked"), "dir");
    result = fx.run(["shelf", "promote", "linked"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is a link, not a project skill folder/);
    assert.ok(!existsSync(globalSkill("linked")));
  });

  test("usage errors", () => {
    assert.equal(fx.run(["shelf", "promote"]).status, 2);
    assert.equal(fx.run(["shelf", "promote", "a/b"]).status, 2);
  });
});

describe("agentry shelf demote", () => {
  test("moves a global skill into this project, and --dry-run moves nothing", () => {
    make(globalSkill());
    assert.match(
      fx.run(["shelf", "demote", "mine", "--dry-run"]).stdout,
      /would demote mine/
    );
    assert.ok(existsSync(globalSkill()) && !existsSync(projectSkill()));
    const { status, stdout } = fx.run(["shelf", "demote", "mine"]);
    assert.equal(status, 0);
    assert.match(stdout, /demoted mine to project scope/);
    assert.ok(!existsSync(globalSkill()));
    assert.ok(existsSync(join(projectSkill(), "SKILL.md")));
  });

  test("refuses a name clash and a global link", () => {
    make(globalSkill());
    make(projectSkill());
    const clash = fx.run(["shelf", "demote", "mine"]);
    assert.equal(clash.status, 1);
    assert.match(clash.stderr, /already exists; not overwriting/);
    assert.ok(existsSync(globalSkill()));

    make(join(fx.root, "elsewhere"));
    symlinkSync(join(fx.root, "elsewhere"), globalSkill("linked"), "dir");
    const link = fx.run(["shelf", "demote", "linked"]);
    assert.equal(link.status, 1);
    assert.match(link.stderr, /is a link, not a global skill folder/);
  });
});
