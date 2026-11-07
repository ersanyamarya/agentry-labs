import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { installFakeClaude } from "./helpers/fake-claude.js";
import { createUi, KEYS } from "./helpers/tui.js";

const SECRET = "sk-supersecretvalue1234567890";
const USER_SERVER = {
  type: "stdio",
  command: "echo",
  args: ["hi"],
  env: { API_KEY: SECRET },
};

let ui: ReturnType<typeof createUi>;
let oldPath: string | undefined;
let fake: ReturnType<typeof installFakeClaude>;
beforeEach(async () => {
  ui = createUi();
  fake = installFakeClaude(join(ui.fx.root, "fakebin"));
  oldPath = process.env.PATH;
  process.env.PATH = `${join(ui.fx.root, "fakebin")}:${oldPath}`;
  process.env.CLAUDE_CONFIG_DIR = ui.fx.configDir; // the fake claude edits <config>/.claude.json
  writeFileSync(
    join(ui.fx.configDir, ".claude.json"),
    `${JSON.stringify({ mcpServers: { userdemo: USER_SERVER } }, null, 2)}\n`
  );
  await ui.ready();
  await ui.press("r");
  await ui.press("2");
  await ui.until(/userdemo/);
});
afterEach(() => {
  ui.stop();
  process.env.PATH = oldPath;
  delete process.env.CLAUDE_CONFIG_DIR;
});

const servers = () =>
  JSON.parse(readFileSync(join(ui.fx.configDir, ".claude.json"), "utf8"))
    .mcpServers;

describe("MCP tab: park and add back user-scope servers", () => {
  test("space previews with secrets masked; n cancels and runs nothing", async () => {
    await ui.moveTo(/^>[●○◐ ]\s*userdemo/);
    await ui.press(KEYS.space);
    await ui.until(/Turn off userdemo \(preview\)/);
    assert.match(ui.frame()!, /env API_KEY=<masked>/);
    assert.match(ui.frame()!, /claude mcp remove userdemo/);
    assert.doesNotMatch(ui.frame()!, new RegExp(SECRET));
    await ui.press("n");
    await ui.until(/Cancelled; nothing changed/);
    assert.deepEqual(fake.argv(), []);
    assert.ok(servers().userdemo);
  });

  test("y parks it (○ off row, config saved), a second space adds it back identical", async () => {
    await ui.moveTo(/^>[●○◐ ]\s*userdemo/);
    await ui.press(KEYS.space);
    await ui.until(/Turn off userdemo/);
    await ui.press("y");
    await ui.until(/userdemo is turned off/);
    assert.equal(servers().userdemo, undefined);
    await ui.until(/○\s+userdemo\s+global/);
    assert.doesNotMatch(ui.frame()!, new RegExp(SECRET));

    await ui.press(KEYS.up);
    await ui.moveTo(/^>○\s+userdemo\s+global/);
    await ui.until(/adds it back/);
    await ui.press(KEYS.space);
    await ui.until(/Add back userdemo \(preview\)/);
    await ui.press("y");
    await ui.until(/userdemo is back in user scope/);
    assert.deepEqual(servers().userdemo, USER_SERVER);
    await ui.until(/●\s+userdemo\s+global/);
  });

  test("a project .mcp.json server is turned off for this project from the tab", async () => {
    await ui.moveTo(/^>[●○◐ ]\s*demo\s+project/);
    await ui.press(KEYS.space);
    await ui.until(/Turn off demo \(preview\)/);
    await ui.press("y");
    await ui.until(/demo is turned off/);
    assert.deepEqual(fake.argv(), []);
  });
});
