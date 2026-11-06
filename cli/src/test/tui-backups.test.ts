import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createUi, KEYS } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
const put = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const backupsDir = () => join(ui.fx.configDir, "backups/agentry");
beforeEach(async () => {
  ui = createUi({ personal: ["notes"] });
  await ui.ready();
});
afterEach(() => ui?.stop());

const removeNotes = async (key = "x") => {
  await ui.moveTo(/^>\s+notes/);
  await ui.press(key);
  await ui.until(/Remove notes \(global\) \(preview\)/);
};

describe("remove with and without a copy", () => {
  test("x says a copy is kept, X says none is, and X really keeps none", async () => {
    await removeNotes("X");
    assert.match(ui.frame()!, /no copy kept/);
    await ui.press("y");
    await ui.until(/no copy was kept/);
    assert.ok(!existsSync(join(ui.fx.configDir, "skills/notes")));
    assert.ok(!existsSync(backupsDir()));
  });

  test("x keeps the copy and the footer offers X", async () => {
    await ui.moveTo(/^>\s+notes/);
    assert.match(ui.frame()!, /X (remove, no copy|no copy)/);
    await removeNotes();
    assert.match(ui.frame()!, /copy kept in/);
    await ui.press("y");
    await ui.until(/Backups tab restores it/);
    assert.equal(readdirSync(join(backupsDir(), "removed")).length, 1);
  });
});

describe("Backups tab", () => {
  test("is tab 7 with a count, says when empty, and lists a removed skill after x", async () => {
    await ui.press("7");
    await ui.until(/\(no backups\)/);
    assert.match(ui.frame()!, /7 Backups \(0\)/);
    await ui.press("1");
    await removeNotes();
    await ui.press("y");
    await ui.until(/Backups tab restores it/);
    await ui.press("7");
    await ui.until(/notes \(global\)\s+removed\s+\d+ B\s+today/);
    assert.match(ui.frame()!, /7 Backups \(1\)/);
    await ui.until(/u restore {2}x delete/);
  });

  test("u previews, n cancels, y moves the skill back and the row goes", async () => {
    await removeNotes();
    await ui.press("y");
    await ui.until(/Backups tab restores it/);
    await ui.press("7");
    await ui.until(/removed\s+\d+ B/);
    await ui.press("u");
    await ui.until(/Restore notes \(global\) \(preview\)/);
    assert.match(ui.frame()!, /would restore notes \(global\)/);
    await ui.press("n");
    await ui.until(/Cancelled/);
    assert.ok(!existsSync(join(ui.fx.configDir, "skills/notes")));
    await ui.press("u");
    await ui.until(/Restore notes/);
    await ui.press("y");
    await ui.until(/Restored; it is back/);
    assert.ok(existsSync(join(ui.fx.configDir, "skills/notes/SKILL.md")));
    await ui.until(/\(no backups\)/);
  });

  test("x previews the delete of a fix set with the undo warning; y deletes it", async () => {
    put(
      join(backupsDir(), "2026-10-01T00-00-00-000Z/manifest.json"),
      JSON.stringify({
        createdAt: "2026-10-01T00:00:00.000Z",
        status: "done",
        files: [],
      })
    );
    await ui.press("r");
    await ui.press("7");
    await ui.until(/fix set/);
    assert.doesNotMatch(ui.frame()!, /u restore/);
    await ui.press("x");
    await ui.until(/Delete 2026-10-01T00-00-00-000Z \(preview\)/);
    assert.match(ui.frame()!, /fix --undo can no longer restore it/);
    assert.ok(
      existsSync(join(backupsDir(), "2026-10-01T00-00-00-000Z")),
      "a preview deletes nothing"
    );
    await ui.press("y");
    await ui.until(/Deleted that backup/);
    assert.ok(!existsSync(join(backupsDir(), "2026-10-01T00-00-00-000Z")));
  });

  test("d previews the 30+ days prune, c copies the preview, y deletes only the old ones", async () => {
    const copied: string[] = [];
    ui.stop();
    ui = createUi({
      clipboard: {
        spawn: (_command, _args, options) => (
          copied.push(options.input), { status: 0 }
        ),
        platform: "darwin",
      },
    });
    await ui.ready();
    put(
      join(backupsDir(), "old/manifest.json"),
      JSON.stringify({
        createdAt: "2020-01-01T00:00:00.000Z",
        status: "done",
        files: [],
      })
    );
    put(
      join(backupsDir(), "new/manifest.json"),
      JSON.stringify({
        createdAt: new Date().toISOString(),
        status: "done",
        files: [],
      })
    );
    await ui.press("r");
    await ui.press("7");
    await ui.until(/7 Backups \(2\)/);
    await ui.press("d");
    await ui.until(/Delete backups 30\+ days old \(preview\)/);
    assert.match(ui.frame()!, /Would delete 1 backup/);
    await ui.press("c");
    await ui.until(/Copied to the clipboard/);
    assert.match(copied[0] ?? "", /Would delete 1 backup/);
    await ui.press("y");
    await ui.until(/Deleted the backups 30\+ days old/);
    assert.deepEqual(readdirSync(backupsDir()), ["new"]);
  });

  test("u on a row that cannot be restored explains instead of opening a prompt", async () => {
    put(
      join(backupsDir(), "s/manifest.json"),
      JSON.stringify({
        createdAt: new Date().toISOString(),
        status: "done",
        files: [],
      })
    );
    await ui.press("r");
    await ui.press("7");
    await ui.until(/fix set/);
    await ui.press("u");
    await ui.until(/u restores a removed skill/);
    await ui.press(KEYS.esc);
  });
});
