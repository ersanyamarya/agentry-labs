import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createUi, KEYS } from "../../packages/tui/src/test/helpers/tui.js";

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

  test("m then library picks an existing group, previews with a dry run, and y moves the folder; then space toggles it", async () => {
    await ui.press("m", KEYS.enter);
    await ui.until(/choose a bundle/);
    assert.match(ui.frame()!, /> audit/);
    await ui.press(KEYS.down, KEYS.enter);
    await ui.until(/Move to the library: preview \(dry run\)/);
    assert.match(ui.frame()!, /would move notes into the library bundle video/);
    assert.ok(existsSync(personal()), "a preview moves nothing");
    await ui.press("y");
    await ui.until(/Moved notes into the library bundle video/);
    assert.ok(!existsSync(personal()));
    assert.ok(existsSync(shelved("video")));

    // the skill is now in the video group, off
    await ui.moveTo(/^>.* video/, KEYS.up);
    await ui.press(KEYS.enter);
    await ui.moveTo(/^>\s+notes/);
    assert.match(ui.frame()!, /^>\s+notes\s+library\s+~\d+\s+○\s+○/m);
    await ui.press(KEYS.space);
    await ui.until(/video\/notes on in/);
    assert.ok(
      lstatSync(join(ui.fx.repo, ".claude/skills/notes")).isSymbolicLink()
    );
  });

  test("n types a new group name; q and other keys are text, not commands", async () => {
    await ui.press("m", KEYS.enter, "n");
    await ui.until(/Bundle name: _/);
    await ui.press("q", "u", "i", "z");
    await ui.until(/Bundle name: quiz_/);
    await ui.press(KEYS.enter);
    await ui.until(/would move notes into the library bundle quiz/);
    await ui.press("y");
    await ui.until(/Moved notes into the library bundle quiz/);
    assert.ok(existsSync(shelved("quiz")));
  });

  test("n cancels with nothing written, and bad group names are refused before the shelf is asked", async () => {
    await ui.press("m", KEYS.enter, KEYS.enter);
    await ui.until(/Move to the library: preview/);
    await ui.press("n");
    await ui.until(/Cancelled; nothing changed/);
    assert.ok(existsSync(personal()));

    await ui.press("m", KEYS.enter, "n", ".", "x", KEYS.enter);
    await ui.until(/Not a usable bundle name/);
    assert.ok(existsSync(personal()));
    await ui.press("m", KEYS.enter, "n", KEYS.enter);
    await ui.until(/Not a usable bundle name: ""/);
  });

  test("a shelf refusal shows in the preview and y does nothing", async () => {
    mkdirSync(shelved("audit"), { recursive: true });
    writeFileSync(
      join(shelved("audit"), "SKILL.md"),
      "---\nname: notes\n---\n"
    );
    await ui.press("r");
    await ui.until(/Refreshed/);
    await ui.press("m", KEYS.enter, KEYS.enter);
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

  test("m on a shelved skill offers only moving it out; y moves it back to ~/.claude/skills", async () => {
    await ui.press(KEYS.down, KEYS.enter);
    await ui.moveTo(/^>\s+ffmpeg-install/);
    await ui.press("m");
    await ui.until(/Where should ffmpeg-install go\?/);
    assert.match(ui.frame()!, /> Move out of the library \(to all projects\)/);
    assert.doesNotMatch(
      ui.frame()!,
      /Move to this project only|Move to the library$/m
    );
    await ui.press(KEYS.enter);
    await ui.until(/Move out of the library: preview \(dry run\)/);
    assert.match(
      ui.frame()!,
      /would move video\/ffmpeg-install out of the library/
    );
    await ui.press("y");
    await ui.until(/Moved video\/ffmpeg-install out of the library/);
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
    await ui.press("m", KEYS.enter);
    await ui.until(/still linked/);
    assert.match(ui.frame()!, /Nothing can be applied here/);
  });

  test("space on personal, project and plugin skills explains instead of doing nothing", async () => {
    await gotoNotes();
    await ui.press(KEYS.space);
    await ui.until(
      /skill for all projects \(~\/\.claude\/skills\): m moves it to the library/
    );
    await ui.press(KEYS.down, KEYS.space);
    await ui.until(/skill for this project \(this repo.s \.claude\/skills\)/);
  });

  test("s and u on a library skill show the notice naming m", async () => {
    await ui.press(KEYS.down, KEYS.enter);
    await ui.moveTo(/^>\s+ffmpeg-install/);
    await ui.press("u");
    await ui.until(/Moves now live under m/);
    assert.ok(
      existsSync(join(ui.fx.configDir, "skill-shelf/video/ffmpeg-install"))
    );
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
    await ui.until(/Removed proj \(this project\)/);
    assert.ok(!existsSync(join(ui.fx.repo, ".claude/skills/proj")));
  });
});
