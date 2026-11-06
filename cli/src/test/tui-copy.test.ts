import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { copyText } from "../tui/clipboard.js";
import { createUi, KEYS } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());

describe("copyText", () => {
  test("uses the platform command and passes the text on stdin", () => {
    const calls: unknown[] = [];
    const result = copyText("hello", {
      platform: "darwin",
      spawn: (command, args, options) => (
        calls.push([command, args, options.input]), { status: 0 }
      ),
    });
    assert.ok(result.ok);
    assert.deepEqual(calls, [["pbcopy", [], "hello"]]);
  });

  test("falls back to the OSC 52 escape when no command works", () => {
    let written = "";
    copyText("hello", {
      platform: "linux",
      spawn: () => ({ error: { code: "ENOENT" } as unknown as Error }),
      write: (data) => (written += data),
    });
    assert.equal(
      written,
      `\u001B]52;c;${Buffer.from("hello").toString("base64")}\u0007`
    );
  });
});

describe("c copies a preview or a result", () => {
  test("on the shelve refusal preview and on the result after applying", async () => {
    const copied: string[] = [];
    ui = createUi({
      personal: ["notes"],
      clipboard: {
        spawn: (_command, _args, options) => (
          copied.push(options.input), { status: 0 }
        ),
        platform: "darwin",
      },
    });
    await ui.ready();
    await ui.moveTo(/^>\s+notes/);
    await ui.press("s", KEYS.enter);
    await ui.until(/Shelve preview/);
    assert.match(ui.frame()!, /c = copy/);
    await ui.press("c");
    await ui.until(/Copied to the clipboard/);
    assert.match(copied[0], /would shelve notes/);
    await ui.press("y");
    await ui.until(/Shelved notes/);
    await ui.press("c");
    await ui.until(/Copied to the clipboard/);
    assert.equal(copied.length, 2);
    assert.match(copied[1], /notes/);
  });
});
