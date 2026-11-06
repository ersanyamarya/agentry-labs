import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { Fixture } from "./helpers/fixture.js";
import { createFixture } from "./helpers/fixture.js";

let fx: Fixture;
let origin: string;
beforeEach(() => {
  fx = createFixture();
  // A local git repo stands in for github: two bundled skills and one in no bundle.
  origin = join(fx.root, "origin");
  for (const [name, description] of [
    ["alpha", "Alpha does a thing"],
    ["beta", "Beta does another"],
    ["loose", "Not in any bundle"],
  ]) {
    mkdirSync(join(origin, "skills", name), { recursive: true });
    writeFileSync(
      join(origin, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n`
    );
  }
  writeFileSync(
    join(origin, "bundles.tsv"),
    "# comment\nweb\tskills/alpha\nweb\tskills/beta\n"
  );
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", ...args],
      { cwd: origin, stdio: "ignore" }
    );
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterEach(() => fx.cleanup());

const catalog = (...args: string[]) =>
  fx.run(["catalog", ...args], { env: { AGENTRY_CATALOG_REPO: origin } });

describe("catalog", () => {
  test("list before refresh says to fetch", () => {
    const { status, stderr } = catalog("list");
    assert.equal(status, 1);
    assert.match(stderr, /run agentry catalog refresh/);
  });

  test("refresh clones, list groups skills by bundle and shows where each is installed", () => {
    assert.equal(catalog("refresh").status, 0);
    const { stdout } = catalog("list");
    assert.match(stdout, /^extras +loose +~ *\d+ +not installed$/m);
    assert.match(stdout, /^web +alpha +~ *\d+ +not installed$/m);
    const json = JSON.parse(catalog("list", "--json").stdout);
    assert.deepEqual(
      json.map((skill: Record<string, any>) => [skill.name, skill.bundle]),
      [
        ["loose", "extras"],
        ["alpha", "web"],
        ["beta", "web"],
      ]
    );
  });

  test("add copies onto the shelf under the bundle, off; dry run writes nothing; no overwrite", () => {
    catalog("refresh");
    assert.match(
      catalog("add", "alpha", "--dry-run").stdout,
      /would add alpha to shelf group web/
    );
    assert.equal(existsSync(join(fx.configDir, "skill-shelf/web")), false);
    const added = catalog("add", "alpha", "loose", "--group", "mine");
    assert.equal(added.status, 0);
    assert.match(added.stdout, /added alpha to shelf group mine \(off\)/);
    assert.equal(
      existsSync(join(fx.configDir, "skill-shelf/mine/alpha/SKILL.md")),
      true
    );
    assert.match(fx.run(["shelf", "list"]).stdout, /mine +2 skills/);
    const again = catalog("add", "alpha");
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already installed \(shelf\/mine\)/);
    assert.match(catalog("list").stdout, /alpha +~ *\d+ +shelf\/mine/);
  });

  test("unknown skills and bad group names are refused", () => {
    catalog("refresh");
    assert.match(
      catalog("add", "nope").stderr,
      /No item "nope" in the catalog/
    );
    assert.match(
      catalog("add", "alpha", "--group", "a/b").stderr,
      /Not a usable group name/
    );
  });

  test("a failed fetch says so and exits 1", () => {
    const { status, stderr } = fx.run(["catalog", "refresh"], {
      env: { AGENTRY_CATALOG_REPO: join(fx.root, "missing") },
    });
    assert.equal(status, 1);
    assert.match(stderr, /Could not fetch the catalog/);
  });
});

describe("shelf remove", () => {
  const removed = () => join(fx.configDir, "backups/agentry/removed");

  test("a shelved skill is copied to the backups, then deleted; an emptied group goes too", () => {
    const { status, stdout } = fx.run(["shelf", "remove", "audit/review"]);
    assert.equal(status, 0);
    assert.match(stdout, /removed audit\/review; a copy is in /);
    assert.equal(existsSync(join(fx.configDir, "skill-shelf/audit")), false);
    const [stamp] = readdirSync(removed());
    assert.equal(
      existsSync(join(removed(), stamp, "audit_review/SKILL.md")),
      true
    );
  });

  test("dry run changes nothing", () => {
    assert.match(
      fx.run(["shelf", "remove", "trim", "--dry-run"]).stdout,
      /would remove video\/trim/
    );
    assert.equal(
      existsSync(join(fx.configDir, "skill-shelf/video/trim")),
      true
    );
    assert.equal(existsSync(removed()), false);
  });

  test("refuses while the skill is linked", () => {
    fx.run(["shelf", "on", "audit/review"]);
    const { status, stderr } = fx.run(["shelf", "remove", "review"]);
    assert.equal(status, 1);
    assert.match(stderr, /still linked/);
    assert.equal(
      existsSync(join(fx.configDir, "skill-shelf/audit/review")),
      true
    );
  });

  test("a global skill folder in ~/.claude/skills can be removed; a group cannot", () => {
    mkdirSync(join(fx.configDir, "skills/mine"), { recursive: true });
    writeFileSync(
      join(fx.configDir, "skills/mine/SKILL.md"),
      "---\nname: mine\n---\n"
    );
    assert.match(
      fx.run(["shelf", "remove", "mine"]).stdout,
      /removed mine \(global\)/
    );
    assert.equal(existsSync(join(fx.configDir, "skills/mine")), false);
    const group = fx.run(["shelf", "remove", "video"]);
    assert.equal(group.status, 2);
    assert.match(group.stderr, /is a group/);
  });
});
