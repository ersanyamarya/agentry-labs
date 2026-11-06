import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createUi, KEYS } from "./helpers/tui.js";

const SECRET = "abcdef0123456789abcdef0123";
const HOOKS = {
  hooks: {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          { type: "command", command: `echo one --token ${SECRET}` },
          { type: "command", command: "echo two" },
        ],
      },
    ],
  },
};

let ui: ReturnType<typeof createUi>;
beforeEach(async () => {
  ui = createUi();
  writeFileSync(
    join(ui.fx.configDir, "settings.json"),
    `${JSON.stringify(HOOKS, null, "\t")}\n`
  );
  await ui.ready();
  await ui.press("r");
  await ui.press("3");
  await ui.until(/PreToolUse\s+Bash/);
});
afterEach(() => ui.stop());

const settings = () =>
  JSON.parse(readFileSync(join(ui.fx.configDir, "settings.json"), "utf8"));
const commands = () =>
  settings().hooks?.PreToolUse?.[0]?.hooks.map(
    (hook: Record<string, any>) => hook.command
  );

describe("Hooks tab: turn off, back on, remove", () => {
  test("the footer offers space, x and e on a settings hook", async () => {
    await ui.moveTo(/^>\s*PreToolUse/);
    await ui.until(/space (turn off \(saved\)|off)/);
    assert.match(ui.frame()!, /x remove/);
    assert.match(ui.frame()!, /e (open file|edit)/);
  });

  test("space previews with the secret masked; n cancels and changes nothing", async () => {
    await ui.moveTo(/^>\s*PreToolUse/);
    await ui.press(KEYS.space);
    await ui.until(/Turn off hook [0-9a-f]{8} \(preview\)/);
    assert.match(
      ui.frame()!,
      /Turn off hook [0-9a-f]{8}: PreToolUse Bash echo one --token <masked>/
    );
    assert.doesNotMatch(ui.frame()!, new RegExp(SECRET));
    await ui.press("n");
    await ui.until(/Cancelled; nothing changed/);
    assert.equal(commands().length, 2);
  });

  test("y turns it off (○ off row stays listed), space on that row puts it back", async () => {
    await ui.moveTo(/^>\s*PreToolUse/);
    await ui.press(KEYS.space);
    await ui.until(/Turn off hook/);
    await ui.press("y");
    await ui.until(/is off \(saved\)/);
    assert.equal(commands().length, 1);
    await ui.until(/PreToolUse\s+Bash\s+.*○ off|○ off/);
    await ui.moveTo(/^>.*○ off/);
    await ui.press(KEYS.space);
    await ui.until(/Turn on hook/);
    await ui.press("y");
    await ui.until(/is back on/);
    assert.equal(commands().length, 2);
    assert.doesNotMatch(ui.frame()!, new RegExp(SECRET));
  });

  test("x previews and removes; the copy is not parked", async () => {
    await ui.moveTo(/^>\s*PreToolUse/);
    await ui.press("x");
    await ui.until(/Remove hook [0-9a-f]{8} \(preview\)/);
    await ui.press("y");
    await ui.until(/is removed/);
    assert.equal(commands().length, 1);
    assert.doesNotMatch(ui.frame()!, /○ off/);
  });
});
