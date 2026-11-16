import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import {
  createCopilotShare,
  readShareStore,
  shareState,
} from "../copilot-share.js";
import { createFixUndo } from "../fix-undo.js";
import { createPaths } from "../paths.js";

let root: string;
let home: string;
let claude: string;
let ch: string;
let repo: string;
let lines: string[];
let clock: number;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-share-")));
  assert.ok(
    !root.startsWith(realpathSync(homedir())),
    "TMPDIR must be outside the home directory"
  );
  home = join(root, "home");
  claude = join(home, ".claude");
  ch = join(home, ".copilot");
  repo = join(home, "ws", "repo");
  mkdirSync(repo, { recursive: true });
  mkdirSync(claude, { recursive: true });
  mkdirSync(ch, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });
  lines = [];
  clock = Date.UTC(2026, 10, 16, 12, 0, 0);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const write = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const skill = (dir: string, name: string) =>
  write(join(dir, name, "SKILL.md"), `---\nname: ${name}\n---\nbody\n`);
const paths = () =>
  createPaths({
    env: {
      AGENTRY_HOME: home,
      CLAUDE_CONFIG_DIR: claude,
      COPILOT_HOME: "",
    },
    cwd: repo,
  });
// A clock that moves one second per call, so each backup set sorts after the one before.
const now = () => {
  clock += 1000;
  return new Date(clock);
};
const io = {
  out: (line: unknown) => lines.push(String(line)),
  err: (line: unknown) => lines.push(String(line)),
  isTTY: () => false,
  now,
};
const engine = () => createCopilotShare(paths(), io);
const share = (name: string, extra: { dryRun?: boolean } = {}) =>
  engine().share({ kind: "skill", name, path: repo, yes: true, ...extra });
const unshare = (name: string, extra: { dryRun?: boolean } = {}) =>
  engine().unshare({ kind: "skill", name, path: repo, yes: true, ...extra });
const undo = (force = false) =>
  createFixUndo(paths(), io).run({ yes: true, force });
const stateOf = (name: string) =>
  shareState(paths(), repo).find((item) => item.name === name);
const isLink = (path: string) => lstatSync(path).isSymbolicLink();
const gone = (path: string) => {
  try {
    lstatSync(path);
    return false;
  } catch {
    return true;
  }
};

describe("share a skill and undo", () => {
  test("a real skill folder: undo removes only <ch>/skills/<name>", async () => {
    skill(join(claude, "skills"), "demo");
    const original = join(claude, "skills", "demo");
    assert.equal(await share("demo"), 0);
    const link = join(ch, "skills", "demo");
    assert.ok(isLink(link));
    assert.equal(readlinkSync(link), realpathSync(original));
    assert.equal(stateOf("demo")?.state, "shared");
    assert.deepEqual(Object.keys(readShareStore(paths()).items), [
      "skill:demo",
    ]);

    assert.equal(await undo(), 0, lines.join("\n"));
    assert.ok(gone(link));
    assert.ok(lstatSync(original).isDirectory());
    assert.ok(!isLink(original));
    assert.equal(
      readFileSync(join(original, "SKILL.md"), "utf8"),
      "---\nname: demo\n---\nbody\n"
    );
    assert.ok(gone(paths().copilotShares), "the store the share created goes");
    assert.equal(stateOf("demo")?.state, "notShared");
  });

  test("a skill linked in from the library: Claude's link and the library stay", async () => {
    const library = join(claude, "skill-shelf", "web");
    skill(library, "lib");
    const claudeLink = join(claude, "skills", "lib");
    mkdirSync(dirname(claudeLink), { recursive: true });
    symlinkSync(join(library, "lib"), claudeLink);
    assert.equal(await share("lib"), 0);
    const link = join(ch, "skills", "lib");
    assert.equal(readlinkSync(link), realpathSync(join(library, "lib")));

    assert.equal(await undo(), 0, lines.join("\n"));
    assert.ok(gone(link));
    assert.ok(isLink(claudeLink));
    assert.equal(readlinkSync(claudeLink), join(library, "lib"));
    assert.ok(existsSync(join(library, "lib", "SKILL.md")));
  });

  test("--dry-run writes nothing", async () => {
    skill(join(claude, "skills"), "demo");
    assert.equal(await share("demo", { dryRun: true }), 0);
    assert.ok(lines.some((line) => line.startsWith("[copilot-share]")));
    assert.ok(lines.some((line) => line.includes("Dry run: nothing written")));
    assert.ok(gone(join(ch, "skills")));
    assert.ok(gone(paths().copilotShares));
    assert.ok(gone(paths().backupsDir));

    assert.equal(await share("demo"), 0);
    lines = [];
    assert.equal(await unshare("demo", { dryRun: true }), 0);
    assert.ok(isLink(join(ch, "skills", "demo")));
    assert.equal(stateOf("demo")?.state, "shared");
  });

  test("sharing twice says it is already shared", async () => {
    skill(join(claude, "skills"), "demo");
    assert.equal(await share("demo"), 0);
    lines = [];
    assert.equal(await share("demo"), 0);
    assert.match(lines.join("\n"), /already shared/);
  });
});

