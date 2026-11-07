import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createBackups } from "../lib/backups.js";
import { createPaths } from "../lib/paths.js";
import { createShelf } from "../lib/shelf.js";
import { createFixture } from "./helpers/fixture.js";

let fx: ReturnType<typeof createFixture>;
let paths: ReturnType<typeof createPaths>;
let lines: string[];
const NOW = new Date("2026-11-04T12:00:00.000Z");
const io = () => ({
  out: (line: string) => lines.push(line),
  err: (line: string) => lines.push(line),
  warn: (line: string) => lines.push(line),
  now: () => NOW,
});
const backups = (extra = {}) =>
  createBackups(paths, { ...io(), isTTY: () => false, ...extra });
const shelf = () => createShelf(paths, io());

const put = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
// A fix-engine set, `days` old.
const fixSet = (name: string, days: number, extra = {}) => {
  const createdAt = new Date(NOW.getTime() - days * 86_400_000).toISOString();
  put(
    join(paths.backupsDir, name, "manifest.json"),
    JSON.stringify({
      version: 1,
      createdAt,
      status: "done",
      files: [{ path: "/x" }],
      ...extra,
    })
  );
  put(join(paths.backupsDir, name, "files/x"), "original bytes");
};

beforeEach(() => {
  fx = createFixture();
  paths = createPaths({
    env: { AGENTRY_HOME: fx.home, CLAUDE_CONFIG_DIR: fx.configDir },
    cwd: fx.repo,
  });
  lines = [];
});
afterEach(() => fx.cleanup());

describe("list", () => {
  test("shows fix sets and removed copies with size and age, newest first", () => {
    fixSet("2026-10-01T00-00-00-000Z", 34);
    fixSet("2026-11-03T00-00-00-000Z", 1.5, {
      undoneAt: "2026-11-03T01:00:00.000Z",
    });
    shelf().remove("video/trim");
    lines = [];
    assert.equal(backups().list(), 0);
    const text = lines.join("\n");
    assert.match(
      text,
      /removed\/2026-11-04T12-00-00-000Z\/video_trim\s+\S+ B\s+today\s+removed skill, from .*skill-shelf\/video\/trim/
    );
    assert.match(text, /fix\/2026-11-03T00-00-00-000Z .*1d.*undone/);
    assert.match(text, /fix\/2026-10-01T00-00-00-000Z .*34d/);
    assert.ok(
      text.indexOf("removed/") < text.indexOf("fix/2026-11-03"),
      "newest first"
    );
    assert.match(text, /3 backups/);
  });

  test("--json is machine readable; no backups says so", () => {
    backups().list();
    assert.match(lines.join("\n"), /No backups in/);
    lines = [];
    fixSet("a", 2);
    backups().list({ json: true });
    const data = JSON.parse(lines.join("\n"));
    assert.equal(data.backups[0].id, "fix/a");
    assert.equal(data.backups[0].kind, "fix");
    assert.ok(
      data.backups[0].bytes > 0 && data.total === data.backups[0].bytes
    );
  });
});

describe("restore", () => {
  test("moves a removed shelf skill back, drops the empty time folder, and the shelf group returns", async () => {
    shelf().remove("video/trim");
    const [entry] = backups().entries();
    assert.equal(entry.kind, "removed");
    assert.equal(await backups().restore(entry.id, { dryRun: true }), 0);
    assert.ok(
      !existsSync(join(fx.configDir, "skill-shelf/video/trim")),
      "a preview moves nothing"
    );
    assert.equal(await backups().restore(entry.id), 0);
    assert.ok(
      existsSync(join(fx.configDir, "skill-shelf/video/trim/SKILL.md"))
    );
    assert.ok(
      !existsSync(join(paths.backupsDir, "removed")) ||
        readdirSync(join(paths.backupsDir, "removed")).length === 0
    );
  });

  test("restores a global and a project skill to their own folders", async () => {
    put(join(fx.configDir, "skills/notes/SKILL.md"), "n");
    put(join(fx.repo, ".claude/skills/proj/SKILL.md"), "p");
    shelf().remove("notes");
    shelf().remove("proj", { project: true });
    const ids = backups()
      .entries()
      .map((entry) => entry.id);
    for (const id of ids) {
      assert.equal(await backups().restore(id), 0, lines.join("\n"));
    }
    assert.ok(existsSync(join(fx.configDir, "skills/notes/SKILL.md")));
    assert.ok(existsSync(join(fx.repo, ".claude/skills/proj/SKILL.md")));
  });

  test("refuses to overwrite, and says where a fix set is restored instead", async () => {
    shelf().remove("video/trim");
    put(join(fx.configDir, "skill-shelf/video/trim/SKILL.md"), "new one");
    lines = [];
    const [entry] = backups().entries();
    assert.equal(await backups().restore(entry.id), 1);
    assert.match(lines.join("\n"), /already exists; not overwriting/);
    assert.ok(existsSync(entry.path), "the copy stays");
    fixSet("s1", 1);
    lines = [];
    assert.equal(await backups().restore("fix/s1"), 1);
    assert.match(lines.join("\n"), /agentry fix --undo s1/);
    assert.equal(await backups().restore("nope"), 2);
  });

  test("an older copy without meta.json restores a global skill but says it cannot place others", async () => {
    put(
      join(
        paths.backupsDir,
        "removed/2026-01-01T00-00-00-000Z/notes_(global)/SKILL.md"
      ),
      "n"
    );
    put(
      join(
        paths.backupsDir,
        "removed/2026-01-01T00-00-00-000Z-b/video_trim/SKILL.md"
      ),
      "t"
    );
    lines = [];
    assert.equal(
      await backups().restore(
        "removed/2026-01-01T00-00-00-000Z/notes_(global)"
      ),
      0
    );
    assert.ok(existsSync(join(fx.configDir, "skills/notes/SKILL.md")));
    assert.equal(
      await backups().restore("removed/2026-01-01T00-00-00-000Z-b/video_trim"),
      1
    );
    assert.match(lines.join("\n"), /no recorded original folder/);
  });
});

