import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import type { Fixture } from "./helpers/fixture.js";
import { addPlugin, createFixture } from "./helpers/fixture.js";

const SECRET = "abcdef0123456789abcdef0123";
const SETTINGS = `{
\t"model": "x",
\t"hooks": {
\t\t"PreToolUse": [
\t\t\t{
\t\t\t\t"matcher": "Bash",
\t\t\t\t"hooks": [
\t\t\t\t\t{ "type": "command", "command": "echo one --token ${SECRET}" },
\t\t\t\t\t{ "type": "command", "command": "echo two" }
\t\t\t\t]
\t\t\t}
\t\t],
\t\t"Stop": [{ "hooks": [{ "type": "command", "command": "echo stop" }] }]
\t}
}
`;

let fx: Fixture;
beforeEach(() => {
  fx = createFixture();
  writeFileSync(settingsPath(), SETTINGS);
});
afterEach(() => fx.cleanup());

const settingsPath = () => join(fx.configDir, "settings.json");
const settings = () => readFileSync(settingsPath(), "utf8");
const parkedFile = () => join(fx.configDir, "agentry/parked-hooks.json");
const hook = (args: (string | undefined)[]) =>
  fx.run(["hook", ...(args as string[])]);
// id of the listed hook whose line contains `text`
const idOf = (text: string) =>
  hook(["list"])
    .stdout.split("\n")
    .find((line) => line.includes(text))
    ?.slice(0, 8);

describe("agentry hook list", () => {
  test("prints id, scope, state, event, matcher and a masked command", () => {
    const { status, stdout } = hook(["list"]);
    assert.equal(status, 0);
    assert.match(
      stdout,
      /^[0-9a-f]{8}\s+user\s+active\s+PreToolUse\s+Bash\s+echo one --token <masked>$/m
    );
    assert.match(
      stdout,
      /^[0-9a-f]{8}\s+user\s+active\s+Stop\s+\*\s+echo stop$/m
    );
    assert.doesNotMatch(stdout, new RegExp(SECRET));
  });

  test("ids are stable across runs and --json carries them", () => {
    assert.equal(idOf("echo two"), idOf("echo two"));
    const items = JSON.parse(hook(["list", "--json"]).stdout);
    assert.equal(items.length, 3);
    assert.ok(
      items.every((item: Record<string, any>) => /^[0-9a-f]{8}$/.test(item.id))
    );
  });
});