describe("undo conflicts", () => {
  test("a different link at <ch>/skills/<name> is a conflict and survives --force", async () => {
    skill(join(claude, "skills"), "demo");
    const elsewhere = join(root, "elsewhere");
    skill(elsewhere, "demo");
    assert.equal(await share("demo"), 0);
    const link = join(ch, "skills", "demo");
    rmSync(link);
    symlinkSync(join(elsewhere, "demo"), link);

    assert.equal(await undo(), 1);
    assert.match(lines.join("\n"), /a different link is there now/);
    assert.equal(readlinkSync(link), join(elsewhere, "demo"));

    assert.equal(await undo(true), 1);
    assert.equal(readlinkSync(link), join(elsewhere, "demo"));
    assert.ok(existsSync(join(elsewhere, "demo", "SKILL.md")));
    assert.ok(existsSync(join(claude, "skills", "demo", "SKILL.md")));
  });

  test("a real folder in its place survives undo --force", async () => {
    skill(join(claude, "skills"), "demo");
    assert.equal(await share("demo"), 0);
    const link = join(ch, "skills", "demo");
    rmSync(link);
    skill(join(ch, "skills"), "demo");

    assert.equal(await undo(true), 1);
    assert.ok(lstatSync(link).isDirectory());
    assert.ok(existsSync(join(link, "SKILL.md")));
  });
});

describe("unshare", () => {
  test("removes the link, keeps the skill, and undo links it again", async () => {
    skill(join(claude, "skills"), "demo");
    assert.equal(await share("demo"), 0);
    const link = join(ch, "skills", "demo");
    const target = readlinkSync(link);

    assert.equal(await unshare("demo"), 0, lines.join("\n"));
    assert.ok(gone(link));
    assert.ok(existsSync(join(claude, "skills", "demo", "SKILL.md")));
    assert.deepEqual(readShareStore(paths()).items, {});
    assert.equal(stateOf("demo")?.state, "notShared");

    assert.equal(await undo(), 0, lines.join("\n"));
    assert.ok(isLink(link));
    assert.equal(readlinkSync(link), target);
    assert.equal(stateOf("demo")?.state, "shared");
  });

  test("refuses a link that changed since it was shared", async () => {
    skill(join(claude, "skills"), "demo");
    const elsewhere = join(root, "elsewhere");
    skill(elsewhere, "demo");
    assert.equal(await share("demo"), 0);
    const link = join(ch, "skills", "demo");
    rmSync(link);
    symlinkSync(join(elsewhere, "demo"), link);
    lines = [];

    assert.equal(await unshare("demo"), 1);
    assert.match(lines.join("\n"), /changed since agentry shared it/);
    assert.equal(readlinkSync(link), join(elsewhere, "demo"));
    assert.equal(stateOf("demo")?.state, "other");
  });

  test("refuses what agentry did not write", async () => {
    skill(join(claude, "skills"), "demo");
    skill(join(ch, "skills"), "demo");
    assert.equal(stateOf("demo")?.state, "other");
    assert.equal(await unshare("demo"), 1);
    assert.match(lines.join("\n"), /agentry did not create it/);
    assert.equal(await share("demo"), 1);
    assert.ok(existsSync(join(ch, "skills", "demo", "SKILL.md")));
  });

  test("nothing shared: nothing to do", async () => {
    skill(join(claude, "skills"), "demo");
    assert.equal(await unshare("demo"), 0);
    assert.match(lines.join("\n"), /not shared with Copilot/);
  });
});

