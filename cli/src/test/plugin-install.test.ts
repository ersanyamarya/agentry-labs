import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { installFakeClaude } from "./helpers/fake-claude.js";
import type { Fixture } from "./helpers/fixture.js";
import { addPlugin, createFixture } from "./helpers/fixture.js";

let fx: Fixture;
let fake: ReturnType<typeof installFakeClaude>;
let extra: NodeJS.ProcessEnv;
beforeEach(() => {
  fx = createFixture();
  fake = installFakeClaude(join(fx.root, "fakebin"));
  extra = { PATH: `${join(fx.root, "fakebin")}:${process.env.PATH}` };
});
afterEach(() => fx.cleanup());

const plugin = (args: string[]) => fx.run(["plugin", ...args], { env: extra });
const settings = () => join(fx.configDir, "settings.json");
const enabled = () =>
  JSON.parse(readFileSync(settings(), "utf8")).enabledPlugins;
const backups = () =>
  existsSync(join(fx.configDir, "backups/agentry")) ? 1 : 0;

describe("agentry plugin install", () => {
  test("--dry-run previews the claude command and runs nothing", () => {
    const { status, stdout } = plugin(["install", "demo@mkt", "--dry-run"]);
    assert.equal(status, 0);
    assert.match(stdout, /Install plugin demo@mkt at user scope/);
    assert.match(stdout, /run: claude plugin install demo@mkt --scope user/);
    assert.deepEqual(fake.argv(), []);
    assert.equal(backups(), 0);
  });

  test("without a terminal and without --yes it only previews", () => {
    const { status, stdout } = plugin(["install", "demo@mkt"]);
    assert.equal(status, 0);
    assert.match(stdout, /Not a terminal, so preview only/);
    assert.deepEqual(fake.argv(), []);
  });

  test("--yes runs claude plugin install, backs up, verifies; the plugin then shows as installed", () => {
    const { status, stdout, stderr } = plugin(["install", "demo@mkt", "--yes"]);
    assert.equal(status, 0, stdout + stderr);
    assert.deepEqual(fake.argv(), [
      ["plugin", "install", "demo@mkt", "--scope", "user"],
    ]);
    assert.match(stdout, /demo@mkt is installed at user scope/);
    assert.equal(enabled()["demo@mkt"], true);
    assert.match(fx.run(["status", "--json"]).stdout, /"demo@mkt"/);
    assert.equal(backups(), 1);
    // the settings file did not exist, so undo has nothing to restore and names the command to undo by hand
    const undo = fx.run(["fix", "--undo", "--yes"]);
    assert.equal(undo.status, 0);
    assert.match(
      undo.stdout,
      // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: [^] is the intended match-any-character class
      /undo these by hand[^]*claude plugin install demo@mkt/
    );
  });

  test("--scope project runs in the project folder", () => {
    mkdirSync(join(fx.repo, ".claude"), { recursive: true });
    const { status, stdout, stderr } = plugin([
      "install",
      "demo@mkt",
      "--scope",
      "project",
      "--yes",
    ]);
    assert.equal(status, 0, stdout + stderr);
    assert.deepEqual(fake.argv(), [
      ["plugin", "install", "demo@mkt", "--scope", "project"],
    ]);
    assert.equal(
      JSON.parse(readFileSync(join(fx.repo, ".claude/settings.json"), "utf8"))
        .enabledPlugins["demo@mkt"],
      true
    );
  });

  test("refuses an install that already exists, a bad id, a bad scope", () => {
    addPlugin(fx, { enabled: true });
    let result = plugin(["install", "demo@mkt", "--yes"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already installed at user scope/);
    result = plugin(["install", "demo", "--yes"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /name>@<marketplace>/);
    assert.equal(plugin(["install", "x@y", "--scope", "galaxy"]).status, 2);
    assert.deepEqual(fake.argv(), []);
  });

  test("a failing claude exits 1 and says so", () => {
    const { status, stdout, stderr } = plugin(["install", "demo@mkt", "--yes"]);
    assert.equal(status, 0, stdout + stderr);
    const failed = fx.run(["plugin", "install", "other@mkt", "--yes"], {
      env: { ...extra, FAKE_CLAUDE_FAIL: "1" },
    });
    assert.equal(failed.status, 1);
    assert.equal(enabled()["other@mkt"], undefined);
  });
});

describe("agentry plugin uninstall", () => {
  test("--dry-run previews; --yes uninstalls by bare name and prints the new-session note", () => {
    addPlugin(fx, { enabled: true });
    const dry = plugin(["uninstall", "demo", "--dry-run"]);
    assert.equal(dry.status, 0);
    assert.match(
      dry.stdout,
      /run: claude plugin uninstall demo@mkt --scope user/
    );
    assert.deepEqual(fake.argv(), []);

    const { status, stdout, stderr } = plugin(["uninstall", "demo", "--yes"]);
    assert.equal(status, 0, stdout + stderr);
    assert.deepEqual(fake.argv(), [
      ["plugin", "uninstall", "demo@mkt", "--scope", "user"],
    ]);
    assert.match(
      stdout,
      /demo@mkt is uninstalled at user scope\. Applies to sessions started after this/
    );
    assert.equal(enabled()["demo@mkt"], undefined);
    assert.doesNotMatch(fx.run(["status", "--json"]).stdout, /"demo@mkt"/);
    // undo puts the enabledPlugins entry back
    assert.equal(fx.run(["fix", "--undo", "--yes"]).status, 0);
    assert.equal(enabled()["demo@mkt"], true);
  });

  test("refuses a plugin that is not installed, and a scope it is not installed at", () => {
    addPlugin(fx, { enabled: true });
    let result = plugin(["uninstall", "ghost", "--yes"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No installed plugin "ghost"/);
    result = plugin(["uninstall", "demo", "--scope", "project", "--yes"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not installed at project scope/);
    assert.deepEqual(fake.argv(), []);
  });
});
