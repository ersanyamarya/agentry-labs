import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { tokenBreakdown } from "../tui/rows.js";
import type { Data } from "../tui/types.js";
import { filterRows } from "../tui/use-list.js";
import { createUi, KEYS, stripAnsi } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());

const selected = () =>
  stripAnsi(ui.frame()!)
    .split("\n")
    .find((line) => /^>/.test(line)) ?? "";

describe("filterRows", () => {
  const rows = [
    { id: "h", header: true, label: "Head" },
    { id: "a", label: "  alpha", details: ["note: Beta"] },
    { id: "b", label: "  gamma", details: [] },
  ];
  test("matches label and details in any case and drops headers; an empty filter keeps everything", () => {
    assert.deepEqual(
      filterRows(rows, "ALP").map((row) => row.id),
      ["a"]
    );
    assert.deepEqual(
      filterRows(rows, "beta").map((row) => row.id),
      ["a"]
    );
    assert.deepEqual(
      filterRows(rows, "  ").map((row) => row.id),
      ["h", "a", "b"]
    );
    assert.deepEqual(filterRows(rows, "zzz"), []);
  });
});

describe("/ search", () => {
  test("narrows the Skills rows, q and digits are text while typing, esc clears", async () => {
    ui = createUi({ personal: ["notes"] });
    await ui.ready();
    await ui.press("/");
    await ui.until(/\/_/);
    await ui.press("q", "1", "n", "o");
    await ui.until(/\/q1no_/);
    assert.match(
      ui.frame(),
      /Skills/,
      "q did not quit and 1 did not switch tabs"
    );
    await ui.press(KEYS.esc);
    await ui.press("/", "n", "o", "t", "e", "s", KEYS.enter);
    await ui.until(/filter "notes": \d+ of \d+/);
    assert.match(selected(), /notes/);
    assert.doesNotMatch(stripAnsi(ui.frame()!), /▸ audit/);
    await ui.press(KEYS.esc);
    await ui.until(/▸ audit/);
    assert.doesNotMatch(stripAnsi(ui.frame()!), /filter "/);
  });

  test("works on every tab; esc leaves with the filter cleared", async () => {
    ui = createUi();
    await ui.ready();
    for (const tab of ["2", "3", "4", "5", "6", "7", "8"]) {
      await ui.press(tab, "/", "z", "z", "z");
      await ui.until(/\/zzz_/);
      await ui.press(KEYS.esc);
      assert.doesNotMatch(stripAnsi(ui.frame()!), /\/zzz_/, `tab ${tab}`);
    }
  });
});

describe("m marks and bulk actions", () => {
  test("m marks, M clears, and the status line counts", async () => {
    ui = createUi({ personal: ["notes", "todo"] });
    await ui.ready();
    await ui.moveTo(/^>\s+notes/);
    await ui.press("m", KEYS.down, "m");
    await ui.until(/2 marked/);
    assert.match(stripAnsi(ui.frame()!), /^ ?\*\s+notes/m);
    await ui.press("M");
    await ui.until(/^(?![\s\S]*2 marked)/);
    assert.doesNotMatch(stripAnsi(ui.frame()!), /marked/);
  });

  test("x on marked skills previews all of them in one confirm and one y removes them", async () => {
    ui = createUi({ personal: ["notes", "todo"] });
    await ui.ready();
    await ui.moveTo(/^>\s+notes/);
    await ui.press("m", KEYS.down, "m");
    await ui.press("x");
    await ui.until(/Remove skills: 2 of 2 \(preview\)/);
    assert.match(stripAnsi(ui.frame()!), /[=]= notes ==/);
    assert.match(stripAnsi(ui.frame()!), /[=]= todo ==/);
    assert.ok(
      existsSync(join(ui.fx.configDir, "skills/notes")),
      "a preview removes nothing"
    );
    await ui.press("y");
    await ui.until(/Removed; copies are in/);
    assert.ok(!existsSync(join(ui.fx.configDir, "skills/notes")));
    assert.ok(!existsSync(join(ui.fx.configDir, "skills/todo")));
  });

  test("n cancels a bulk preview and changes nothing", async () => {
    ui = createUi({ personal: ["notes", "todo"] });
    await ui.ready();
    await ui.moveTo(/^>\s+notes/);
    await ui.press("m", KEYS.down, "m", "x");
    await ui.until(/Remove skills: 2 of 2/);
    await ui.press("n");
    await ui.until(/Cancelled; nothing changed/);
    assert.ok(existsSync(join(ui.fx.configDir, "skills/notes")));
    assert.ok(existsSync(join(ui.fx.configDir, "skills/todo")));
  });

  test("space on two marked shelf groups turns both on for this project after one y", async () => {
    ui = createUi();
    await ui.ready();
    await ui.moveTo(/^>.* audit/);
    await ui.press("m", KEYS.down, "m", KEYS.space);
    await ui.until(/Turn on for this project: 2 of 2 \(preview\)/);
    await ui.press("y");
    await ui.until(/Turned on for this project \(2 items\)/);
    assert.ok(
      existsSync(join(ui.fx.repo, ".claude/skills/review")) ||
        existsSync(join(ui.fx.repo, ".claude/skills/trim"))
    );
  });

  test("x on marked Backups rows previews and deletes only the marked ones", async () => {
    ui = createUi({ personal: ["notes", "todo", "keep"] });
    await ui.ready();
    for (const name of ["notes", "todo", "keep"]) {
      await ui.press("/", ...name, KEYS.enter);
      await ui.moveTo(new RegExp(`^>\\s+${name}`));
      await ui.press("x");
      await ui.until(/Remove \S+ \(global\) \(preview\)/);
      await ui.press("y");
      await ui.until(/Removed \S+ \(global\)/);
      await ui.press(KEYS.esc);
    }
    const backups = join(ui.fx.configDir, "backups/agentry/removed");
    assert.equal(readdirSync(backups).length, 3);
    await ui.press("7");
    await ui.until(/d (delete 30\+ days old|prune)/);
    await ui.press("m", KEYS.down, "m", "x");
    await ui.until(/Delete 2 backups \(preview\)/);
    await ui.press("y");
    await ui.until(/Deleted those backups/);
    assert.equal(readdirSync(backups).length, 1);
  });
});

describe("token total", () => {
  test("the breakdown adds up to the header total", () => {
    const skill = (scope: string, tokens: number, state = "active") => ({
      scope,
      tokens,
      state,
    });
    const data = {
      status: {
        tokens: { measured: 60 },
        skills: {
          items: [
            skill("user", 10),
            skill("project", 20),
            skill("plugin", 30),
            skill("user", 99, "disabled"),
          ],
        },
      },
    };
    assert.deepEqual(tokenBreakdown(data as unknown as Data), {
      global: 10,
      project: 20,
      plugins: 30,
      total: 60,
    });
  });

  test("the Skills tab ends with a total row listing global, this project and plugins", async () => {
    ui = createUi();
    await ui.ready();
    await ui.moveTo(/^>\s+Token total/);
    const frame = stripAnsi(ui.frame()!);
    assert.match(frame, /total: ~\d+ tokens/);
    assert.match(frame, /in global: ~\d+/);
    assert.match(frame, /in this project: ~\d+/);
    assert.match(frame, /from plugins: ~\d+/);
  });
});