describe("refusals", () => {
  test("no Copilot home: refused, nothing written", async () => {
    skill(join(claude, "skills"), "demo");
    rmSync(ch, { recursive: true });
    assert.equal(await share("demo"), 1);
    assert.match(lines.join("\n"), /Copilot not found/);
    assert.ok(gone(ch));
    assert.ok(gone(paths().copilotShares));
  });

  test("<ch>/skills linked to Claude's own skills folder: refused", async () => {
    skill(join(claude, "skills"), "demo");
    symlinkSync(join(claude, "skills"), join(ch, "skills"));
    assert.equal(await share("demo"), 1);
    assert.match(lines.join("\n"), /resolves into Claude's own folder/);
    lines = [];
    assert.equal(await unshare("demo"), 1);
    assert.ok(lstatSync(join(claude, "skills", "demo")).isDirectory());
    assert.ok(existsSync(join(claude, "skills", "demo", "SKILL.md")));
  });

  test("a missing skill, a bad name, and a kind not built yet", async () => {
    assert.equal(await share("nope"), 1);
    assert.equal(await share("../x"), 2);
    assert.equal(
      await engine().share({ kind: "mcp", name: "x", path: repo, yes: true }),
      1
    );
  });
});

describe("generated files on the engine", () => {
  test("write, delete and undo of a delete", async () => {
    const file = join(ch, "instructions", "demo.instructions.md");
    const text = '---\napplyTo: "**"\n---\nhello\n';
    const change = { kind: "rule" as const, name: "demo", path: file };
    assert.equal(
      await engine().run(
        { ...change, op: "write", text },
        { path: repo, yes: true }
      ),
      0,
      lines.join("\n")
    );
    assert.equal(readFileSync(file, "utf8"), text);
    assert.ok(readShareStore(paths()).items["rule:demo"].sha256);

    assert.equal(
      await engine().run(
        { ...change, op: "delete" },
        { path: repo, yes: true }
      ),
      0,
      lines.join("\n")
    );
    assert.ok(gone(file));
    assert.equal(await undo(), 0, lines.join("\n"));
    assert.equal(readFileSync(file, "utf8"), text);

    writeFileSync(file, "edited\n");
    lines = [];
    assert.equal(
      await engine().run(
        { ...change, op: "delete" },
        { path: repo, yes: true }
      ),
      1
    );
    assert.match(lines.join("\n"), /changed since agentry shared it/);
    assert.equal(readFileSync(file, "utf8"), "edited\n");
  });
});

describe("shareState", () => {
  test("setup, repoWins, notShared and a corrupt store", () => {
    skill(join(claude, "skills"), "mine");
    skill(join(claude, "skills"), "both");
    skill(join(repo, ".claude", "skills"), "both");
    write(join(claude, "rules", "context7.md"), "# rule\n");
    write(join(claude, "agents", "helper.md"), "---\nname: helper\n---\n");
    const setupFile = join(ch, "instructions", "context7.instructions.md");
    write(setupFile, "setup's\n");
    write(
      join(claude, "agentry", "install-manifest.json"),
      JSON.stringify({
        version: 1,
        parts: { copilot: { files: [{ path: setupFile, sha256: "0" }] } },
      })
    );
    write(paths().copilotShares, "{ not json");
    const states = Object.fromEntries(
      shareState(paths(), repo).map((item) => [
        `${item.kind}:${item.name}`,
        item.state,
      ])
    );
    assert.deepEqual(states, {
      "skill:both": "repoWins",
      "skill:mine": "notShared",
      "agent:helper": "notShared",
      "rule:context7": "setup",
    });
  });

  test("a setup-owned file is refused", async () => {
    const setupFile = join(ch, "instructions", "context7.instructions.md");
    write(setupFile, "setup's\n");
    write(
      join(claude, "agentry", "install-manifest.json"),
      JSON.stringify({
        version: 1,
        parts: { copilot: { files: [{ path: setupFile, sha256: "0" }] } },
      })
    );
    assert.equal(
      await engine().unshare({
        kind: "rule",
        name: "context7",
        path: repo,
        yes: true,
      }),
      1
    );
    assert.match(lines.join("\n"), /added by setup/);
    assert.ok(existsSync(setupFile));
  });
});