describe("prune and delete", () => {
  beforeEach(() => {
    fixSet("old", 40);
    fixSet("mid", 10);
    fixSet("new", 0.2);
  });

  test("--older-than previews, and without a terminal or --yes deletes nothing", async () => {
    assert.equal(await backups().prune({ olderThan: 30 }), 0);
    const text = lines.join("\n");
    assert.match(text, /Would delete 1 backup/);
    assert.match(text, /fix\/old/);
    assert.match(text, /fix --undo can no longer restore it/);
    assert.match(text, /run again with --yes/);
    assert.ok(existsSync(join(paths.backupsDir, "old")));
  });

  test("--dry-run never deletes, even with a terminal", async () => {
    const asked: string[] = [];
    assert.equal(
      await backups({
        isTTY: () => true,
        confirm: async (q: string) => asked.push(q) > 0,
      }).prune({ all: true, dryRun: true }),
      0
    );
    assert.equal(asked.length, 0);
    assert.equal(readdirSync(paths.backupsDir).length, 3);
  });

  test("--yes deletes only what matched; a terminal asks and n cancels", async () => {
    assert.equal(
      await backups({ isTTY: () => true, confirm: async () => false }).prune({
        olderThan: 5,
      }),
      0
    );
    assert.equal(readdirSync(paths.backupsDir).length, 3);
    assert.match(lines.join("\n"), /Cancelled/);
    assert.equal(await backups().prune({ olderThan: 5, yes: true }), 0);
    assert.deepEqual(readdirSync(paths.backupsDir), ["new"]);
  });

  test("--all clears everything including removed copies and their time folders", async () => {
    shelf().remove("video/trim");
    await backups().prune({ all: true, yes: true });
    assert.deepEqual(readdirSync(paths.backupsDir), []);
  });

  test("delete <id> removes one backup; an unknown id or no selection is refused", async () => {
    assert.equal(await backups().prune({ ids: ["fix/mid"], yes: true }), 0);
    assert.ok(
      !existsSync(join(paths.backupsDir, "mid")) &&
        existsSync(join(paths.backupsDir, "old"))
    );
    assert.equal(await backups().prune({ ids: ["fix/ghost"], yes: true }), 2);
    assert.equal(await backups().prune({}), 2);
  });

  test("age comes from the manifest, falling back to the folder time", async () => {
    put(join(paths.backupsDir, "bare/manifest.json"), "{not json");
    const old = new Date(NOW.getTime() - 90 * 86_400_000);
    utimesSync(join(paths.backupsDir, "bare"), old, old);
    const bare = backups()
      .entries()
      .find((entry) => entry.id === "fix/bare");
    assert.ok(bare);
    assert.ok(bare.days > 89 && bare.days < 91);
    assert.match(bare.detail, /unreadable/);
  });
});

describe("shelf remove --no-backup", () => {
  test("keeps no copy and says so, in the preview too; the default keeps one", () => {
    assert.equal(
      shelf().remove("video/trim", { dryRun: true, backup: false }),
      0
    );
    assert.match(
      lines.join("\n"),
      /would remove video\/trim: .* \(no copy kept\)/
    );
    assert.equal(shelf().remove("video/trim", { backup: false }), 0);
    assert.match(lines.join("\n"), /removed video\/trim; no copy kept/);
    assert.ok(!existsSync(join(paths.backupsDir, "removed")));
    lines = [];
    assert.equal(shelf().remove("video/ffmpeg-install"), 0);
    assert.match(lines.join("\n"), /a copy is in/);
    assert.equal(backups().entries().length, 1);
  });
});

