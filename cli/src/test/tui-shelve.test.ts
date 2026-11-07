import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createUi, KEYS } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());

const personal = () => join(ui.fx.configDir, "skills/notes");
const shelved = (group: string) =>
  join(ui.fx.configDir, "skill-shelf", group, "notes");

const gotoNotes = () => ui.moveTo(/^>\s+notes/);

describe("shelve from the Skills tab", () => {
  beforeEach(async () => {
    ui = createUi({ personal: ["notes"] });
    await ui.ready();
    await gotoNotes();
  });

  test("s picks an existing group, previews with a dry run, and y moves the folder; then space toggles it", async () => {
    await ui.press("s");
    await ui.until(/choose a group/);
    assert.match(ui.frame()!, /> audit/);
    await ui.press(KEYS.down, KEYS.enter);
    await ui.until(/Shelve preview \(dry run\)/);
    assert.match(ui.frame()!, /would shelve notes into video/);
    assert.ok(existsSync(personal()), "a preview moves nothing");
    await ui.press("y");
    await ui.until(/Shelved notes into video/);
    assert.ok(!existsSync(personal()));
    assert.ok(existsSync(shelved("video")));

    // the skill is now in the video group, off
    await ui.moveTo(/^>.* video/, KEYS.up);
    await ui.press(KEYS.enter);
    await ui.moveTo(/^>\s+notes/);
    assert.match(ui.frame()!, /^>\s+notes\s+shelf\s+~\d+\s+○\s+○/m);
    await ui.press(KEYS.space);
    await ui.until(/video\/notes on in/);
    assert.ok(
      lstatSync(join(ui.fx.repo, ".claude/skills/notes")).isSymbolicLink()
    );
  });

  test("n types a new group name; q and other keys are text, not commands", async () => {
    await ui.press("s", "n");
    await ui.until(/Group name: _/);
    await ui.press("q", "u", "i", "z");
    await ui.until(/Group name: quiz_/);
    await ui.press(KEYS.enter);
    await ui.until(/would shelve notes into quiz/);
    await ui.press("y");
    await ui.until(/Shelved notes into quiz/);
    assert.ok(existsSync(shelved("quiz")));
  });

  test("n cancels with nothing written, and bad group names are refused before the shelf is asked", async () => {
    await ui.press("s", KEYS.enter);
    await ui.until(/Shelve preview/);
    await ui.press("n");
    await ui.until(/Cancelled; nothing changed/);
    assert.ok(existsSync(personal()));

    await ui.press("s", "n", ".", "x", KEYS.enter);
    await ui.until(/Not a usable group name/);
    assert.ok(existsSync(personal()));
    await ui.press("s", "n", KEYS.enter);
    await ui.until(/Not a usable group name: ""/);
  });

  test("a shelf refusal shows in the preview and y does nothing", async () => {
    mkdirSync(shelved("audit"), { recursive: true });
    writeFileSync(
      join(shelved("audit"), "SKILL.md"),
      "---\nname: notes\n---\n"
    );
    await ui.press("r");
    await ui.until(/Refreshed/);
    await ui.press("s", KEYS.enter);
    await ui.until(/overwriting/);
    assert.match(ui.frame()!, /Nothing can be applied here/);
    await ui.press("y");
    assert.ok(existsSync(personal()));
  });
});

describe("unshelve and why a row cannot be toggled", () => {
  beforeEach(async () => {
    ui = createUi({ personal: ["notes"] });
    await ui.ready();
  });

  test("u on a shelved skill previews and y moves it back to ~/.claude/skills", async () => {
    await ui.press(KEYS.down, KEYS.enter);
    await ui.moveTo(/^>\s+ffmpeg-install/);
    await ui.press("u");
    await ui.until(/Unshelve preview \(dry run\)/);
    assert.match(
      ui.frame()!,
      /would unshelve video\/ffmpeg-install|would unshelve\s+video\/ffmpeg-install/
    );
    await ui.press("y");
    await ui.until(/Unshelved video\/ffmpeg-install/);
    assert.ok(existsSync(join(ui.fx.configDir, "skills/ffmpeg-install")));
    assert.ok(
      !existsSync(join(ui.fx.configDir, "skill-shelf/video/ffmpeg-install"))
    );
  });

  test("unshelve is refused while the skill is linked", async () => {
    await ui.press(KEYS.down, KEYS.enter);
    await ui.moveTo(/^>\s+ffmpeg-install/);
    await ui.press(KEYS.space);
    await ui.until(/video\/ffmpeg-install on in/);
    await ui.press("u");
    await ui.until(/still linked/);
    assert.match(ui.frame()!, /Nothing can be applied here/);
  });

  test("space on personal, project and plugin skills explains instead of doing nothing", async () => {
    await gotoNotes();
    await ui.press(KEYS.space);
    await ui.until(
      /global skill \(~\/\.claude\/skills, every project\): s moves it to the shelf/
    );
    await ui.press(KEYS.down, KEYS.space);
    await ui.until(/project skill \(this repo.s \.claude\/skills\)/);
  });

  test("s elsewhere says what it does", async () => {
    await ui.press("s");
    await ui.until(/s shelves a global skill/);
  });
});

describe("remove a project-only skill", () => {
  test("x on a project skill previews and y deletes its folder; a linked one is refused", async () => {
    ui = createUi();
    await ui.ready();
    await ui.moveTo(/^>\s+proj/);
    await ui.press("x");
    await ui.until(/would remove proj \(project\)/);
    assert.ok(
      existsSync(join(ui.fx.repo, ".claude/skills/proj")),
      "a preview deletes nothing"
    );
    await ui.press("y");
    await ui.until(/Removed proj \(project\)/);
    assert.ok(!existsSync(join(ui.fx.repo, ".claude/skills/proj")));
  });
});
