import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createCopilotTrust } from "../copilot-trust.js";
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

const write = (target: string, content: string) => {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
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

const HEADER = "// User settings\n// keep me\n";
const config = (extra = '"trustedFolders": ["/a"]') =>
  `${HEADER}{\n  "model": "x",\n  ${extra}\n}\n`;
const file = () => join(ch, "config.json");
const read = () => readFileSync(file(), "utf8");
let running = false;
const trustEngine = () =>
  createCopilotTrust(paths(), { ...io, isCopilotRunning: () => running });
const trust = () => trustEngine().trust(repo, { yes: true });
const untrust = () => trustEngine().untrust(repo, { yes: true });
beforeEach(() => {
  running = false;
});

describe("trust", () => {
  test("adds the repo root, keeps the comment header and other keys byte for byte", async () => {
    write(file(), config());
    assert.equal(await trust(), 0, log());
    const text = read();
    assert.ok(text.startsWith(HEADER));
    assert.ok(text.includes(JSON.stringify(repo)));
    assert.ok(text.includes('"model": "x"'));
    assert.ok(text.includes('"/a"'));
    assert.deepEqual(
      JSON.parse(text.replace(/^\/\/.*\n/gm, "")).trustedFolders,
      ["/a", repo]
    );
  });

  test("undo puts config.json back byte for byte", async () => {
    write(file(), config());
    const before = read();
    assert.equal(await trust(), 0, log());
    assert.equal(
      await createFixUndo(paths(), io).run({ yes: true, force: false }),
      0,
      log()
    );
    assert.equal(read(), before);
  });

  test("already trusted: nothing written", async () => {
    write(file(), config(`"trustedFolders": [${JSON.stringify(repo)}]`));
    const before = read();
    assert.equal(await trust(), 0);
    assert.match(log(), /already trusts/);
    assert.equal(read(), before);
  });

  test("a parent entry already trusts it: nothing written", async () => {
    write(
      file(),
      config(`"trustedFolders": [${JSON.stringify(dirname(repo))}]`)
    );
    const before = read();
    assert.equal(await trust(), 0);
    assert.match(log(), /already trusts/);
    assert.equal(read(), before);
  });

  test("running Copilot refuses", async () => {
    write(file(), config());
    running = true;
    assert.equal(await trust(), 1);
    assert.match(log(), /Copilot is running/);
    assert.equal(read(), config());
  });

  test("missing config.json: start Copilot once", async () => {
    assert.equal(await trust(), 1);
    assert.match(log(), /start Copilot once/);
    assert.equal(existsSync(file()), false);
  });

  test("--dry-run writes nothing", async () => {
    write(file(), config());
    assert.equal(await trustEngine().trust(repo, { dryRun: true }), 0, log());
    assert.equal(read(), config());
  });
});

describe("untrust", () => {
  test("removes only the exact entry", async () => {
    write(file(), config(`"trustedFolders": ["/a", ${JSON.stringify(repo)}]`));
    assert.equal(await untrust(), 0, log());
    assert.ok(read().startsWith(HEADER));
    assert.deepEqual(
      JSON.parse(read().replace(/^\/\/.*\n/gm, "")).trustedFolders,
      ["/a"]
    );
  });

  test("says when a parent entry still trusts the repo", async () => {
    const parent = dirname(repo);
    write(
      file(),
      config(
        `"trustedFolders": [${JSON.stringify(parent)}, ${JSON.stringify(repo)}]`
      )
    );
    assert.equal(await untrust(), 0, log());
    assert.match(log(), /stays trusted/);
    assert.ok(read().includes(JSON.stringify(parent)));
    assert.ok(!read().includes(JSON.stringify(repo)));
  });

  test("not listed: nothing to do, and a parent note", async () => {
    write(
      file(),
      config(`"trustedFolders": [${JSON.stringify(dirname(repo))}]`)
    );
    const before = read();
    assert.equal(await untrust(), 0);
    assert.match(log(), /not in Copilot's trusted folders/);
    assert.match(log(), /stays trusted/);
    assert.equal(read(), before);
  });

  test("running Copilot refuses", async () => {
    write(file(), config(`"trustedFolders": [${JSON.stringify(repo)}]`));
    running = true;
    assert.equal(await untrust(), 1);
  });
});
