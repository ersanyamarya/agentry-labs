import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { iconMode, iconsFor, toAscii } from "../tui/icons.js";
import { catalogRows, doctorRows, findingKind } from "../tui/rows.js";
import type { Data } from "../tui/types.js";
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

describe("kind glyphs on the tabs where kinds mix", () => {
  test("findingKind maps doctor rule ids to a kind, and leaves the rest bare", () => {
    assert.equal(findingKind("dup-skill-name"), "skill");
    assert.equal(findingKind("shelf-duplicate"), "skill");
    assert.equal(findingKind("broken-skill-link"), "skill");
    assert.equal(findingKind("dup-mcp-scope"), "mcp");
    assert.equal(findingKind("dup-mcp-plugin"), "mcp");
    assert.equal(findingKind("missing-mcp-command"), "mcp");
    assert.equal(findingKind("missing-hook-file"), "hook");
    assert.equal(findingKind("dup-plugin-scope"), "plugin");
    assert.equal(findingKind("plugin-not-installed"), "plugin");
    assert.equal(findingKind("unset-placeholder"), undefined);
    assert.equal(findingKind("stale-name"), undefined);
    assert.equal(findingKind("something-new"), undefined);
  });

  const findings = {
    doctor: {
      findings: [
        { id: "dup-skill-name", severity: "error", message: "m", file: "/f" },
        { id: "stale-name", severity: "warning", message: "n", file: "/f" },
      ],
    },
  } as unknown as Data;
  const entry = (kind: string) => ({
    id: `${kind}/x`,
    kind,
    name: "x",
    bundle: "b",
    tokens: 1,
    description: "",
  });
  const catalog = {
    catalog: {
      fetched: true,
      entries: ["skill", "agent", "rule", "mcp"].map(entry),
    },
  } as unknown as Data;

  for (const [name, env] of [
    ["unicode", {}],
    ["nerd", { AGENTRY_ICONS: "nerd" }],
    ["ascii", { AGENTRY_ASCII: "1" }],
  ] as const) {
    test(`${name}: Doctor rows lead with the kind glyph, Catalog rows with the kind of item`, () => {
      const icons = iconsFor(env);
      const [, skillFinding] = doctorRows(findings, icons).filter(
        (row) => row.kind === "finding"
      );
      assert.equal(
        skillFinding.label.startsWith(`  ${icons.skill} [`),
        false,
        "the stale-name finding has no glyph"
      );
      const [first] = doctorRows(findings, icons).filter(
        (row) => row.kind === "finding"
      );
      assert.ok(first.label.startsWith(`  ${icons.skill} [dup-skill-name]`));
      const rows = catalogRows(catalog, icons).filter(
        (row) => row.kind === "catalog"
      );
      assert.deepEqual(
        rows.map((row) => row.label.trim().split(" ")[0]),
        [icons.skill, icons.agent, icons.rule, icons.mcp]
      );
    });
  }
});