describe("prune --kind and updated copies", () => {
  // updated/<stamp>/<label> as catalog update writes it, `days` old.
  const updatedCopy = (days: number, label: string, from: string) => {
    const stamp = new Date(NOW.getTime() - days * 86_400_000)
      .toISOString()
      .replace(/[:.]/g, "-");
    const dir = join(paths.backupsDir, "updated", stamp);
    put(join(dir, label, "AGENT.md"), "old body");
    put(
      join(dir, "meta.json"),
      JSON.stringify({
        updatedAt: new Date(NOW.getTime() - days * 86_400_000).toISOString(),
        items: { [label]: { from, what: "agent" } },
      })
    );
    return `updated/${stamp}/${label}`;
  };

  test("lists updated copies with size, age and origin", () => {
    const id = updatedCopy(3, "agent_x_user", join(fx.configDir, "agents/x"));
    const entry = backups()
      .entries()
      .find((one) => one.id === id);
    assert.ok(entry);
    assert.equal(entry.kind, "updated");
    assert.equal(entry.from, join(fx.configDir, "agents/x"));
    assert.ok(entry.bytes > 0 && Math.floor(entry.days) === 3);
    assert.match(entry.detail, /updated agent, from /);
  });

  test("--kind narrows --older-than and --all; bad kinds and ids with kind are refused", async () => {
    fixSet("oldfix", 40);
    updatedCopy(40, "agent_x_user", "/x");
    put(
      join(paths.backupsDir, "removed/2026-09-01T00-00-00-000Z/s/SKILL.md"),
      "x"
    );
    put(
      join(paths.backupsDir, "removed/2026-09-01T00-00-00-000Z/meta.json"),
      JSON.stringify({
        label: "s",
        from: "/s",
        removedAt: "2026-09-01T00:00:00.000Z",
      })
    );
    assert.equal(
      await backups().prune({ olderThan: 30, kind: "removed", yes: true }),
      0
    );
    assert.deepEqual(
      backups()
        .entries()
        .map((one) => one.kind)
        .sort(),
      ["fix", "updated"]
    );
    assert.equal(
      await backups().prune({ all: true, kind: "updated", yes: true }),
      0
    );
    assert.deepEqual(
      backups()
        .entries()
        .map((one) => one.kind),
      ["fix"]
    );
    assert.ok(!existsSync(join(paths.backupsDir, "updated")));
    assert.equal(await backups().prune({ all: true, kind: "nope" }), 2);
    assert.equal(
      await backups().prune({ ids: ["fix/oldfix"], kind: "fix" }),
      2
    );
  });

  test("restore puts the old copy back, keeping the current one under removed/; delete drops it", async () => {
    const from = join(fx.configDir, "agents/x");
    put(join(from, "AGENT.md"), "new body");
    const id = updatedCopy(1, "agent_x_user", from);
    assert.equal(await backups().restore(id, { dryRun: true }), 0);
    assert.equal(readFileSync(join(from, "AGENT.md"), "utf8"), "new body");
    assert.equal(await backups().restore(id), 0);
    assert.equal(readFileSync(join(from, "AGENT.md"), "utf8"), "old body");
    assert.ok(!existsSync(join(paths.backupsDir, "updated")));
    const kept = backups().entries();
    assert.equal(kept.length, 1);
    assert.equal(
      readFileSync(join(kept[0].path, "AGENT.md"), "utf8"),
      "new body"
    );
    const again = updatedCopy(2, "agent_y_user", "/y");
    assert.equal(await backups().prune({ ids: [again], yes: true }), 0);
    assert.ok(!existsSync(join(paths.backupsDir, "updated")));
  });

  test("the CLI takes --kind", () => {
    fixSet("a", 40);
    assert.equal(
      fx.run(["backups", "prune", "--all", "--kind", "bogus"]).status,
      2
    );
    assert.match(
      fx.run(["backups", "prune", "--older-than", "30", "--kind", "removed"])
        .stdout,
      /Nothing to delete/
    );
    assert.match(
      fx.run(["backups", "prune", "--older-than", "30", "--kind", "fix"])
        .stdout,
      /Would delete 1 backup/
    );
  });
});

describe("CLI", () => {
  test("backups list/restore/delete/prune run through the router with usage errors", () => {
    shelf().remove("video/trim");
    const [{ id }] = backups().entries();
    assert.match(fx.run(["backups", "list"]).stdout, /removed\/.*video_trim/);
    assert.equal(
      JSON.parse(fx.run(["backups", "list", "--json"]).stdout).backups.length,
      1
    );
    const dry = fx.run(["backups", "restore", id, "--dry-run"]);
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, /would restore/);
    assert.equal(fx.run(["backups", "prune"]).status, 2);
    assert.equal(
      fx.run(["backups", "prune", "--all", "--older-than", "3"]).status,
      2
    );
    assert.equal(fx.run(["backups", "prune", "--older-than", "x"]).status, 2);
    assert.equal(
      fx.run(["backups", "prune", "--all", "--yes", "--dry-run"]).status,
      2
    );
    const preview = fx.run(["backups", "prune", "--all"]);
    assert.match(preview.stdout, /Nothing deleted; run again with --yes/);
    assert.equal(fx.run(["backups", "restore", id]).status, 0);
    assert.ok(existsSync(join(fx.configDir, "skill-shelf/video/trim")));
    assert.equal(fx.run(["backups", "delete", "fix/ghost", "--yes"]).status, 2);
  });

  test("shelf remove --no-backup", () => {
    const result = fx.run(["shelf", "remove", "video/trim", "--no-backup"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /no copy kept/);
    assert.ok(!existsSync(join(fx.configDir, "backups")));
  });
});
