import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import type { Fixture } from "./helpers/fixture.js";
import { createFixture } from "./helpers/fixture.js";

const SECRET = "sk-supersecretvalue1234567890";
const CONFIG = `// Copilot config\n{\n  "loggedInUsers": [{ "login": "someone" }],\n  "trustedFolders": []\n}\n`;

let fx: Fixture;
let extra: NodeJS.ProcessEnv;

const ch = () => join(fx.home, ".copilot");
const put = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const undo = (set?: string) => {
  const result = fx.run(["fix", "--undo", ...(set ? [set] : []), "--yes"], {
    env: extra,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
};
const copilot = (args: string[]) =>
  fx.run(["copilot", ...args], { env: extra });
const claudeJson = () => join(fx.configDir, ".claude.json");
const backups = () =>
  existsSync(join(fx.configDir, "backups/agentry"))
    ? readdirSync(join(fx.configDir, "backups/agentry"))
    : [];

// Every file under a folder, as path -> bytes (links by their target), to compare before and after.
const snapshot = (dir: string): Record<string, string> => {
  const found: Record<string, string> = {};
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        found[path] = `-> ${readlinkSync(path)}`;
      } else if (entry.isDirectory()) {
        walk(path);
      } else {
        found[path] = readFileSync(path, "utf8");
      }
    }
  };
  if (existsSync(dir)) {
    walk(dir);
  }
  return found;
};

beforeEach(() => {
  fx = createFixture();
  // A fake pgrep so a Copilot running on the host never blocks trust.
  const bin = join(fx.root, "fakebin");
  put(join(bin, "pgrep"), "#!/bin/sh\nexit 1\n");
  chmodSync(join(bin, "pgrep"), 0o755);
  extra = { PATH: `${bin}:${process.env.PATH}` };
  put(
    join(fx.configDir, "skills/demo-skill/SKILL.md"),
    "---\nname: demo-skill\n---\n"
  );
  put(
    join(fx.configDir, "agents/demo-agent.md"),
    "---\nname: demo-agent\n---\nhi\n"
  );
  put(
    join(fx.configDir, "rules/demo-rule.md"),
    "---\npaths: src/**\n---\nbe nice\n"
  );
  put(
    claudeJson(),
    `${JSON.stringify(
      {
        numStartups: 3,
        mcpServers: {
          demo: {
            type: "stdio",
            command: "echo",
            args: ["hi"],
            env: { API_KEY: SECRET },
          },
        },
      },
      null,
      2
    )}\n`
  );
  put(join(ch(), "config.json"), CONFIG);
});
afterEach(() => fx.cleanup());

// The fixture secret must appear nowhere Copilot or the terminal could see it.
const assertNoSecret = (...outputs: string[]) => {
  for (const text of outputs) {
    assert.ok(!text.includes(SECRET), "the fixture secret leaked");
  }
  assert.ok(!snapshotText(ch()).includes(SECRET), "the secret reached <ch>");
};
const snapshotText = (dir: string) => JSON.stringify(snapshot(dir));

describe("agentry copilot usage and no Copilot", () => {
  test("--help lists the five subcommands and the flags", () => {
    const { status, stdout } = copilot(["--help"]);
    assert.equal(status, 0);
    for (const word of [
      "status",
      "share",
      "unshare",
      "trust",
      "untrust",
      "--kind",
      "--dry-run",
      "--yes",
      "--json",
      "all projects",
    ]) {
      assert.ok(stdout.includes(word), word);
    }
  });

  test("no or unknown subcommand, a missing name, a stray --kind or --yes with --dry-run exit 2", () => {
    for (const args of [
      [],
      ["bogus"],
      ["share"],
      ["status", "x"],
      ["trust", "--kind", "skill"],
      ["share", "a", "b"],
    ]) {
      assert.equal(copilot(args).status, 2, args.join(" "));
    }
    const both = copilot(["share", "demo-skill", "--yes", "--dry-run"]);
    assert.equal(both.status, 2);
    const json = copilot(["share", "demo-skill", "--json"]);
    assert.equal(json.status, 2);
    assert.match(json.stderr, /--json needs --yes or --dry-run/);
    assert.equal(
      copilot(["share", "demo-skill", "--kind", "bogus", "--dry-run"]).status,
      2
    );
  });

  test("without a Copilot home every subcommand says so, exits 1 and writes nothing", () => {
    fx.cleanup();
    fx = createFixture();
    put(join(fx.configDir, "skills/demo-skill/SKILL.md"), "x");
    const before = snapshot(fx.home);
    for (const args of [
      ["status"],
      ["status", "--json"],
      ["share", "demo-skill", "--yes"],
      ["unshare", "demo-skill", "--yes"],
      ["trust", "--yes"],
      ["untrust", "--yes"],
    ]) {
      const { status, stdout, stderr } = copilot(args);
      assert.equal(status, 1, args.join(" "));
      assert.match(stdout + stderr, /Copilot not found/);
    }
    assert.deepEqual(snapshot(fx.home), before);
    assert.equal(existsSync(ch()), false);
  });
});

