import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
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
import { createData } from "../data.js";
import { createPaths } from "../paths.js";

let root: string;
let home: string;
let claude: string;
let ch: string;
let repo: string;
let running: boolean;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-data-copilot-")));
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
  execFileSync("git", ["init", "-q"], { cwd: repo });
  running = false;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const write = (target: string, content: string) => {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};
const skill = (name: string) =>
  write(
    join(claude, "skills", name, "SKILL.md"),
    `---\nname: ${name}\n---\nbody\n`
  );
const config = (text = '{ "loggedInUsers": [{ "login": "a" }] }\n') =>
  write(join(ch, "config.json"), text);
const data = () =>
  createData({
    makePaths: (dir) =>
      createPaths({
        env: {
          AGENTRY_HOME: home,
          CLAUDE_CONFIG_DIR: claude,
          COPILOT_HOME: "",
        },
        cwd: dir,
      }),
    isCopilotRunning: () => running,
  });
const isLink = (path: string) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

describe("data copilot facade", () => {
  test("without ~/.copilot there is no state and load has no copilot field", () => {
    skill("demo");
    assert.equal(data().copilotState(repo), undefined);
    assert.ok(!("copilot" in data().load(repo)));
  });

  test("with ~/.copilot: signed in, trusted and one row per Claude user item", () => {
    skill("demo");
    write(join(claude, "rules", "style.md"), "# rule\n");
    config(
      `{ "loggedInUsers": [{ "login": "a" }], "trustedFolders": [${JSON.stringify(repo)}] }\n`
    );
    const state = data().copilotState(repo);
    assert.ok(state);
    assert.equal(state.signedIn, true);
    assert.equal(state.trusted, true);
    assert.deepEqual(state.items, [
      { kind: "skill", name: "demo", state: "notShared", repoWins: false },
      { kind: "rule", name: "style", state: "notShared", repoWins: false },
    ]);
    assert.deepEqual(data().load(repo).copilot, state);
  });

  test("signed out and untrusted", () => {
    config("{}\n");
    const state = data().copilotState(repo);
    assert.ok(state);
    assert.equal(state.signedIn, false);
    assert.equal(state.trusted, false);
    assert.deepEqual(state.items, []);
  });

  test("a repo skill of the same name is repoWins and says why", () => {
    config();
    skill("demo");
    write(
      join(repo, ".claude", "skills", "demo", "SKILL.md"),
      "---\nname: demo\n---\nrepo\n"
    );
    const [item] = data().copilotState(repo)?.items ?? [];
    assert.equal(item.state, "repoWins");
    assert.equal(item.repoWins, true);
    assert.ok(item.why);
  });

  test("preview shares nothing, apply shares the skill, unshare takes it back", async () => {
    config();
    skill("demo");
    const call = {
      dir: repo,
      action: "share" as const,
      kind: "skill" as const,
      name: "demo",
    };
    const preview = await data().previewCopilot(call);
    assert.equal(preview.appliable, true);
    assert.match(preview.text, /demo/);
    assert.ok(!existsSync(join(ch, "skills", "demo")));
    const outcome = await data().applyCopilot(call);
    assert.equal(outcome.ok, true, outcome.text);
    assert.ok(isLink(join(ch, "skills", "demo")));
    assert.equal(data().copilotState(repo)?.items[0].state, "shared");
    const again = await data().previewCopilot(call);
    assert.equal(again.appliable, false);
    const undo = await data().applyCopilot({ ...call, action: "unshare" });
    assert.equal(undo.ok, true, undo.text);
    assert.ok(!existsSync(join(ch, "skills", "demo")));
  });

  test("trust and untrust this repo, and refuse while Copilot runs", async () => {
    config('{ "trustedFolders": ["/elsewhere"] }\n');
    const trust = { dir: repo, action: "trust" as const };
    const preview = await data().previewCopilot(trust);
    assert.equal(preview.appliable, true);
    assert.ok(!readFileSync(join(ch, "config.json"), "utf8").includes(repo));
    running = true;
    const refused = await data().applyCopilot(trust);
    assert.equal(refused.ok, false);
    assert.match(refused.text, /running/);
    running = false;
    const done = await data().applyCopilot(trust);
    assert.equal(done.ok, true, done.text);
    assert.equal(data().copilotState(repo)?.trusted, true);
    const undone = await data().applyCopilot({ ...trust, action: "untrust" });
    assert.equal(undone.ok, true, undone.text);
    assert.equal(data().copilotState(repo)?.trusted, false);
  });

  test("an unknown name is refused and nothing is written", async () => {
    config();
    const call = {
      dir: repo,
      action: "share" as const,
      kind: "skill" as const,
      name: "nope",
    };
    const preview = await data().previewCopilot(call);
    assert.equal(preview.appliable, false);
    assert.match(preview.text, /refused/);
    const outcome = await data().applyCopilot(call);
    assert.equal(outcome.ok, false);
    assert.ok(!existsSync(join(ch, "skills")));
    const missing = await data().applyCopilot({ dir: repo, action: "share" });
    assert.equal(missing.ok, false);
  });
});
