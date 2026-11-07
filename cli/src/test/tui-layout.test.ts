import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";
import { compactTokens } from "../tui/layout.js";
import { skillRows } from "../tui/rows.js";
import type { Data } from "../tui/types.js";
import { failedText } from "../tui/use-flow.js";
import { createUi, KEYS, stripAnsi } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
beforeEach(async () => {
  ui = createUi({ personal: ["notes"], plugin: {} });
  await ui.ready();
});
afterEach(() => ui?.stop());

test("the header is one line with the path left and tokens and problems right, and the Skills tab explains its colours", () => {
  const [header] = stripAnsi(ui.frame()!).split("\n");
  assert.match(header, /^agentry {2}\S.*~[\d.]+k? tokens {2}· {2}1 warning$/);
  assert.doesNotMatch(ui.frame()!, /skill-description/);
  assert.doesNotMatch(ui.frame()!, /cost: ~<100/);
});

test("sections are bold headers with no rule and a blank line between them", () => {
  assert.match(ui.frame()!, /^\s*Shelf\s+Skills/m);
  assert.match(ui.frame()!, /^Global skills\s*$/m);
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
  assert.match(ui.frame()!, /^Global skills\s*$/m);
  assert.match(ui.frame()!, /^This project only\s*$/m);
  assert.doesNotMatch(ui.frame()!, /notes\s+personal/);
  await ui.press("4");
  await ui.until(/●\s+demo@mkt\s+global\s+1\.0\.0/);
  await ui.press("2");
  await ui.until(/demo\s+project\s+stdio\s+pending-approval/);
});

test("the footer lists only the keys of the current tab", async () => {
  assert.match(ui.frame()!, /space project {3}g global {3}enter expand/);
  await ui.press("2");
  await ui.until(/e (open file|edit)/);
  assert.doesNotMatch(ui.frame()!, /s shelve/);
  await ui.press("4");
  await ui.until(/space on\/off/);
  await ui.press("5");
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
  assert.match(ui.frame()!, /s {12}Skills: move a global skill onto the shelf/);
  assert.match(ui.frame()!, /u {12}Skills: unshelve a skill/);
  assert.match(
    ui.frame()!,
    /● on \/ active green, ○ off \/ disabled gray, ◐ partial yellow/
  );
  await ui.press(KEYS.esc);
});

test("the footer follows the selected row: a global skill offers shelve and open, not the on/off keys", async () => {
  await ui.moveTo(/^>\s+notes/);
  assert.match(
    ui.frame()!,
    /s shelve {3}o (move to this project only|this project) {3}x remove {3}X (remove, no copy|no copy) {3}e (open file|edit)/
  );
  assert.doesNotMatch(ui.frame()!, /space project/);
});

test("compactTokens: thousands get one decimal and a k, small counts stay whole, unknown is a dash", () => {
  assert.equal(compactTokens(3100), "~3.1k");
  assert.equal(compactTokens(3000), "~3k");
  assert.equal(compactTokens(840), "~840");
  assert.equal(compactTokens(null), "-");
});

test("the tabs are plain words with counts: no digits, no icons, no rule under them", () => {
  const lines = stripAnsi(ui.frame()!).split("\n");
  const [, tabs, under] = lines;
  assert.match(
    tabs,
    /^Skills \d+ {2,3}MCP \d+ {2,3}Hooks \d+ {2,3}Plugins \d+ {2,3}Doctor \d+/
  );
  assert.doesNotMatch(tabs, /[✦⇄⚑⬡✚☰⟲§]|\(\d+\)|\d [A-Z]/);
  assert.doesNotMatch(under, /^─+$/);
});

test("the footer ends in `1-8 tab   ? help`, right-aligned, and has no rule above it", async () => {
  await ui.press("4");
  await ui.until(/space on\/off/);
  const last = stripAnsi(ui.frame()!).trimEnd().split("\n").at(-1) ?? "";
  assert.match(last, /^space on\/off {3}i install.* {3}1-8 tab {3}\? help$/);
  assert.doesNotMatch(last, /│/);
  assert.equal([...last].length, 100);
});

test("when the footer is short of room, `1-8 tab` goes first and `? help` stays", async () => {
  ui.stop();
  ui = createUi({ fit: true });
  await ui.ready();
  await ui.resize(40, 30);
  const last = stripAnsi(ui.frame()!).trimEnd().split("\n").at(-1) ?? "";
  assert.match(last, /\? help$/);
  assert.doesNotMatch(last, /1-8 tab/);
  assert.ok([...last].length <= 40);
});

test("Skills: Project and Global hold only a mark, the token total closes the list, and there is no colour legend", () => {
  const frame = stripAnsi(ui.frame()!);
  assert.match(frame, /Shelf\s+Skills\s+Cost\s+Project\s+Global/);
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