describe("agentry copilot status", () => {
  test("lists every kind with its state; --json carries the same items", () => {
    const { status, stdout, stderr } = copilot(["status"]);
    assert.equal(status, 0, stderr);
    assert.match(stdout, /signed in/);
    for (const row of [
      "skill  demo-skill  Not shared",
      "agent  demo-agent",
      "rule  demo-rule",
      "mcp  demo",
    ]) {
      assert.ok(stdout.includes(row), row);
    }
    const json = JSON.parse(copilot(["status", "--json"]).stdout);
    assert.equal(json.signedIn, true);
    assert.equal(json.trusted, false);
    assert.deepEqual(
      json.items
        .map(
          (item: { kind: string; name: string; state: string }) =>
            `${item.kind}:${item.name}:${item.state}`
        )
        .sort(),
      [
        "agent:demo-agent:notShared",
        "mcp:demo:notShared",
        "rule:demo-rule:notShared",
        "skill:demo-skill:notShared",
      ]
    );
    assertNoSecret(stdout);
  });

  test("not signed in is noted and the commands still work", () => {
    put(join(ch(), "config.json"), "{}\n");
    const status = copilot(["status"]);
    assert.equal(status.status, 0);
    assert.match(status.stdout, /Not signed in to Copilot/);
    const share = copilot(["share", "demo-skill", "--dry-run"]);
    assert.equal(share.status, 0, share.stderr);
    assert.match(share.stderr, /Not signed in to Copilot/);
  });
});

