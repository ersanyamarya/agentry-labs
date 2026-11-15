import assert from "node:assert/strict";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { messages } from "@agentry/core/messages";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createUi, KEYS, squash, stripAnsi } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());

describe("navigation", () => {
  beforeEach(async () => {
    ui = createUi();
    await ui.ready();
  });

  test("shows the sections in the rail, then switches with arrows and number keys", async () => {
    for (const name of [
      "Skills",
      "MCP",
      "Hooks",
      "Plugins",
      "Rules",
      "Agents",
      "Catalog",
      "Doctor",
      "Backups",
    ]) {
      assert.match(ui.rail(), new RegExp(name));
    }
    await ui.press(KEYS.right);
    await ui.until(/server: demo/);
    await ui.press(KEYS.left);
    await ui.until(/Library\s+Skills/);
    await ui.press("8");
    await ui.until(/warnings?, \d+ info|errors, \d+ warnings/);
    assert.match(ui.frame()!, /\[fake-bad\]/);
  });

  test("moves between rows and shows the selected row's details", async () => {
    assert.match(ui.frame()!, />▸ audit/);
    await ui.press(KEYS.down);
    assert.match(ui.frame()!, />▸ video/);
    assert.match(ui.frame()!, /library bundle: video/);
    await ui.press(KEYS.up);
    assert.match(ui.frame()!, /library bundle: audit/);
  });

  test("? opens the key map and esc closes it", async () => {
    await ui.press("?");
    await ui.until(/Keys \(\? or esc to close\)/);
    assert.match(ui.frame()!, /switch project/);
    await ui.press(KEYS.esc);
    await ui.until(/Library\s+Skills/);
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

  test("space toggles a row in this project, g toggles it for all projects, and enter expands the bundle", async () => {
    await ui.press(KEYS.down, KEYS.enter);
    await ui.until(/trim/);
    await ui.press(KEYS.down, KEYS.down, KEYS.space);
    await ui.until(/video\/trim on in/);
    assert.ok(
      lstatSync(join(ui.fx.repo, ".claude/skills/trim")).isSymbolicLink()
    );
    await ui.until(/trim\s+library\s+~10\s+●\s+○/);
    await ui.press(KEYS.space);
    await ui.until(/video\/trim off in/);
    assert.ok(!existsSync(join(ui.fx.repo, ".claude/skills/trim")));

    await ui.press("g");
    await ui.until(/video\/trim on in/);
    await ui.until(/trim\s+library\s+~10\s+○\s+●/);
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
    await ui.press("8");
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
    await ui.press("u", "8", KEYS.enter, KEYS.space, KEYS.right);
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

describe("help per tab", () => {
  const { help } = messages();
  const TABS = Object.keys(help.tabs);

  test("? on Skills lists the Skills keys and the shared ones, not Catalog or Backups keys", async () => {
    ui = createUi();
    await ui.ready();
    await ui.press("?");
    await ui.until(/Keys \(\? or esc to close\)/);
    assert.match(ui.frame()!, /g {12}loaded\/not loaded for all projects/);
    assert.match(ui.frame()!, /m {12}move: all projects/);
    assert.match(ui.frame()!, /q {12}quit/);
    assert.doesNotMatch(ui.frame()!, /fetch the latest catalog/);
    assert.doesNotMatch(ui.frame()!, /delete the backups 30\+ days old/);
    assert.doesNotMatch(ui.frame()!, /restore a removed skill/);
    assert.doesNotMatch(ui.frame()!, /install a plugin/);
  });

  test("Catalog and Backups help list their own keys and no Skills-only ones", async () => {
    ui = createUi();
    await ui.ready();
    await ui.press("7");
    await ui.press("?");
    await ui.until(/Keys \(\? or esc to close\)/);
    assert.match(ui.frame()!, /f {12}fetch the latest catalog/);
    assert.doesNotMatch(ui.frame()!, /move: all projects/);
    assert.doesNotMatch(ui.frame()!, /delete the backups 30\+ days old/);
    await ui.press("?");
    await ui.press("9");
    await ui.press("?");
    await ui.until(/d {12}delete the backups 30\+ days old/);
    assert.doesNotMatch(ui.frame()!, /fetch the latest catalog/);
    assert.doesNotMatch(ui.frame()!, /move: all projects/);
  });

  test("on an 80-column terminal every tab's help fits: no line wider than 80, no truncation mark, every row's last word shown", async () => {
    ui = createUi({ size: { cols: 80, rows: 80 } });
    await ui.ready();
    for (const [index, name] of TABS.entries()) {
      await ui.press(String(index + 1));
      await ui.press("?");
      await ui.until(/Keys \(\? or esc to close\)/);
      const raw = stripAnsi(ui.raw());
      for (const line of raw.split("\n")) {
        assert.ok(line.length <= 80, `${name}: line wider than 80: ${line}`);
      }
      const box = stripAnsi(ui.frame()!)
        .split("\n")
        .filter((line) => line.includes("│"))
        .join("\n");
      assert.doesNotMatch(box, /…/, `${name}: help is truncated`);
      const text = squash(ui.raw());
      for (const [, what] of [...help.tabs[name]!, ...help.shared]) {
        assert.ok(
          text.includes(what.split(" ").at(-1)!),
          `${name}: ${what} missing`
        );
      }
      await ui.press("?");
    }
  });
});

describe("why-not hint", () => {
  test("a skill folder that cannot be toggled says why under the list and as the first details line, before any key", async () => {
    ui = createUi({ personal: ["notes"] });
    await ui.ready();
    await ui.moveTo(/^>\s+notes/);
    const why =
      /Folder in ~\/\.claude\/skills, loaded in all projects\. m moves it/;
    assert.match(squash(ui.frame()!), why);
    const hits = squash(ui.frame()!).split("m moves it").length - 1;
    assert.equal(hits, 2, "status line and details both carry it");
    await ui.moveTo(/^>\s+proj/);
    assert.doesNotMatch(squash(ui.frame()!), /Folder in ~\/\.claude\/skills/);
  });
});
