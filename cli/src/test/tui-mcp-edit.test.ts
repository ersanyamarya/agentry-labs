import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  process.env.CLAUDE_CONFIG_DIR = ui.fx.configDir;
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
const type = async (text: string) => {
  for (const char of text) {
    await ui.press(char);
  }
};

describe("MCP tab: a adds a server, s edits env/args", () => {
  test("a walks name → type → command → env → scope → masked preview; y adds it via claude mcp add-json", async () => {
    await ui.press("a");
    await ui.until(/Server name:/);
    await type("files");
    await ui.press(KEYS.enter);
    await ui.until(/command \(stdio\)/);
    await ui.press(KEYS.enter);
    await ui.until(/Command and args:/);
    await type("npx -y @s/files");
    await ui.press(KEYS.enter);
    await ui.until(/Env \(KEY=VALUE/);
    await type(`FILES_TOKEN=${SECRET}`);
    assert.doesNotMatch(
      ui.frame(),
      new RegExp(SECRET),
      "typed secrets are hidden"
    );
    await ui.press(KEYS.enter);
    await ui.until(/user \(claude mcp add-json/);
    await ui.press(KEYS.enter);
    await ui.until(/Add files \(preview\)/);
    assert.match(ui.frame()!, /env FILES_TOKEN=<masked>/);
    assert.doesNotMatch(ui.frame()!, new RegExp(SECRET));
    assert.deepEqual(fake.argv(), []);
    await ui.press("y");
    await ui.until(/files is added/);
    assert.deepEqual(servers().files, {
      type: "stdio",
      command: "npx",
      args: ["-y", "@s/files"],
      env: { FILES_TOKEN: SECRET },
    });
    await ui.until(/files/);
  });

  test("a url server in project scope writes .mcp.json; a bad name stops with a message", async () => {
    await ui.press("a");
    await ui.until(/Server name:/);
    await type("bad name");
    await ui.press(KEYS.enter);
    await ui.until(/Not a valid name/);
    await ui.press(KEYS.down);
    await ui.press("a");
    await ui.until(/Server name:/);
    await type("docs");
    await ui.press(KEYS.enter);
    await ui.until(/url \(http\)/);
    await ui.press(KEYS.down, KEYS.enter);
    await ui.until(/URL:/);
    await type("https://example.com/mcp");
    await ui.press(KEYS.enter);
    await ui.until(/Headers/);
    await ui.press(KEYS.enter);
    await ui.until(/project \(this repo/);
    await ui.press(KEYS.down, KEYS.enter);
    await ui.until(/Add docs \(preview\)/);
    await ui.press("y");
    await ui.until(/docs is added/);
    assert.equal(
      JSON.parse(readFileSync(join(ui.fx.repo, ".mcp.json"), "utf8")).mcpServers
        .docs.url,
      "https://example.com/mcp"
    );
    assert.equal(existsSync(join(ui.fx.root, "fakebin/argv.log")), false);
  });

  test("s on a user server edits env and args with a masked preview", async () => {
    await ui.moveTo(/^>[●○◐ ]\s*userdemo/);
    await ui.press("s");
    await ui.until(/Env changes:/);
    await type("API_KEY=sk-newvalue0987654321abcd EXTRA=1");
    assert.doesNotMatch(ui.frame()!, /sk-newvalue/);
    await ui.press(KEYS.enter);
    await ui.until(/New args:/);
    await type("-v");
    await ui.press(KEYS.enter);
    await ui.until(/Edit userdemo \(preview\)/);
    assert.doesNotMatch(ui.frame()!, /sk-newvalue|sk-supersecret/);
    await ui.press("y");
    await ui.until(/userdemo is updated/);
    assert.deepEqual(servers().userdemo, {
      type: "stdio",
      command: "echo",
      args: ["-v"],
      env: { API_KEY: "sk-newvalue0987654321abcd", EXTRA: "1" },
    });
  });
});
