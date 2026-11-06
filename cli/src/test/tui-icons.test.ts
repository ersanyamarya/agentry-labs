import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { iconMode, iconsFor, toAscii } from "../tui/icons.js";
import { createUi, KEYS, stripAnsi } from "./helpers/tui.js";

const KINDS = [
  "skill",
  "agent",
  "rule",
  "plugin",
  "mcp",
  "hook",
  "on",
  "off",
  "warning",
  "error",
] as const;

describe("icons", () => {
  test("unicode is the default and covers every kind", () => {
    assert.equal(iconMode({}), "unicode");
    const icons = iconsFor({});
    for (const kind of KINDS) {
      assert.ok(icons[kind], kind);
    }
    assert.ok(Object.values(icons).some((icon) => /[^ -~]/.test(icon)));
  });

  test("NO_COLOR, TERM=dumb and AGENTRY_ASCII=1 give plain ASCII", () => {
    for (const env of [
      { NO_COLOR: "1" },
      { TERM: "dumb" },
      { AGENTRY_ASCII: "1" },
      { NO_COLOR: "1", AGENTRY_ICONS: "nerd" },
    ]) {
      assert.equal(iconMode(env), "ascii", JSON.stringify(env));
      for (const icon of Object.values(iconsFor(env))) {
        assert.match(icon, /^[ -~]+$/, JSON.stringify(env));
      }
    }
  });

  test("an empty NO_COLOR does not switch to ASCII", () => {
    assert.equal(iconMode({ NO_COLOR: "" }), "unicode");
  });

  test("AGENTRY_ICONS=nerd gives private-use glyphs for the kinds", () => {
    assert.equal(iconMode({ AGENTRY_ICONS: "nerd" }), "nerd");
    assert.match(iconsFor({ AGENTRY_ICONS: "nerd" }).skill, /[-]/);
  });
});

describe("ascii rendering", () => {
  test("toAscii maps every glyph the UI draws to one ASCII column", () => {
    const glyphs = "●○◐✖▲ℹ▾▸─│·…←→↑↓";
    const out = toAscii(glyphs);
    assert.equal([...out].length, [...glyphs].length);
    assert.match(out, /^[ -~]+$/);
  });

  test("every tab renders pure ASCII under AGENTRY_ASCII=1", async () => {
    const ui = createUi({ env: { AGENTRY_ASCII: "1" }, fit: true, plugin: {} });
    try {
      await ui.ready();
      await ui.resize(130, 40);
      for (const tab of [0, 1, 2, 3, 4, 5, 6, 7]) {
        if (tab > 0) {
          await ui.press(KEYS.right);
        }
        const frame = stripAnsi(ui.frame())
          .split("\n")
          .filter((line) => !line.startsWith("agentry  "))
          .join("\n");
        assert.doesNotMatch(frame, /[^ -~\n]/, `tab ${tab + 1}`);
      }
    } finally {
      ui.stop();
    }
  });
});
