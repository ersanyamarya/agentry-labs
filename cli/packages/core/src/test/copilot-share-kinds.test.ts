import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { toInstructions } from "../copilot-rules.js";
import { createCopilotShare, readShareStore } from "../copilot-share.js";
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
  root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-kinds-")));
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
const paths = () =>
  createPaths({
    env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: claude, COPILOT_HOME: "" },
    cwd: repo,
  });
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
const log = () => lines.join("\n");

const engine = () => createCopilotShare(paths(), io);
const share = (kind: "skill" | "agent" | "rule", name: string) =>
  engine().share({ kind, name, path: repo, yes: true });
const unshare = (kind: "skill" | "agent" | "rule", name: string) =>
  engine().unshare({ kind, name, path: repo, yes: true });
const undo = () => createFixUndo(paths(), io).run({ yes: true, force: false });
const gone = (path: string) => {
  try {
    lstatSync(path);
    return false;
  } catch {
    return true;
  }
};
const skill = (dir: string, name: string) =>
  write(join(dir, name, "SKILL.md"), `---\nname: ${name}\n---\nbody\n`);
const agent = (dir: string, name: string) =>
  write(join(dir, `${name}.md`), `---\nname: ${name}\n---\nbody\n`);

describe("skills", () => {
  test("a project skill is refused with the reason", async () => {
    skill(join(repo, ".claude", "skills"), "proj");
    assert.equal(await share("skill", "proj"), 1);
    assert.match(log(), /Copilot already loads this repo's \.claude\/skills/);
    assert.ok(gone(join(ch, "skills", "proj")));
  });

  test("a name <ch> already has that is not ours is refused", async () => {
    skill(join(claude, "skills"), "demo");
    write(join(ch, "skills", "demo", "SKILL.md"), "mine");
    assert.equal(await share("skill", "demo"), 1);
    assert.match(log(), /did not create it/);
    assert.equal(
      readFileSync(join(ch, "skills", "demo", "SKILL.md"), "utf8"),
      "mine"
    );
  });

  test("a repo skill of the same name warns and still shares", async () => {
    skill(join(claude, "skills"), "demo");
    skill(join(repo, ".claude", "skills"), "demo");
    assert.equal(await share("skill", "demo"), 0, log());
    assert.match(log(), /This repo has its own skill demo/);
    assert.ok(lstatSync(join(ch, "skills", "demo")).isSymbolicLink());
  });
});

describe("agents", () => {
  test("share links the agent file, unshare and undo keep the original", async () => {
    agent(join(claude, "agents"), "rev");
    assert.equal(await share("agent", "rev"), 0, log());
    const link = join(ch, "agents", "rev.md");
    assert.equal(readlinkSync(link), join(claude, "agents", "rev.md"));
    assert.ok(readShareStore(paths()).items["agent:rev"]);

    assert.equal(await unshare("agent", "rev"), 0, log());
    assert.ok(gone(link));
    assert.equal(await undo(), 0, log());
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.ok(lstatSync(join(claude, "agents", "rev.md")).isFile());
  });

  test("a repo agent of the same name refuses (.github and .claude)", async () => {
    agent(join(claude, "agents"), "a");
    agent(join(claude, "agents"), "b");
    agent(join(repo, ".github", "agents"), "a");
    agent(join(repo, ".claude", "agents"), "b");
    assert.equal(await share("agent", "a"), 1);
    assert.match(log(), /own agent a/);
    assert.equal(await share("agent", "b"), 1);
    assert.match(log(), /own agent b/);
    assert.ok(gone(join(ch, "agents")));
  });

  test("a project-only agent is refused as not a user agent", async () => {
    agent(join(repo, ".claude", "agents"), "p");
    assert.equal(await share("agent", "p"), 1);
    assert.match(log(), /Copilot already loads this repo's \.claude\/agents/);
  });

  test("a name <ch> already has that is not ours is refused", async () => {
    agent(join(claude, "agents"), "rev");
    write(join(ch, "agents", "rev.md"), "mine");
    assert.equal(await share("agent", "rev"), 1);
    assert.equal(readFileSync(join(ch, "agents", "rev.md"), "utf8"), "mine");
  });
});

describe("rules", () => {
  const rule = join("rules", "style.md");

  test("with frontmatter: paths becomes applyTo, description kept", async () => {
    write(
      join(claude, rule),
      '---\npaths:\n  - src/**\n  - "lib/**"\ndescription: House style\n---\n\nUse tabs.\n'
    );
    assert.equal(await share("rule", "style"), 0, log());
    const file = join(ch, "instructions", "style.instructions.md");
    assert.equal(
      readFileSync(file, "utf8"),
      '---\napplyTo: ["src/**", "lib/**"]\ndescription: "House style"\n---\n\nUse tabs.\n'
    );
    assert.ok(readShareStore(paths()).items["rule:style"].sha256);
  });

  test("without frontmatter: applyTo ** and a derived description", async () => {
    write(join(claude, rule), "# Be brief\n\nShort answers.\n");
    assert.equal(await share("rule", "style"), 0, log());
    assert.equal(
      readFileSync(join(ch, "instructions", "style.instructions.md"), "utf8"),
      '---\napplyTo: "**"\ndescription: "Be brief"\n---\n\n# Be brief\n\nShort answers.\n'
    );
    assert.equal(
      toInstructions("x"),
      '---\napplyTo: "**"\ndescription: "x"\n---\n\nx'
    );
  });

  test("unshare deletes only an unchanged file; undo restores it", async () => {
    write(join(claude, rule), "Plain.\n");
    await share("rule", "style");
    const file = join(ch, "instructions", "style.instructions.md");
    writeFileSync(file, "edited");
    assert.equal(await unshare("rule", "style"), 1);
    assert.equal(readFileSync(file, "utf8"), "edited");

    rmSync(file);
    await share("rule", "style");
    assert.equal(await unshare("rule", "style"), 0, log());
    assert.ok(gone(file));
    assert.equal(await undo(), 0, log());
    assert.ok(!gone(file));
  });

  test("a file in setup's install manifest is refused", async () => {
    write(join(claude, rule), "Plain.\n");
    const file = join(ch, "instructions", "style.instructions.md");
    write(file, "setup text");
    write(
      paths().installManifest,
      JSON.stringify({ parts: { copilot: { files: [{ path: file }] } } })
    );
    assert.equal(await share("rule", "style"), 1);
    assert.match(log(), /added by setup/);
    assert.equal(readFileSync(file, "utf8"), "setup text");
  });

  test("a missing rule is refused", async () => {
    assert.equal(await share("rule", "nope"), 1);
    assert.match(log(), /No rule nope/);
  });
});
