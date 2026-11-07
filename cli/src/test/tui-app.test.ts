import assert from "node:assert/strict";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createUi, KEYS } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());

describe("navigation", () => {
  beforeEach(async () => {
    ui = createUi();
    await ui.ready();
  });

  test("shows the five tabs, then switches with arrows and number keys", async () => {
    for (const name of ["Skills", "MCP", "Hooks", "Plugins", "Doctor"]) {
      assert.match(ui.frame()!, new RegExp(name));
    }
    await ui.press(KEYS.right);
    await ui.until(/server: demo/);
    await ui.press(KEYS.left);
    await ui.until(/Shelf\s+Skills/);
    await ui.press("5");
    await ui.until(/warnings?, \d+ info|errors, \d+ warnings/);
    assert.match(ui.frame()!, /\[fake-bad\]/);
  });

  test("moves between rows and shows the selected row's details", async () => {
    assert.match(ui.frame()!, />▸ audit/);
    await ui.press(KEYS.down);
    assert.match(ui.frame()!, />▸ video/);
    assert.match(ui.frame()!, /shelf group: video/);
    await ui.press(KEYS.up);
    assert.match(ui.frame()!, /shelf group: audit/);
  });

  test("? opens the key map and esc closes it", async () => {
    await ui.press("?");
    await ui.until(/Keys \(\? or esc to close\)/);
    assert.match(ui.frame()!, /switch project/);
    await ui.press(KEYS.esc);
    await ui.until(/Shelf\s+Skills/);
    assert.doesNotMatch(ui.frame()!, /Keys \(/);
  });

  test("the project picker lists the current repo and remembers the pick", async () => {
    await ui.press("p");
    await ui.until(/Project \(enter select/);
    assert.match(ui.frame()!, /repo {2}\(current\)/);
    await ui.press(KEYS.enter);
    await ui.until(/Project: .*repo/);
    const saved = JSON.parse(
      readFileSync(join(ui.fx.configDir, "cache/agentry/ui.json"), "utf8")
    );
    assert.deepEqual(saved.recents, [ui.fx.repo]);
  });
});

describe("skills tab", () => {
  beforeEach(async () => {
    ui = createUi();
    await ui.ready();
  });

  test("shows the same token cost as agentry shelf list", async () => {
    const listed = ui.fx.run(["shelf", "list"]).stdout;
    assert.match(listed, /video .*~10 tokens/);
    assert.match(ui.frame()!, /video\s+2 skills\s+~10\s+○\s+○/);
  });

  test("space toggles a row in this project, G toggles it globally, and enter expands the group", async () => {
    await ui.press(KEYS.down, KEYS.enter);
    await ui.until(/trim/);
    await ui.press(KEYS.down, KEYS.down, KEYS.space);
    await ui.until(/video\/trim on in/);
    assert.ok(
      lstatSync(join(ui.fx.repo, ".claude/skills/trim")).isSymbolicLink()
    );
    await ui.until(/trim\s+shelf\s+~10\s+●\s+○/);
    await ui.press(KEYS.space);
    await ui.until(/video\/trim off in/);
    assert.ok(!existsSync(join(ui.fx.repo, ".claude/skills/trim")));

    await ui.press("g");
    await ui.until(/video\/trim on in/);
    await ui.until(/trim\s+shelf\s+~10\s+○\s+●/);
    assert.ok(lstatSync(join(ui.fx.configDir, "skills/trim")).isSymbolicLink());
    assert.ok(!existsSync(join(ui.fx.repo, ".claude/skills/trim")));
  });

  test("space on a group links all its skills; the real home is untouched", async () => {
    await ui.press(KEYS.space);
    await ui.until(/audit on in/);
    assert.deepEqual(
      readdirSync(join(ui.fx.repo, ".claude/skills")).filter(
        (name) => name !== "proj"
      ),
      ["review"]
    );
  });
});

describe("source files and secrets", () => {
  test("e without $EDITOR says so and runs nothing", async () => {
    let spawned = false;
    ui = createUi({
      env: {},
      spawn: () => {
        spawned = true;
        return { status: 0 };
      },
    });
    await ui.ready();
    await ui.press("2");
    await ui.until(/server: demo/);
    await ui.press("e");
    await ui.until(/\$EDITOR is not set/);
    assert.equal(spawned, false);
  });

  test("e with $EDITOR hands the terminal over: raw mode off, inherited stdio, file path appended", async () => {
    const calls: {
      command: string;
      args: string[];
      options: { stdio: string };
    }[] = [];
    ui = createUi({
      env: { EDITOR: "myedit -w" },
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });
    await ui.ready();
    await ui.press("2");
    await ui.until(/server: demo/);
    await ui.press("e");
    await ui.until(/Closed myedit/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "myedit");
    assert.deepEqual(calls[0].args, ["-w", join(ui.fx.repo, ".mcp.json")]);
    assert.equal(calls[0].options.stdio, "inherit");
  });

  test("MCP details show masked secrets only", async () => {
    ui = createUi();
    await ui.ready();
    await ui.press("2");
    await ui.until(/server: demo/);
    assert.match(ui.frame()!, /env API_KEY=<masked>/);
    assert.doesNotMatch(ui.frame()!, /supersecret/);
  });
});

describe("doctor tab: fix and undo", () => {
  const backups = () =>
    existsSync(join(ui.fx.configDir, "backups/agentry"))
      ? readdirSync(join(ui.fx.configDir, "backups/agentry"))
      : [];
  const text = () => readFileSync(ui.target, "utf8");

  beforeEach(async () => {
    ui = createUi();
    await ui.ready();
    await ui.press("5");
    await ui.until(/\[fake-bad\]/);
  });

  test("enter previews the diff and n cancels without writing anything", async () => {
    await ui.press(KEYS.enter);
    await ui.until(/Fix preview \(dry run\)/);
    assert.match(ui.frame()!, /-\s+"value": "BAD"/);
    assert.match(ui.frame()!, /\+\s+"value": "GOOD"/);
    assert.match(ui.frame()!, /Apply\?\s+y yes\s+n no/);
    await ui.press("n");
    await ui.until(/Cancelled; nothing written/);
    assert.match(text(), /BAD/);
    assert.deepEqual(backups(), []);
  });

  test("keys other than y or n write nothing while a preview waits", async () => {
    await ui.press(KEYS.enter);
    await ui.until(/Fix preview/);
    await ui.press("u", "5", KEYS.enter, KEYS.space, KEYS.right);
    assert.match(text(), /BAD/);
    assert.deepEqual(backups(), []);
    assert.match(ui.frame()!, /Fix preview/);
  });

  test("y applies through the engine: backup, write, verify; then u and y undo it", async () => {
    await ui.press(KEYS.enter);
    await ui.until(/Fix preview/);
    await ui.press("y");
    await ui.until(/verify \[fake-bad\].*: gone/);
    assert.match(text(), /GOOD/);
    const [set] = backups();
    assert.equal(backups().length, 1);
    assert.match(
      readFileSync(
        join(ui.fx.configDir, "backups/agentry", set, "manifest.json"),
        "utf8"
      ),
      /"status": "done"/
    );
    await ui.until(/Fix applied and verified/);

    await ui.press("u");
    await ui.until(/Undo preview/);
    assert.match(text(), /GOOD/);
    await ui.press("y");
    await ui.until(/Marked .* as undone/);
    assert.match(text(), /BAD/);
  });

  test("a finding without a fix says why and offers nothing to apply", async () => {
    await ui.press(KEYS.down);
    await ui.until(/>\s+\[fake-nofix\]/);
    await ui.press(KEYS.enter);
    await ui.until(/Nothing can be applied here/);
    assert.match(ui.frame()!, /No automatic fix is registered/);
    await ui.press("y");
    assert.match(text(), /BAD/);
    assert.deepEqual(backups(), []);
  });
});
