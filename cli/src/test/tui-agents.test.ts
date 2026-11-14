import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, test } from "vitest";
import {
  createUi,
  stripAnsi,
} from "../../packages/tui/src/test/helpers/tui.js";

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());
const write = (file: string, text: string) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};

describe("Agents tab", () => {
  test("lists user and project agents with model and cost; e opens the file", async () => {
    const calls: [string, string[]][] = [];
    ui = createUi({
      env: { EDITOR: "myedit" },
      spawn: (command, args) => {
        calls.push([command, args]);
        return { status: 0 };
      },
    });
    write(
      join(ui.fx.configDir, "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Reviews diffs\nmodel: sonnet\ntools: Read, Grep\n---\nBody.\n"
    );
    write(
      join(ui.fx.repo, ".claude", "agents", "helper.md"),
      "---\nname: helper\ndescription: Helps out\n---\n"
    );
    await ui.ready();
    assert.match(stripAnsi(ui.rail()), /Agents\s+2/);
    await ui.press("6");
    await ui.until(/reviewer\s+~\d+\s+sonnet/);
    const frame = stripAnsi(ui.frame()!);
    assert.match(frame, /User/);
    assert.match(frame, /This project/);
    assert.match(frame, /helper\s+~\d+\s+-/);
    await ui.moveTo(/^>.*reviewer/);
    await ui.until(/description: Reviews diffs/);
    assert.match(stripAnsi(ui.frame()!), /tools: Read, Grep/);
    assert.match(ui.frame()!, /e edit/);
    await ui.press("e");
    assert.equal(calls.length, 1);
    assert.match(calls[0][1].join(" "), /agents\/reviewer\.md$/);
  });

  test("with no agents it says where to add one", async () => {
    ui = createUi();
    await ui.ready();
    await ui.press("6");
    await ui.until(/\(no agents\)/);
  });
});
