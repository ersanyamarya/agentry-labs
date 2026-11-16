import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { readJsonc } from "../inventory/common.js";
import { createCopilotReader } from "../inventory/copilot.js";
import { createPaths } from "../paths.js";
import type { ReadError } from "../types.js";

const SECRET = "sk-live-0123456789abcdefSECRET";

let root: string;
let home: string;
let ch: string;
let repo: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-copilot-")));
  assert.ok(
    !root.startsWith(realpathSync(homedir())),
    "TMPDIR must be outside the home directory"
  );
  home = join(root, "home");
  ch = join(home, ".copilot");
  repo = join(home, "ws", "repo");
  mkdirSync(join(repo, "sub"), { recursive: true });
  mkdirSync(join(home, ".claude"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const write = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const writeJson = (file: string, value: unknown) =>
  write(file, JSON.stringify(value));
const skill = (dir: string, name: string) =>
  write(join(dir, name, "SKILL.md"), `---\nname: ${name}\n---\n`);
const paths = (env: NodeJS.ProcessEnv = {}) =>
  createPaths({
    env: {
      AGENTRY_HOME: home,
      CLAUDE_CONFIG_DIR: join(home, ".claude"),
      COPILOT_HOME: "",
      ...env,
    },
  });
const read = (env?: NodeJS.ProcessEnv) =>
  createCopilotReader(paths(env)).read({ cwd: repo });

describe("paths", () => {
  test("copilotDir follows COPILOT_HOME, else <home>/.copilot", () => {
    assert.equal(paths().copilotDir, ch);
    assert.equal(paths({ COPILOT_HOME: "/x/c" }).copilotDir, "/x/c");
    assert.equal(paths().agentsSkillsDir, join(home, ".agents", "skills"));
  });
});

describe("readJsonc", () => {
  const parse = (text: string) => {
    const file = join(root, "c.json");
    write(file, text);
    const errors: ReadError[] = [];
    return { value: readJsonc(file, errors), errors };
  };
  test("strips comments outside strings and trailing commas", () => {
    const { value, errors } = parse(
      '// header\n/* block */ {"a": "http://x//y /* not */", "b": [1, 2,], // tail\n"c": {"d": 1,},}\n'
    );
    assert.deepEqual(value, {
      a: "http://x//y /* not */",
      b: [1, 2],
      c: { d: 1 },
    });
    assert.deepEqual(errors, []);
  });
  test("keeps ,} inside a string and masks parse errors", () => {
    assert.deepEqual(parse('{"a": ",}"}').value, { a: ",}" });
    const bad = parse(`{"k": "${SECRET}" oops`);
    assert.equal(bad.value, undefined);
    assert.equal(bad.errors[0]?.message, "invalid JSON");
  });
  test("a missing file is undefined without an error", () => {
    const errors: ReadError[] = [];
    assert.equal(readJsonc(join(root, "none.json"), errors), undefined);
    assert.deepEqual(errors, []);
  });
});

describe("copilot reader", () => {
  test("present is false without a Copilot home", () => {
    assert.equal(read().present, false);
  });

  test("reads every source", () => {
    skill(join(ch, "skills"), "user-skill");
    skill(join(home, ".agents", "skills"), "agents-skill");
    skill(join(repo, ".github", "skills"), "gh-skill");
    skill(join(repo, ".claude", "skills"), "cl-skill");
    skill(join(repo, ".claude", "skills"), "user-skill");
    write(
      join(ch, "instructions", "a.instructions.md"),
      '---\napplyTo: "**/*.sh"\n---\nx\n'
    );
    write(
      join(repo, ".github", "instructions", "b.instructions.md"),
      "---\napplyTo: '**/*.ts'\n---\nx\n"
    );
    write(
      join(repo, ".claude", "rules", "c.md"),
      "---\npaths: [src/**]\n---\nx\n"
    );
    write(join(repo, ".claude", "rules", "d.md"), "plain\n");
    const hook = { type: "command", command: "echo hi" };
    writeJson(join(ch, "hooks", "h.json"), {
      hooks: { SessionStart: [{ hooks: [hook] }] },
    });
    writeJson(join(ch, "settings.json"), {
      hooks: { Stop: [{ hooks: [hook] }] },
    });
    writeJson(join(repo, ".github", "hooks", "r.json"), {
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [hook] }] },
    });
    writeJson(join(repo, ".claude", "settings.json"), {
      hooks: { Stop: [{ hooks: [hook] }] },
    });
    write(join(ch, "agents", "u.agent.md"), "---\nname: ua\n---\n");
    write(join(repo, ".github", "agents", "g.agent.md"), "x");
    write(join(repo, ".claude", "agents", "c.md"), "x");

    const inv = read();
    assert.equal(inv.present, true);
    assert.deepEqual(
      inv.skills.map((s) => [s.name, s.scope, s.shadowed]),
      [
        ["gh-skill", "repo", false],
        ["cl-skill", "repo", false],
        ["user-skill", "repo", false],
        ["user-skill", "user", true],
        ["agents-skill", "user", false],
      ]
    );
    assert.deepEqual(
      inv.instructions.map((i) => [i.scope, i.applyTo]),
      [
        ["user", "**/*.sh"],
        ["repo", "**/*.ts"],
        ["repo", "src/**"],
        ["repo", null],
      ]
    );
    assert.deepEqual(
      inv.hooks.map((h) => [h.event, h.scope, h.command]),
      [
        ["SessionStart", "user", "echo hi"],
        ["Stop", "user", "echo hi"],
        ["PreToolUse", "repo", "echo hi"],
        ["Stop", "repo", "echo hi"],
      ]
    );
    assert.ok(inv.hooks.every((h) => /^[0-9a-f]{8}$/.test(h.id)));
    assert.deepEqual(
      inv.agents.map((a) => [a.name, a.scope]),
      [
        ["ua", "user"],
        ["g", "repo"],
        ["c", "repo"],
      ]
    );
  });

  test("a non-default COPILOT_HOME skips ~/.agents/skills", () => {
    skill(join(home, ".agents", "skills"), "agents-skill");
    const other = join(root, "other");
    mkdirSync(other);
    assert.deepEqual(read({ COPILOT_HOME: other }).skills, []);
  });

  test("a broken skill link reports its target", () => {
    mkdirSync(join(ch, "skills"), { recursive: true });
    symlinkSync(join(root, "gone"), join(ch, "skills", "dead"));
    const [dead] = read().skills;
    assert.equal(dead?.state, "broken");
    assert.equal(dead?.target, join(root, "gone"));
  });

  test("config.json with a // header and a trusted parent folder", () => {
    write(
      join(ch, "config.json"),
      `// User settings belong in settings.json.\n// This file is managed automatically.\n{"trustedFolders": ["${join(home, "ws")}",]}\n`
    );
    const inv = read();
    assert.equal(inv.trusted, true);
    assert.deepEqual(inv.errors, []);
  });

  test("signedIn: false without the file, empty, or no user; true with a user, comments allowed", () => {
    assert.equal(read().signedIn, false);
    writeJson(join(ch, "config.json"), { loggedInUsers: [] });
    assert.equal(read().signedIn, false);
    writeJson(join(ch, "config.json"), { host: "https://github.com" });
    assert.equal(read().signedIn, false);
    write(
      join(ch, "config.json"),
      `// header\n{"loggedInUsers": [{"login": "${SECRET}"},], /* x */}\n`
    );
    const inv = read();
    assert.equal(inv.signedIn, true);
    assert.ok(!JSON.stringify(inv).includes(SECRET), "login is never copied");
    writeJson(join(ch, "config.json"), { lastLoggedInUser: { login: "x" } });
    assert.equal(read().signedIn, true);
  });

  test("not trusted without the key, or when only a sibling is listed", () => {
    write(join(ch, "config.json"), '// h\n{"firstLaunchAt": "x"}');
    assert.equal(read().trusted, false);
    writeJson(join(ch, "config.json"), {
      trustedFolders: [join(home, "ws", "other")],
    });
    assert.equal(read().trusted, false);
  });

  test("MCP servers are masked, workspace wins, disabledMcpServers applies", () => {
    writeJson(join(ch, "mcp-config.json"), {
      mcpServers: {
        dup: { type: "local", command: "user-cmd" },
        remote: {
          type: "http",
          url: `https://h/mcp?key=${SECRET}`,
          headers: { Authorization: `Bearer ${SECRET}` },
        },
        loc: { command: "node", args: ["s.js"], env: { TOKEN: SECRET } },
      },
    });
    writeJson(join(repo, ".mcp.json"), {
      mcpServers: { dup: { command: "repo-cmd" } },
    });
    writeJson(join(ch, "settings.json"), { disabledMcpServers: ["loc"] });
    const inv = read();
    const byName = Object.fromEntries(inv.mcp.map((m) => [m.name, m]));
    assert.equal(byName.dup?.scope, "workspace");
    assert.equal(byName.dup?.command, "repo-cmd");
    assert.equal(byName.dup?.overrides, join(ch, "mcp-config.json"));
    assert.equal(byName.loc?.disabled, true);
    assert.equal(byName.remote?.disabled, false);
    assert.equal(byName.remote?.url, "https://h/mcp?key=<masked>");
    assert.ok(!JSON.stringify(inv).includes(SECRET));
  });

  test("includeCoAuthoredBy: default true, user setting, trusted repo override", () => {
    assert.equal(read().includeCoAuthoredBy, true);
    writeJson(join(ch, "settings.json"), { includeCoAuthoredBy: false });
    assert.equal(read().includeCoAuthoredBy, false);
    writeJson(join(repo, ".github", "copilot", "settings.json"), {
      includeCoAuthoredBy: true,
    });
    assert.equal(read().includeCoAuthoredBy, false, "untrusted repo ignored");
    writeJson(join(ch, "config.json"), { trustedFolders: [repo] });
    assert.equal(read().includeCoAuthoredBy, true);
    writeJson(join(repo, ".github", "copilot", "settings.local.json"), {
      includeCoAuthoredBy: false,
    });
    assert.equal(read().includeCoAuthoredBy, false);
  });

  test("unreadable files are reported without their content", () => {
    write(join(ch, "mcp-config.json"), `{"k": "${SECRET}" nope`);
    const inv = read();
    assert.deepEqual(inv.errors, [
      { source: join(ch, "mcp-config.json"), message: "invalid JSON" },
    ]);
  });
});
