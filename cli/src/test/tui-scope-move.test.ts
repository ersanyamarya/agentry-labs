import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createUi, KEYS } from "./helpers/tui.js";

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

  test("o previews the move for a global skill and y moves it into the project", async () => {
    await ui.moveTo(/^>\s+notes/);
    assert.match(ui.frame()!, /o (move to this project only|this project)/);
    await ui.press("o");
    await ui.until(/would demote notes/);
    assert.ok(existsSync(globalNotes()), "a preview moves nothing");
    await ui.press("y");
    await ui.until(/notes now lives in this project's \.claude\/skills only/);
    assert.ok(!existsSync(globalNotes()));
    assert.ok(existsSync(join(projectNotes(), "SKILL.md")));
  });

  test("a previews a project-only skill, n cancels, y moves it to ~/.claude/skills", async () => {
    await ui.moveTo(/^>\s+proj/);
    assert.match(ui.frame()!, /a (move to all projects|all projects)/);
    await ui.press("a");
    await ui.until(/would promote proj/);
    await ui.press("n");
    await ui.until(/Cancelled; nothing changed/);
    assert.ok(existsSync(projectProj()) && !existsSync(globalProj()));
    await ui.press("a");
    await ui.until(/would promote proj/);
    await ui.press("y");
    await ui.until(/proj now lives in ~\/\.claude\/skills/);
    assert.ok(!existsSync(projectProj()));
    assert.ok(existsSync(join(globalProj(), "SKILL.md")));
  });

  test("s shelves a project-only skill: pick a group, preview, y moves it onto the shelf", async () => {
    await ui.moveTo(/^>\s+proj/);
    assert.match(ui.frame()!, /\bs shelve\b/);
    await ui.press("s");
    await ui.until(/Shelve proj: choose a group/);
    await ui.press(KEYS.enter);
    await ui.until(/would shelve proj into audit/);
    assert.ok(existsSync(projectProj()), "a preview moves nothing");
    await ui.press("y");
    await ui.until(/Shelved proj into audit/);
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
    await ui.press("a");
    await ui.until(/already exists; not overwriting/);
    assert.match(ui.frame()!, /Nothing can be applied here/);
    await ui.press("y");
    assert.ok(existsSync(projectProj()));
  });

  test("a and o on a row they do not fit say what they are for", async () => {
    await ui.moveTo(/^>\s+notes/);
    await ui.press("a");
    await ui.until(/a moves a project-only skill/);
    await ui.moveTo(/^>\s+proj/);
    await ui.press("o");
    await ui.until(/o moves a global skill into this project only/);
  });
});