describe("agentry hook disable|enable", () => {
  test("--dry-run previews a masked diff and writes nothing", () => {
    const id = idOf("echo two");
    const { status, stdout } = hook(["disable", id, "--dry-run"]);
    assert.equal(status, 0);
    assert.match(
      stdout,
      /Turn off hook .*PreToolUse Bash echo two \(user settings\)/
    );
    assert.match(stdout, /^-.*"echo two"/m);
    assert.match(stdout, /Dry run: nothing written/);
    assert.doesNotMatch(stdout, new RegExp(SECRET));
    assert.equal(settings(), SETTINGS);
    assert.equal(existsSync(parkedFile()), false);
  });

  test("--yes parks it (0600), keeps its sibling and the real secret in the file, and lists it as off", () => {
    const id = idOf("echo two");
    const { status, stdout } = hook(["disable", id, "--yes"]);
    assert.equal(status, 0, stdout);
    assert.ok(settings().includes(`echo one --token ${SECRET}`));
    assert.ok(!settings().includes("echo two"));
    // biome-ignore lint/suspicious/noBitwiseOperators: masks the permission bits of a file mode
    assert.equal(statSync(parkedFile()).mode & 0o777, 0o600);
    assert.match(stdout, /is off \(saved in .*parked-hooks\.json/);
    assert.match(
      hook(["list"]).stdout,
      new RegExp(
        `^${id}\\s+user\\s+off\\s+PreToolUse\\s+Bash\\s+echo two$`,
        "m"
      )
    );
    assert.match(hook(["disable", id, "--yes"]).stdout, /already off/);
  });

  test("enable puts it back in the same group and drops the saved copy", () => {
    const id = idOf("echo two");
    hook(["disable", id, "--yes"]);
    const { status, stdout } = hook(["enable", id, "--yes"]);
    assert.equal(status, 0, stdout);
    const json = JSON.parse(settings());
    assert.deepEqual(
      json.hooks.PreToolUse[0].hooks.map(
        (one: Record<string, any>) => one.command
      ),
      [`echo one --token ${SECRET}`, "echo two"]
    );
    assert.equal(json.hooks.PreToolUse[0].matcher, "Bash");
    assert.deepEqual(JSON.parse(readFileSync(parkedFile(), "utf8")).hooks, {});
    assert.equal(idOf("echo two"), id);
    assert.match(hook(["enable", id, "--yes"]).stdout, /already on/);
  });

  test("disabling the only hook of an event drops the event; enable recreates it", () => {
    const id = idOf("echo stop");
    hook(["disable", id, "--yes"]);
    assert.equal(JSON.parse(settings()).hooks.Stop, undefined);
    hook(["enable", id, "--yes"]);
    assert.deepEqual(JSON.parse(settings()).hooks.Stop, [
      { hooks: [{ type: "command", command: "echo stop" }] },
    ]);
  });

  test("fix --undo brings the file back; enable then notices the hook is already there", () => {
    const id = idOf("echo two");
    hook(["disable", id, "--yes"]);
    assert.equal(fx.run(["fix", "--undo", "--yes"]).status, 0);
    assert.equal(settings(), SETTINGS);
    const again = hook(["enable", id, "--yes"]);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /already in .*settings\.json/);
    assert.equal(settings(), SETTINGS);
  });

  test("project scope edits the project file; the same hook in two scopes needs --scope", () => {
    mkdirSync(join(fx.repo, ".claude"), { recursive: true });
    const file = join(fx.repo, ".claude/settings.json");
    writeFileSync(
      file,
      JSON.stringify(
        {
          hooks: {
            Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }],
          },
        },
        null,
        2
      )
    );
    const trust = join(fx.configDir, ".claude.json");
    writeFileSync(
      trust,
      JSON.stringify({
        projects: { [fx.repo]: { hasTrustDialogAccepted: true } },
      })
    );
    const id = idOf("echo stop");
    const ambiguous = hook(["disable", id, "--yes"]);
    assert.equal(ambiguous.status, 2);
    assert.match(
      ambiguous.stderr,
      /exists in user and project settings; pick one with --scope/
    );
    assert.equal(
      hook(["disable", id, "--scope", "project", "--yes"]).status,
      0
    );
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).hooks, {});
    assert.ok(settings().includes("echo stop"));
  });

  test("refuses plugin hooks with who manages them, and bad selectors", () => {
    const { id } = addPlugin(fx, { enabled: true });
    const dir = join(fx.configDir, "plugins/cache/mkt/demo/1.0.0/hooks");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "echo plugin" }] },
          ],
        },
      })
    );
    const pluginId = idOf("echo plugin");
    const refused = hook(["disable", pluginId, "--yes"]);
    assert.equal(refused.status, 1);
    assert.match(
      refused.stderr,
      new RegExp(
        `plugin ${id} , which manages it|plugin ${id}, which manages it`
      )
    );
    assert.equal(hook(["disable", "zz", "--yes"]).status, 2);
    assert.equal(hook(["disable", "deadbeef", "--yes"]).status, 1);
  });

  test("refuses an unparsable settings file without touching it", () => {
    const id = idOf("echo two");
    writeFileSync(settingsPath(), "{ not json");
    assert.notEqual(hook(["disable", id, "--yes"]).status, 0);
    assert.equal(settings(), "{ not json");
  });
});

describe("agentry hook remove", () => {
  test("deletes the entry, backs up the file, undo restores it; no saved copy is kept", () => {
    const id = idOf("echo two");
    const { status, stdout } = hook(["remove", id, "--yes"]);
    assert.equal(status, 0, stdout);
    assert.ok(!settings().includes("echo two"));
    assert.equal(existsSync(parkedFile()), false);
    assert.equal(fx.run(["fix", "--undo", "--yes"]).status, 0);
    assert.equal(settings(), SETTINGS);
  });

  test("removing a parked hook deletes the saved copy, with --yes", () => {
    const id = idOf("echo two");
    hook(["disable", id, "--yes"]);
    assert.match(
      hook(["remove", id, "--dry-run"]).stdout,
      /would delete the parked copy/
    );
    assert.equal(hook(["remove", id]).status, 1);
    assert.equal(hook(["remove", id, "--yes"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(parkedFile(), "utf8")).hooks, {});
  });
});