describe("agentry copilot share and unshare, one of each kind", () => {
  test.each([
    [
      "skill",
      "demo-skill",
      () => join(ch(), "skills/demo-skill"),
      /: 1 skill, 0 agents, 0 rules, 0 MCP servers/,
    ],
    [
      "agent",
      "demo-agent",
      () => join(ch(), "agents/demo-agent.md"),
      /: 0 skills, 1 agent, 0 rules, 0 MCP servers/,
    ],
    [
      "rule",
      "demo-rule",
      () => join(ch(), "instructions/demo-rule.instructions.md"),
      /: 0 skills, 0 agents, 1 rule, 0 MCP servers/,
    ],
  ] as const)(
    "%s: --dry-run changes nothing, share writes, status shows it, unshare removes it, fix --undo reverts",
    (kind, name, target, line) => {
      const before = snapshot(fx.home);
      const dry = copilot(["share", name, "--dry-run"]);
      assert.equal(dry.status, 0, dry.stderr);
      assert.match(dry.stdout, /all projects/);
      assert.deepEqual(snapshot(fx.home), before);

      const shared = copilot(["share", name, "--yes"]);
      assert.equal(shared.status, 0, shared.stderr);
      assert.equal(existsSync(target()), true);
      assert.ok(backups().length > 0);
      const again = copilot(["share", name, "--yes"]);
      assert.equal(again.status, 0);
      assert.match(again.stdout, /already shared/);

      const listed = JSON.parse(copilot(["status", "--json"]).stdout);
      assert.equal(
        listed.items.find(
          (item: { kind: string; name: string }) =>
            item.kind === kind && item.name === name
        ).state,
        "shared"
      );
      const human = fx.run(["status"], { env: extra }).stdout;
      assert.match(human, line);

      const sharedJson = JSON.parse(
        fx.run(["status", "--json"], { env: extra }).stdout
      ).copilot;
      assert.equal(sharedJson.signedIn, true);
      assert.deepEqual(
        sharedJson.shared[
          { skill: "skills", agent: "agents", rule: "rules" }[kind]
        ],
        [name]
      );

      const afterShare = snapshot(fx.home);
      const undryUn = copilot(["unshare", name, "--dry-run"]);
      assert.equal(undryUn.status, 0);
      assert.deepEqual(snapshot(fx.home), afterShare);
      const unshared = copilot(["unshare", name, "--yes"]);
      assert.equal(unshared.status, 0, unshared.stderr);
      assert.equal(existsSync(target()), false);
      assert.match(copilot(["unshare", name, "--yes"]).stdout, /nothing to do/);

      // Undo the unshare, then the share: the Claude originals stay.
      undo();
      assert.equal(existsSync(target()), true);
      undo(backups().sort()[0]);
      assert.equal(existsSync(target()), false);
      assert.equal(
        existsSync(
          join(
            fx.configDir,
            kind === "skill"
              ? `skills/${name}/SKILL.md`
              : kind === "agent"
                ? `agents/${name}.md`
                : `rules/${name}.md`
          )
        ),
        true
      );
    }
  );

  test("mcp: the entry has ${VAR} placeholders only; the secret never reaches stdout, stderr or <ch>", () => {
    const dry = copilot(["share", "demo", "--dry-run"]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /API_KEY/);
    assert.ok(!existsSync(join(ch(), "mcp-config.json")));
    const done = copilot(["share", "demo", "--yes"]);
    assert.equal(done.status, 0, done.stderr);
    const entry = JSON.parse(
      readFileSync(join(ch(), "mcp-config.json"), "utf8")
    ).mcpServers.demo;
    assert.equal(entry.env.API_KEY, "${API_KEY}");
    assertNoSecret(
      dry.stdout,
      dry.stderr,
      done.stdout,
      done.stderr,
      copilot(["status"]).stdout
    );
    const reverted = undo();
    assertNoSecret(reverted.stdout, reverted.stderr);
    assert.ok(
      !existsSync(join(ch(), "mcp-config.json")) ||
        JSON.parse(readFileSync(join(ch(), "mcp-config.json"), "utf8"))
          .mcpServers?.demo === undefined
    );
  });

  test("a secret in the url is refused (exit 1, reason, nothing written)", () => {
    put(
      claudeJson(),
      `${JSON.stringify({ mcpServers: { leaky: { type: "http", url: `https://example.com/mcp?key=${SECRET}` } } })}\n`
    );
    const { status, stdout, stderr } = copilot(["share", "leaky", "--yes"]);
    assert.equal(status, 1);
    assert.match(stderr, /refused/);
    assert.ok(!existsSync(join(ch(), "mcp-config.json")));
    assertNoSecret(stdout, stderr);
  });

  test("refusals exit 1 with a reason: unknown name, not ours, a plugin or project item", () => {
    const unknown = copilot(["share", "nope", "--yes"]);
    assert.equal(unknown.status, 1);
    assert.match(
      unknown.stderr,
      /refused: No skill, agent, rule or MCP server named nope/
    );
    // Something of ours is not there: agentry will not touch it.
    put(join(ch(), "skills/demo-skill/SKILL.md"), "mine\n");
    const taken = copilot(["share", "demo-skill", "--yes"]);
    assert.equal(taken.status, 1);
    assert.match(taken.stderr, /refused/);
    assert.equal(
      readFileSync(join(ch(), "skills/demo-skill/SKILL.md"), "utf8"),
      "mine\n"
    );
    const notOurs = copilot([
      "unshare",
      "demo-skill",
      "--kind",
      "skill",
      "--yes",
    ]);
    assert.notEqual(notOurs.status, 2);
    assert.equal(
      readFileSync(join(ch(), "skills/demo-skill/SKILL.md"), "utf8"),
      "mine\n"
    );
    // A project skill is not a user skill.
    put(
      join(fx.repo, ".claude/skills/proj/SKILL.md"),
      "---\nname: proj\n---\n"
    );
    const project = copilot(["share", "proj", "--kind", "skill", "--yes"]);
    assert.equal(project.status, 1);
    assert.match(project.stderr, /not a user skill/);
  });

  test("a name in two kinds needs --kind (exit 2 naming them); --kind picks one", () => {
    put(
      join(fx.configDir, "agents/demo-skill.md"),
      "---\nname: demo-skill\n---\n"
    );
    const before = snapshot(ch());
    const ambiguous = copilot(["share", "demo-skill", "--yes"]);
    assert.equal(ambiguous.status, 2);
    assert.match(ambiguous.stderr, /skill, agent|agent, skill/);
    assert.match(ambiguous.stderr, /--kind/);
    assert.deepEqual(snapshot(ch()), before);
    const picked = copilot(["share", "demo-skill", "--kind", "agent", "--yes"]);
    assert.equal(picked.status, 0, picked.stderr);
    assert.equal(existsSync(join(ch(), "agents/demo-skill.md")), true);
    assert.equal(existsSync(join(ch(), "skills/demo-skill")), false);
  });

  test("--json shapes: dry-run and done", () => {
    const dry = JSON.parse(
      copilot(["share", "demo-skill", "--dry-run", "--json"]).stdout
    );
    assert.equal(dry.version, 1);
    assert.equal(dry.action, "share");
    assert.equal(dry.kind, "skill");
    assert.equal(dry.name, "demo-skill");
    assert.equal(dry.dryRun, true);
    assert.equal(dry.ok, true);
    assert.ok(Array.isArray(dry.output) && dry.output.length > 0);
    assert.equal(existsSync(join(ch(), "skills/demo-skill")), false);
    const done = JSON.parse(
      copilot(["share", "demo-skill", "--yes", "--json"]).stdout
    );
    assert.equal(done.ok, true);
    assert.equal(done.dryRun, false);
    assert.equal(existsSync(join(ch(), "skills/demo-skill")), true);
    const refused = copilot(["share", "nope", "--yes", "--json"]);
    assert.equal(refused.status, 1);
  });
});

