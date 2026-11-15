import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createUi, KEYS } from "../../packages/tui/src/test/helpers/tui.js";

let ui: ReturnType<typeof createUi>;
let origin: string;
beforeEach(async () => {
  origin = mkdtempSync(join(tmpdir(), "agentry-origin-"));
  for (const name of ["alpha", "beta"]) {
    mkdirSync(join(origin, "skills", name), { recursive: true });
    writeFileSync(
      join(origin, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${name} does a thing\n---\n`
    );
  }
  writeFileSync(
    join(origin, "bundles.tsv"),
    "web\tskills/alpha\nweb\tskills/beta\n"
  );
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", ...args],
      { cwd: origin, stdio: "ignore" }
    );
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  ui = createUi({ personal: ["notes"], catalogRepo: origin });
  await ui.ready();
});
afterEach(() => ui?.stop());

describe("Catalog tab", () => {
  test("says it is not fetched, then f fetches and lists the skills by bundle", async () => {
    await ui.press("7");
    await ui.until(/catalog not fetched/);
    assert.match(ui.frame()!, /f fetch\b/);
    await ui.press("f");
    await ui.until(/web bundle/);
    assert.match(ui.frame()!, /alpha\s+~\d+\s+○/);
    assert.match(ui.rail(), /Catalog\s+2/);
  });

  test("a previews and y adds the skill to the library, not loaded; it then shows where it is", async () => {
    await ui.press("7", "f");
    await ui.until(/web bundle/);
    await ui.moveTo(/^>\s+\S\s+alpha/);
    await ui.press("a");
    await ui.until(/Add alpha to the library \(preview\)/);
    assert.match(ui.frame()!, /would add alpha to library bundle web/);
    assert.ok(
      !existsSync(join(ui.fx.configDir, "skill-shelf/web")),
      "a preview copies nothing"
    );
    await ui.press("y");
    await ui.until(/Added alpha to the library, not loaded/);
    assert.ok(
      existsSync(join(ui.fx.configDir, "skill-shelf/web/alpha/SKILL.md"))
    );
    await ui.until(/alpha\s+~\d+\s+● library\/web/);
  });

  test("the retired keys i and o show one notice naming a, and the footer offers a", async () => {
    await ui.press("7", "f");
    await ui.until(/web bundle/);
    await ui.moveTo(/^>\s+\S\s+alpha/);
    await ui.until(/\ba add/);
    await ui.press("i");
    await ui.until(/Adding now uses a/);
    await ui.press("o");
    await ui.until(/Adding now uses a/);
    assert.ok(!existsSync(join(ui.fx.configDir, "skill-shelf/web")));
  });

  test("x on an installed skill previews, y deletes it and keeps a copy", async () => {
    await ui.press("7", "f");
    await ui.until(/web bundle/);
    await ui.moveTo(/^>\s+\S\s+alpha/);
    await ui.press("a");
    await ui.until(/Add alpha/);
    await ui.press("y");
    await ui.until(/alpha\s+~\d+\s+● library\/web/);
    await ui.press("x");
    await ui.until(/Remove web\/alpha \(preview\)/);
    await ui.press("y");
    await ui.until(/Removed web\/alpha/);
    assert.ok(!existsSync(join(ui.fx.configDir, "skill-shelf/web")));
    assert.equal(
      readdirSync(join(ui.fx.configDir, "backups/agentry/removed")).length,
      1
    );
    await ui.until(/alpha\s+~\d+\s+○/);
  });
});

describe("remove from the Skills tab", () => {
  test("x on a global skill previews, n cancels, y deletes with a copy kept", async () => {
    await ui.moveTo(/^>\s+notes/);
    assert.match(ui.frame()!, /x remove/);
    await ui.press("x");
    await ui.until(/Remove notes \(all projects\) \(preview\)/);
    await ui.press("n");
    await ui.until(/Cancelled/);
    assert.ok(existsSync(join(ui.fx.configDir, "skills/notes")));
    await ui.press("x");
    await ui.until(/Remove notes/);
    await ui.press("y");
    await ui.until(/Removed notes/);
    assert.ok(!existsSync(join(ui.fx.configDir, "skills/notes")));
  });

  test("x on a shelved skill removes it from the library; on a bundle row it explains", async () => {
    await ui.press("x");
    await ui.until(/x removes a skill folder from the library, all proj/);
    await ui.moveTo(/^>.* video/);
    await ui.press(KEYS.enter);
    await ui.moveTo(/^>\s+trim/);
    await ui.press("x");
    await ui.until(/Remove video\/trim \(preview\)/);
    await ui.press("y");
    await ui.until(/Removed video\/trim/);
    assert.ok(!existsSync(join(ui.fx.configDir, "skill-shelf/video/trim")));
  });
});
