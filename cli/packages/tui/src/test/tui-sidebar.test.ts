// The left rail: groups and counts in design order, Doctor's error count, `tab` focus, and the keys that switch sections.
import assert from "node:assert/strict";
import React from "react";
import { afterEach, describe, test } from "vitest";

// Real escape codes are needed to see colour; NO_COLOR must be unset for the colour case.
process.env.FORCE_COLOR = "1";
process.env.NO_COLOR = "";

const { render } = await import("ink-testing-library");
const { Sidebar, sidebarWidth, SectionLine, TAB_NAMES } = await import(
  "../components/sidebar.js"
);
const { ThemeContext } = await import("../theme.js");
const { iconsFor } = await import("../icons.js");
const { createUi, KEYS, stripAnsi } = await import("./helpers/tui.js");

const RED = "\u001B[31m";

const drawn = (color: boolean, props: Record<string, unknown>) =>
  render(
    React.createElement(
      ThemeContext.Provider,
      { value: { ascii: false, color, icons: iconsFor({}) } },
      React.createElement(Sidebar as never, props)
    )
  ).lastFrame() ?? "";

const DOCTOR = {
  tab: 6,
  project: "/work/app",
  counts: { Skills: 12, Doctor: 3 },
  summary: { error: 2, warning: 1, tokens: 3100 },
};

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());

describe("the rail", () => {
  test("section order is the design order, which the 1-8 keys follow", () => {
    assert.deepEqual(TAB_NAMES, [
      "Skills",
      "MCP",
      "Hooks",
      "Plugins",
      "Rules",
      "Catalog",
      "Doctor",
      "Backups",
    ]);
  });

  test("it is 22 columns from 90, 16 from 70, and hidden below that", () => {
    assert.equal(sidebarWidth(120), 22);
    assert.equal(sidebarWidth(90), 22);
    assert.equal(sidebarWidth(89), 16);
    assert.equal(sidebarWidth(70), 16);
    assert.equal(sidebarWidth(69), 0);
  });

  test("it draws the group labels, the items and their counts in order", () => {
    const frame = stripAnsi(drawn(true, DOCTOR));
    assert.match(
      frame,
      /LIBRARY[\s\S]*Skills\s+12[\s\S]*MCP[\s\S]*Hooks[\s\S]*Plugins[\s\S]*Rules[\s\S]*DISCOVER[\s\S]*Catalog[\s\S]*HEALTH[\s\S]*› Doctor\s+3[\s\S]*Backups/
    );
    assert.match(frame, /● 3 problems/);
  });

  test("Doctor's count is red when it holds errors; without colour it says err", () => {
    const colour = drawn(true, DOCTOR);
    assert.ok(colour.includes(`${RED}3`), "the count is red");
    const plain = drawn(false, DOCTOR);
    assert.doesNotMatch(plain, /\u001B\[3[0-7]m/);
    assert.match(plain, /Doctor\s+3 err/);
  });

  test("Doctor's count is not red when it holds only warnings", () => {
    const frame = drawn(true, {
      ...DOCTOR,
      summary: { error: 0, warning: 3, tokens: 1 },
    });
    assert.ok(!frame.includes(`${RED}3`));
  });

  test("the focused rail marks its active item inverse, so focus shows without colour", () => {
    assert.ok(drawn(false, { ...DOCTOR, focused: true }).includes("\u001B[7m"));
    assert.ok(!drawn(false, DOCTOR).includes("\u001B[7m"));
  });

  test("under 70 columns a one-line section header takes its place", () => {
    const line = render(
      React.createElement(SectionLine as never, {
        tab: 6,
        counts: { Doctor: 3 },
        summary: { error: 2, warning: 0, tokens: 1 },
      })
    ).lastFrame();
    assert.match(
      stripAnsi(line ?? ""),
      /agentry\s+‹ Doctor 3 ›\s+7\/8\s+2 problems/
    );
  });
});

describe("keys", () => {
  test("tab moves the keys to the rail; up and down then change the section; enter goes back to the list", async () => {
    ui = createUi();
    await ui.ready();
    assert.match(ui.rail(), /› Skills/);
    await ui.press(KEYS.tab);
    await ui.press(KEYS.down);
    await ui.untilRail(/› MCP/);
    await ui.until(/server: demo/);
    await ui.press(KEYS.down, KEYS.down);
    await ui.untilRail(/› Plugins/);
    await ui.press(KEYS.up);
    await ui.untilRail(/› Hooks/);
    await ui.press(KEYS.enter);
    await ui.press(KEYS.right);
    await ui.untilRail(/› Plugins/);
  });

  test("while the rail has the keys, the list does not move", async () => {
    ui = createUi();
    await ui.ready();
    await ui.press(KEYS.tab, KEYS.down, KEYS.up);
    await ui.untilRail(/› Skills/);
    assert.match(ui.frame(), />▸ audit/);
    await ui.press(KEYS.tab, KEYS.down);
    await ui.until(/>▸ video/);
  });

  test("1-8 and the arrows follow the sidebar order", async () => {
    ui = createUi();
    await ui.ready();
    const order = [
      "Skills",
      "MCP",
      "Hooks",
      "Plugins",
      "Rules",
      "Catalog",
      "Doctor",
      "Backups",
    ];
    for (const [index, name] of order.entries()) {
      await ui.press(String(index + 1));
      await ui.untilRail(new RegExp(`› ${name}\\b`));
    }
    await ui.press(KEYS.right);
    await ui.untilRail(/› Skills/);
    await ui.press(KEYS.left);
    await ui.untilRail(/› Backups/);
  });

  test("tab does not move the keys while a search is being typed", async () => {
    ui = createUi();
    await ui.ready();
    await ui.press("/");
    await ui.until(/\/_/);
    await ui.press(KEYS.tab);
    assert.match(ui.rail(), /› Skills/);
    assert.ok(!ui.rail().includes("\u001B[7m"), "the rail is not focused");
  });
});
