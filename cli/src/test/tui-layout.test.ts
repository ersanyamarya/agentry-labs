import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { compactTokens } from "../../packages/tui/src/layout.js";
import { skillRows } from "../../packages/tui/src/rows.js";
import {
  createUi,
  KEYS,
  stripAnsi,
} from "../../packages/tui/src/test/helpers/tui.js";
import type { Data } from "../../packages/tui/src/types.js";
import { failedText } from "../../packages/tui/src/use-flow.js";

let ui: ReturnType<typeof createUi>;
beforeEach(async () => {
  ui = createUi({ personal: ["notes"], plugin: {} });
  await ui.ready();
});
afterEach(() => ui?.stop());

test("the rail shows the project, tokens and problems, and the Skills tab explains its colours", () => {
  const rail = stripAnsi(ui.rail());
  assert.match(rail, /^agentry\s/);
  assert.match(rail, /~[\d.]+k? tokens/);
  assert.match(rail, /● 1 problem\b/);
  assert.doesNotMatch(ui.frame()!, /skill-description/);
  assert.doesNotMatch(ui.frame()!, /cost: ~<100/);
});

test("sections are bold headers with no rule and a blank line between them", () => {
  assert.match(ui.frame()!, /^\s*Library\s+Skills/m);
  assert.match(ui.frame()!, /^Skills for all projects\s*$/m);
  const rows = skillRows({
    groups: [],
    status: {
      skills: {
        items: [
          {
            name: "n",
            scope: "user",
            kind: "file",
            source: "/x/n",
            state: "active",
            tokens: 1,
          },
        ],
      },
      plugins: { items: [] },
    },
  } as unknown as Data);
  assert.deepEqual(
    rows.map((row) => (row.blank ? "blank" : row.header ? "header" : "row")),
    ["header", "row", "blank", "header", "row", "blank", "row"]
  );
  assert.equal(rows.at(-1)!.kind, "total");
});

test("scope badges tag the rows", async () => {
  assert.match(ui.frame()!, /^Skills for all projects\s*$/m);
  assert.match(ui.frame()!, /^Skills for this project only\s*$/m);
  assert.doesNotMatch(ui.frame()!, /notes\s+personal/);
  await ui.press("4");
  await ui.until(/●\s+demo@mkt\s+all projects\s+1\.0\.0/);
  await ui.press("2");
  await ui.until(/demo\s+project\s+stdio\s+pending-approval/);
});

test("the footer lists only the keys of the current tab", async () => {
  assert.match(
    ui.frame()!,
    /space this project {3}g all projects {3}enter expand/
  );
  await ui.press("2");
  await ui.until(/e (open file|edit)/);
  assert.doesNotMatch(ui.frame()!, /s shelve/);
  await ui.press("4");
  await ui.until(/space on\/off/);
  await ui.press("8");
  await ui.until(/enter fix {3}u undo {3}e edit/);
  assert.doesNotMatch(ui.frame()!, /space on\/off/);
});

test("a long path in the details is cut in the middle with an ellipsis, keeping both ends", async () => {
  await ui.moveTo(/^>\s+notes/);
  assert.match(ui.frame()!, /source: .*…\S*\/skills\/notes/);
});

test("the help overlay lists the new keys and the colour legend", async () => {
  await ui.press("?");
  await ui.until(/Keys \(\? or esc to close\)/);
  assert.match(
    ui.frame()!,
    /s {12}Skills: move a skill for all projects to the library/
  );
  assert.match(ui.frame()!, /u {12}Skills: move a skill out of the library/);
  assert.match(
    ui.frame()!,
    /● loaded \/ active green, ○ not loaded \/ disabled gray, ◐ partial yellow/
  );
  await ui.press(KEYS.esc);
});

test("the footer follows the selected row: a skill for all projects offers move to the library and open, not the on/off keys", async () => {
  await ui.moveTo(/^>\s+notes/);
  assert.match(
    ui.frame()!,
    /s move to the library {3}o (move to this project only|this project) {3}x remove {3}X (remove, no copy|no copy) {3}e (open file|edit)/
  );
  assert.doesNotMatch(ui.frame()!, /space project/);
});

test("compactTokens: thousands get one decimal and a k, small counts stay whole, unknown is a dash", () => {
  assert.equal(compactTokens(3100), "~3.1k");
  assert.equal(compactTokens(3000), "~3k");
  assert.equal(compactTokens(840), "~840");
  assert.equal(compactTokens(null), "-");
});

test("the rail lists the sections in three groups with counts: no digits, no icons", () => {
  const rail = stripAnsi(ui.rail());
  assert.match(
    rail,
    /SETUP[\s\S]*Skills\s+\d+[\s\S]*MCP\s+\d+[\s\S]*Hooks\s+\d+[\s\S]*Plugins\s+\d+[\s\S]*Rules\s+\d+[\s\S]*Agents\s+\d+[\s\S]*DISCOVER[\s\S]*Catalog[\s\S]*HEALTH[\s\S]*Doctor\s+\d+[\s\S]*Backups\s+\d+/
  );
  assert.doesNotMatch(rail, /[✦⇄⚑⬡✚☰⟲§]|\(\d+\)|\d [A-Z]/);
  assert.match(rail, /^› Skills/m);
});

test("the footer ends in `tab sidebar   ? help`, right-aligned, and has no rule above it", async () => {
  await ui.press("4");
  await ui.until(/space on\/off/);
  const last = stripAnsi(ui.frame()!).trimEnd().split("\n").at(-1) ?? "";
  assert.match(
    last,
    /^space on\/off {3}i install.* {3}tab sidebar {3}\? help$/
  );
  assert.doesNotMatch(last, /│/);
  assert.equal([...last].length, 102);
});

test("when the footer is short of room, `tab sidebar` goes first and `? help` stays", async () => {
  ui.stop();
  ui = createUi({ fit: true });
  await ui.ready();
  await ui.resize(40, 30);
  const last = stripAnsi(ui.frame()!).trimEnd().split("\n").at(-1) ?? "";
  assert.match(last, /\? help$/);
  assert.doesNotMatch(last, /tab sidebar/);
  assert.ok([...last].length <= 40);
});

test("Skills: This project and All projects hold only a mark, the token total closes the list, and there is no colour legend", () => {
  const frame = stripAnsi(ui.frame()!);
  assert.match(frame, /Library\s+Skills\s+Cost\s+This project\s+All projects/);
  assert.match(frame, /▸ audit\s+1 skills\s+~\d+\s+○\s+○/);
  assert.doesNotMatch(frame, /\bon\b.*\boff\b.*\bpartial\b/);
  assert.match(frame, /Token total \(every session\)\s+~\d+\s*$/m);
  assert.doesNotMatch(frame, /^Totals/m);
});

test("a failed result starts with what failed, and the preview tag is dropped from the title", () => {
  assert.equal(
    failedText("Remove lighthouse-audit (preview)", "EACCES"),
    "✖ Remove lighthouse-audit failed\n\nEACCES"
  );
  assert.equal(
    failedText("Fix preview (dry run)", "boom"),
    "✖ Fix preview failed\n\nboom"
  );
});
