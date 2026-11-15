import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createUi, KEYS } from "../../packages/tui/src/test/helpers/tui.js";

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());

const globalNotes = () => join(ui.fx.configDir, "skills/notes");
const projectNotes = () => join(ui.fx.repo, ".claude/skills/notes");
const projectProj = () => join(ui.fx.repo, ".claude/skills/proj");
const globalProj = () => join(ui.fx.configDir, "skills/proj");

describe("move skills between project and global scope", () => {
  beforeEach(async () => {
    ui = createUi({ personal: ["notes"] });
    await ui.ready();
  });

  test("m on a global skill lists library and this project only; the second previews and y moves it into the project", async () => {
    await ui.moveTo(/^>\s+notes/);
    assert.match(ui.frame()!, /m move/);
    await ui.press("m");
    await ui.until(/Where should notes go\?/);
    assert.match(ui.frame()!, /> Move to the library/);
    assert.match(ui.frame()!, /Move to this project only/);
    assert.doesNotMatch(ui.frame()!, /Move to all projects/);
    await ui.press(KEYS.down, KEYS.enter);
    await ui.until(/would demote notes/);
    assert.ok(existsSync(globalNotes()), "a preview moves nothing");
    await ui.press("y");
    await ui.until(/notes now lives in this project's \.claude\/skills only/);
    assert.ok(!existsSync(globalNotes()));
    assert.ok(existsSync(join(projectNotes(), "SKILL.md")));
  });

  test("m on a project-only skill lists library and all projects; the second previews, n cancels, y moves it to ~/.claude/skills", async () => {
    await ui.moveTo(/^>\s+proj/);
    assert.match(ui.frame()!, /m move/);
    await ui.press("m");
    await ui.until(/Where should proj go\?/);
    assert.match(ui.frame()!, /> Move to the library/);
    assert.match(ui.frame()!, /Move to all projects/);
    assert.doesNotMatch(ui.frame()!, /Move to this project only/);
    await ui.press(KEYS.down, KEYS.enter);
    await ui.until(/would promote proj/);
    await ui.press("n");
    await ui.until(/Cancelled; nothing changed/);
    assert.ok(existsSync(projectProj()) && !existsSync(globalProj()));
    await ui.press("m", KEYS.down, KEYS.enter);
    await ui.until(/would promote proj/);
    await ui.press("y");
    await ui.until(/proj now lives in ~\/\.claude\/skills/);
    assert.ok(!existsSync(projectProj()));
    assert.ok(existsSync(join(globalProj(), "SKILL.md")));
  });

  test("m then library moves a skill for this project only to the library: pick a bundle, preview, y moves it", async () => {
    await ui.moveTo(/^>\s+proj/);
    await ui.press("m", KEYS.enter);
    await ui.until(/Move proj to the library: choose a bundle/);
    await ui.press(KEYS.enter);
    await ui.until(/would move proj into the library bundle audit/);
    assert.ok(existsSync(projectProj()), "a preview moves nothing");
    await ui.press("y");
    await ui.until(/Moved proj into the library bundle audit/);
    assert.ok(!existsSync(projectProj()));
    assert.ok(
      existsSync(join(ui.fx.configDir, "skill-shelf/audit/proj/SKILL.md"))
    );
  });

  test("a clash is shown in the preview and cannot be applied", async () => {
    mkdirSync(globalProj(), { recursive: true });
    writeFileSync(join(globalProj(), "SKILL.md"), "---\nname: proj\n---\n");
    await ui.press("r");
    await ui.moveTo(/^>\s+proj/); // the global one comes first; the project-only copy is the next row
    await ui.press(KEYS.down);
    await ui.moveTo(/^>\s+proj/);
    await ui.press("m", KEYS.down, KEYS.enter);
    await ui.until(/already exists; not overwriting/);
    assert.match(ui.frame()!, /Nothing can be applied here/);
    await ui.press("y");
    assert.ok(existsSync(projectProj()));
  });

  test("the retired keys s, a and o show one notice naming m and move nothing", async () => {
    await ui.moveTo(/^>\s+notes/);
    for (const key of ["a", "o", "s"]) {
      await ui.press(key);
      await ui.until(/Moves now live under m/);
      assert.ok(existsSync(globalNotes()));
    }
    await ui.moveTo(/^>\s+proj/);
    await ui.press("s");
    await ui.until(/Moves now live under m/);
    assert.ok(existsSync(projectProj()));
  });

  test("m on a row with nothing to move says what it is for", async () => {
    await ui.press("m");
    await ui.until(/m moves a skill between all projects/);
  });
});