describe("agentry copilot trust and untrust", () => {
  const trusted = () =>
    JSON.parse(
      readFileSync(join(ch(), "config.json"), "utf8").replace(/^\/\/.*\n/, "")
    ).trustedFolders as string[];

  test("--dry-run leaves config.json byte-identical; trust adds the repo root, keeping the comment; untrust removes it; undo reverts", () => {
    const original = readFileSync(join(ch(), "config.json"), "utf8");
    const dry = copilot(["trust", fx.repo, "--dry-run"]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(readFileSync(join(ch(), "config.json"), "utf8"), original);

    const done = copilot(["trust", fx.repo, "--yes"]);
    assert.equal(done.status, 0, done.stderr);
    assert.deepEqual(trusted(), [fx.repo]);
    assert.ok(
      readFileSync(join(ch(), "config.json"), "utf8").startsWith(
        "// Copilot config\n"
      )
    );
    assert.match(copilot(["trust", fx.repo, "--yes"]).stdout, /already trusts/);
    assert.equal(
      JSON.parse(
        fx.run(["copilot", "status", "--json"], { cwd: fx.root, env: extra })
          .stdout
      ).trusted,
      false
    );
    assert.equal(
      JSON.parse(
        fx.run(["copilot", "status", "--json"], { cwd: fx.repo, env: extra })
          .stdout
      ).trusted,
      true
    );

    const json = JSON.parse(
      copilot(["untrust", fx.repo, "--yes", "--json"]).stdout
    );
    assert.equal(json.ok, true);
    assert.equal(json.action, "untrust");
    assert.equal(json.dir, fx.repo);
    assert.deepEqual(trusted(), []);

    undo();
    assert.deepEqual(trusted(), [fx.repo]);
    undo(backups().sort()[0]);
    assert.equal(readFileSync(join(ch(), "config.json"), "utf8"), original);
  });

  test("trust defaults to the current folder's repo; a missing folder or config.json is refused", () => {
    const here = fx.run(["copilot", "trust", "--yes"], {
      cwd: fx.repo,
      env: extra,
    });
    assert.equal(here.status, 0, here.stderr);
    assert.deepEqual(trusted(), [fx.repo]);
    const missing = copilot(["trust", join(fx.root, "nowhere"), "--yes"]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Not a folder/);
    rmSync(join(ch(), "config.json"));
    const noConfig = copilot(["trust", fx.repo, "--yes"]);
    assert.equal(noConfig.status, 1);
    assert.match(noConfig.stderr, /start Copilot once/);
  });
});
