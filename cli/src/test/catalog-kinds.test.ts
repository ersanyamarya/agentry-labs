import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { installFakeClaude } from "./helpers/fake-claude.js";
import type { Fixture } from "./helpers/fixture.js";
import { createFixture } from "./helpers/fixture.js";

const SECRET = "sk-supersecretvalue1234567890";

let fx: Fixture;
let origin: string;
const write = (file: string, text: string) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};
const commit = (message: string) => {
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", ...args],
      { cwd: origin, stdio: "ignore" }
    );
  git("add", "-A");
  git("commit", "-q", "-m", message);
};
beforeEach(() => {
  fx = createFixture();
  origin = join(fx.root, "origin");
  write(
    join(origin, "skills/alpha/SKILL.md"),
    "---\nname: alpha\ndescription: Alpha does a thing\n---\n"
  );
  write(
    join(origin, "agents/helper.agent.md"),
    "---\nname: helper\ndescription: Helps out\n---\nbody v1\n"
  );
  write(join(origin, "rules/style.md"), "# Style\nUse tabs.\n");
  write(join(origin, "rules/shared.md"), "# Shared rule\n");
  write(join(origin, "rules/README.md"), "# not a rule\n");
  write(join(origin, "claude-md-files/BASIC_CLAUDE.md"), "# Project guide\n");
  write(
    join(origin, "global/mcp.json"),
    JSON.stringify({
      mcpServers: {
        docs: {
          type: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: `Bearer ${SECRET}` },
        },
        tool: {
          type: "stdio",
          command: "echo",
          args: ["hi"],
          env: { TOOL_TOKEN: SECRET },
        },
        shared: { type: "stdio", command: "true", args: [], env: {} },
      },
    })
  );
  write(
    join(origin, "bundles.tsv"),
    "global\tagents/helper.agent.md\nglobal\trules/style.md\nglobal\tclaude-md-files/BASIC_CLAUDE.md\nweb\tskills/alpha\n"
  );
  execFileSync("git", ["init", "-q"], { cwd: origin });
  commit("init");
});
afterEach(() => fx.cleanup());

const catalog = (...args: string[]) =>
  fx.run(["catalog", ...args], { env: { AGENTRY_CATALOG_REPO: origin } });
const fetched = (...args: string[]) => {
  catalog("refresh");
  return catalog(...args);
};
const agentFile = () => join(fx.configDir, "agents/helper.agent.md");

describe("catalog kinds", () => {
  test("list --json carries a kind for each item; README.md is not a rule; skills lead", () => {
    catalog("refresh");
    const json = JSON.parse(catalog("list", "--json").stdout);
    assert.deepEqual(
      json.map((entry: Record<string, any>) => entry.id),
      [
        "skill/alpha",
        "agent/helper",
        "rule/shared",
        "rule/style",
        "claude-md/BASIC_CLAUDE",
        "mcp/docs",
        "mcp/shared",
        "mcp/tool",
      ]
    );
    assert.equal(
      json.find((entry: Record<string, any>) => entry.id === "rule/style")
        .bundle,
      "global"
    );
    assert.equal(
      json.find((entry: Record<string, any>) => entry.id === "rule/shared")
        .bundle,
      "extras"
    );
    assert.equal(
      json.find((entry: Record<string, any>) => entry.id === "mcp/tool").tokens,
      null
    );
    assert.ok(
      json.every(
        (entry: Record<string, any>) => !("raw" in entry || "source" in entry)
      ),
      "no raw config in the JSON"
    );
    const { stdout } = catalog("list");
    assert.match(stdout, /^web +alpha +~ *\d+ +not installed$/m);
    assert.match(stdout, /^global +agent\/helper +~ *\d+ +not installed$/m);
    assert.match(stdout, /^global +mcp\/docs +- +not installed$/m);
  });

  test("agents: dry run, user and project targets, never overwrites", () => {
    catalog("refresh");
    assert.match(
      catalog("add", "agent/helper", "--dry-run").stdout,
      /would add agent\/helper to ~\/.claude\/agents/
    );
    assert.equal(existsSync(agentFile()), false);
    assert.match(
      catalog("add", "helper").stdout,
      /added agent\/helper to ~\/.claude\/agents/
    );
    assert.equal(readFileSync(agentFile(), "utf8").includes("body v1"), true);
    const again = catalog("add", "agent/helper");
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists; not overwriting/);
    assert.match(
      catalog("add", "agent/helper", "--project").stdout,
      /added agent\/helper to this project's .claude\/agents/
    );
    assert.equal(
      existsSync(join(fx.repo, ".claude/agents/helper.agent.md")),
      true
    );
    assert.match(
      catalog("list").stdout,
      /agent\/helper +~ *\d+ +~\/.claude\/agents, .claude\/agents$/m
    );
  });

  test("rules go to ~/.claude/rules", () => {
    catalog("refresh");
    assert.match(
      catalog("add", "rule/style").stdout,
      /added rule\/style to ~\/.claude\/rules/
    );
    assert.equal(
      readFileSync(join(fx.configDir, "rules/style.md"), "utf8"),
      "# Style\nUse tabs.\n"
    );
    assert.match(
      catalog("list").stdout,
      /rule\/style +~ *\d+ +~\/.claude\/rules$/m
    );
    assert.equal(catalog("add", "rule/style").status, 1);
  });

  test("a CLAUDE.md file becomes CLAUDE.md only when the project has none", () => {
    catalog("refresh");
    assert.match(
      catalog("add", "claude-md/BASIC_CLAUDE", "--dry-run").stdout,
      /would add claude-md\/BASIC_CLAUDE to this project as CLAUDE.md/
    );
    assert.equal(existsSync(join(fx.repo, "CLAUDE.md")), false);
    assert.equal(catalog("add", "BASIC_CLAUDE").status, 0);
    assert.equal(
      readFileSync(join(fx.repo, "CLAUDE.md"), "utf8"),
      "# Project guide\n"
    );
    const second = catalog("add", "BASIC_CLAUDE");
    assert.equal(second.status, 1);
    assert.match(second.stderr, /already has .*CLAUDE.md; not overwriting/);
    assert.equal(
      readFileSync(join(fx.repo, "CLAUDE.md"), "utf8"),
      "# Project guide\n"
    );
  });

  test("a CLAUDE.md in .claude/ also blocks it", () => {
    write(join(fx.repo, ".claude/CLAUDE.md"), "mine\n");
    catalog("refresh");
    assert.equal(catalog("add", "BASIC_CLAUDE").status, 1);
    assert.equal(existsSync(join(fx.repo, "CLAUDE.md")), false);
  });

  test("a bare name that two items share is refused with both ids", () => {
    catalog("refresh");
    const { status, stderr } = catalog("add", "shared");
    assert.equal(status, 1);
    assert.match(
      stderr,
      /"shared" matches rule\/shared and mcp\/shared; name one as kind\/name/
    );
    assert.equal(catalog("add", "rule/shared").status, 0);
    assert.match(catalog("add", "nope/x").stderr, /No item "nope\/x"/);
  });

  test("MCP: project scope previews masked, then --yes writes .mcp.json", () => {
    catalog("refresh");
    const preview = catalog("add", "mcp/docs", "--project", "--dry-run");
    assert.equal(preview.status, 0);
    assert.match(preview.stdout, /Add project MCP server docs/);
    assert.ok(!preview.stdout.includes(SECRET), "the secret never prints");
    assert.equal(existsSync(join(fx.repo, ".mcp.json")), false);
    const done = catalog("add", "mcp/docs", "--project", "--yes");
    assert.equal(done.status, 0, done.stderr);
    assert.ok(!done.stdout.includes(SECRET));
    assert.equal(
      JSON.parse(readFileSync(join(fx.repo, ".mcp.json"), "utf8")).mcpServers
        .docs.url,
      "https://example.com/mcp"
    );
    assert.match(catalog("list").stdout, /mcp\/docs +- +project$/m);
    const again = catalog("add", "mcp/docs", "--project", "--yes");
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists/);
  });

  test("MCP: user scope goes through claude mcp add-json", () => {
    const fake = join(fx.root, "fakebin");
    installFakeClaude(fake);
    write(
      join(fx.configDir, ".claude.json"),
      `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`
    );
    const env = {
      AGENTRY_CATALOG_REPO: origin,
      PATH: `${fake}:${process.env.PATH}`,
    };
    fx.run(["catalog", "refresh"], { env });
    const { status, stdout, stderr } = fx.run(
      ["catalog", "add", "mcp/tool", "--yes"],
      { env }
    );
    assert.equal(status, 0, stderr);
    assert.ok(!stdout.includes(SECRET));
    const argv = readFileSync(join(fake, "argv.log"), "utf8");
    assert.match(argv, /add-json/);
    assert.equal(
      JSON.parse(readFileSync(join(fx.configDir, ".claude.json"), "utf8"))
        .mcpServers.tool.env.TOOL_TOKEN,
      SECRET
    );
  });
});

describe("catalog update", () => {
  const upstream = () => {
    write(
      join(origin, "agents/helper.agent.md"),
      "---\nname: helper\ndescription: Helps out\n---\nbody v2\n"
    );
    write(join(origin, "skills/alpha/extra.md"), "new file\n");
    commit("v2");
    catalog("refresh");
  };

  test("an installed copy that matches is current; a changed catalog marks it outdated", () => {
    catalog("refresh");
    catalog("add", "agent/helper");
    catalog("add", "alpha");
    assert.doesNotMatch(catalog("list").stdout, /outdated/);
    upstream();
    const { stdout } = catalog("list");
    assert.match(stdout, /agent\/helper .*~\/.claude\/agents {2}outdated$/m);
    assert.match(stdout, /alpha .*shelf\/web {2}outdated$/m);
    const json = JSON.parse(catalog("list", "--json").stdout);
    assert.deepEqual(
      json
        .filter((entry: Record<string, any>) => entry.outdated)
        .map((entry: Record<string, any>) => entry.id),
      ["skill/alpha", "agent/helper"]
    );
  });

  test("a local edit also shows as outdated, and the preview names the file it will overwrite", () => {
    catalog("refresh");
    catalog("add", "rule/style");
    writeFileSync(
      join(fx.configDir, "rules/style.md"),
      "# Style\nUse spaces.\n"
    );
    assert.match(catalog("list").stdout, /rule\/style .*outdated$/m);
    const { stdout, status } = catalog("update", "rule/style", "--dry-run");
    assert.equal(status, 0);
    assert.match(stdout, /update rule\/style at ~\/.claude\/rules\/style.md:/);
    assert.match(
      stdout,
      /overwrite style.md {2}\(differs from the catalog copy: a local edit in it is replaced\)/
    );
    assert.match(stdout, /Dry run: nothing changed/);
    assert.equal(
      readFileSync(join(fx.configDir, "rules/style.md"), "utf8"),
      "# Style\nUse spaces.\n"
    );
  });

  test("without a terminal and without --yes it only previews", () => {
    catalog("refresh");
    catalog("add", "agent/helper");
    upstream();
    const { stdout } = catalog("update", "agent/helper");
    assert.match(stdout, /Nothing changed; run again with --yes/);
    assert.match(readFileSync(agentFile(), "utf8"), /body v1/);
  });

  test("--yes overwrites changed files, adds new ones, keeps local-only files, and saves the old copy", () => {
    catalog("refresh");
    catalog("add", "agent/helper");
    catalog("add", "alpha");
    write(join(fx.configDir, "skill-shelf/web/alpha/mine.md"), "my notes\n");
    upstream();
    const { status, stdout } = catalog("update", "--all", "--yes");
    assert.equal(status, 0);
    assert.match(stdout, /add extra.md/);
    assert.match(stdout, /keep mine.md {2}\(only in your copy; not touched\)/);
    assert.match(stdout, /updated agent\/helper \(global\)/);
    assert.match(readFileSync(agentFile(), "utf8"), /body v2/);
    assert.equal(
      readFileSync(
        join(fx.configDir, "skill-shelf/web/alpha/extra.md"),
        "utf8"
      ),
      "new file\n"
    );
    assert.equal(
      readFileSync(join(fx.configDir, "skill-shelf/web/alpha/mine.md"), "utf8"),
      "my notes\n"
    );
    const [stamp] = readdirSync(join(fx.configDir, "backups/agentry/updated"));
    assert.match(
      readFileSync(
        join(
          fx.configDir,
          "backups/agentry/updated",
          stamp,
          "agent_helper_user"
        ),
        "utf8"
      ),
      /body v1/
    );
    const meta = JSON.parse(
      readFileSync(
        join(fx.configDir, "backups/agentry/updated", stamp, "meta.json"),
        "utf8"
      )
    );
    assert.equal(meta.items.agent_helper_user.what, "agent");
    assert.ok(
      meta.items.agent_helper_user.from.endsWith("helper.md") ||
        meta.items.agent_helper_user.from.includes("helper")
    );
    assert.doesNotMatch(catalog("list").stdout, /outdated/);
    assert.match(
      catalog("update", "agent/helper").stdout,
      /agent\/helper is up to date/
    );
  });

  test("refuses what is not installed or has nothing to update; --all with nothing outdated says so", () => {
    catalog("refresh");
    const missing = catalog("update", "agent/helper");
    assert.equal(missing.status, 1);
    assert.match(
      missing.stderr,
      /not installed; agentry catalog add agent\/helper/
    );
    const mcp = catalog("update", "mcp/docs");
    assert.equal(mcp.status, 1);
    assert.match(mcp.stderr, /mcp\/docs is not installed/);
    assert.match(
      catalog("update", "--all").stdout,
      /Everything installed is up to date/
    );
    assert.equal(catalog("update").status, 2);
    assert.equal(catalog("update", "alpha", "--yes", "--dry-run").status, 2);
  });
});

describe("rules", () => {
  beforeEach(() => {
    write(join(fx.configDir, "rules/style.md"), "# Style\nUse tabs.\n");
    write(join(fx.configDir, "rules/sub/deep.md"), "# Deep\n");
    write(join(fx.configDir, "CLAUDE.md"), "# User guide\n");
    write(join(fx.repo, "CLAUDE.md"), "# Project guide\n".repeat(10));
    write(join(fx.repo, ".claude/rules/local.md"), "# Local\n");
  });

  test("list shows user and project files with token cost; --json has the kind", () => {
    const { stdout } = fx.run(["rules", "list"]);
    assert.match(stdout, /^user +~\/.claude\/CLAUDE.md +~ +\d+ tokens$/m);
    assert.match(stdout, /^user +~\/.claude\/rules\/sub\/deep.md/m);
    assert.match(stdout, /^project +CLAUDE.md +~ +40 tokens$/m);
    assert.match(stdout, /^project +.claude\/rules\/local.md/m);
    const json = JSON.parse(fx.run(["rules", "list", "--json"]).stdout);
    assert.deepEqual(
      json.map((entry: Record<string, any>) => `${entry.scope}:${entry.kind}`),
      [
        "user:claude-md",
        "user:rule",
        "user:rule",
        "project:claude-md",
        "project:rule",
      ]
    );
  });

  test("remove previews, then deletes with a copy that backups restore puts back", () => {
    const dry = fx.run(["rules", "remove", "CLAUDE.md", "--dry-run"]);
    assert.match(dry.stdout, /would remove CLAUDE.md \(project CLAUDE.md\)/);
    assert.equal(existsSync(join(fx.repo, "CLAUDE.md")), true);
    const done = fx.run(["rules", "remove", "CLAUDE.md"]);
    assert.equal(done.status, 0);
    assert.match(
      done.stdout,
      /removed CLAUDE.md \(project CLAUDE.md\); a copy is in /
    );
    assert.equal(existsSync(join(fx.repo, "CLAUDE.md")), false);
    const listed = fx.run(["backups", "list"]).stdout;
    assert.match(
      listed,
      /removed\/.*CLAUDE.md_\(project_CLAUDE.md\).*removed CLAUDE.md/
    );
    const [, id] = listed.match(/(removed\/\S+)/)!;
    assert.equal(fx.run(["backups", "restore", id]).status, 0);
    assert.equal(
      readFileSync(join(fx.repo, "CLAUDE.md"), "utf8"),
      "# Project guide\n".repeat(10)
    );
  });

  test("an ambiguous or unknown name is refused; --no-backup keeps no copy; user rules by label", () => {
    write(join(fx.repo, ".claude/rules/style.md"), "# Local style\n");
    const ambiguous = fx.run(["rules", "remove", "style.md"]);
    assert.equal(ambiguous.status, 2);
    assert.match(ambiguous.stderr, /matches 2 files/);
    assert.equal(fx.run(["rules", "remove", "nope.md"]).status, 2);
    const gone = fx.run([
      "rules",
      "remove",
      "~/.claude/rules/style.md",
      "--no-backup",
    ]);
    assert.match(gone.stdout, /no copy kept/);
    assert.equal(existsSync(join(fx.configDir, "rules/style.md")), false);
    assert.equal(
      existsSync(join(fx.configDir, "backups/agentry/removed")),
      false
    );
    assert.equal(fx.run(["rules", "remove"]).status, 2);
  });
});

describe("catalog remove agent", () => {
  test("previews, needs --yes without a terminal, keeps a copy that backups restore puts back", () => {
    catalog("refresh");
    catalog("add", "agent/helper");
    const dry = catalog("remove", "agent/helper", "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(
      dry.stdout,
      /remove agent\/helper: ~\/.claude\/agents\/helper.agent.md/
    );
    assert.match(dry.stdout, /Dry run: nothing changed/);
    assert.equal(existsSync(agentFile()), true);
    assert.match(
      catalog("remove", "agent/helper").stdout,
      /run again with --yes/
    );
    assert.equal(existsSync(agentFile()), true);
    const ok = catalog("remove", "helper", "--yes");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /removed agent\/helper/);
    assert.equal(existsSync(agentFile()), false);
    const [stamp] = readdirSync(join(fx.configDir, "backups/agentry/removed"));
    const meta = JSON.parse(
      readFileSync(
        join(fx.configDir, "backups/agentry/removed", stamp, "meta.json"),
        "utf8"
      )
    );
    assert.equal(meta.what, "agent");
    assert.equal(meta.from, agentFile());
    const restored = fx.run([
      "backups",
      "restore",
      `removed/${stamp}/agent_helper`,
    ]);
    assert.equal(restored.status, 0, restored.stderr);
    assert.match(readFileSync(agentFile(), "utf8"), /body v1/);
  });

  test("--project removes the project copy only; --no-backup keeps no copy; not installed and other kinds are refused", () => {
    catalog("refresh");
    catalog("add", "agent/helper");
    catalog("add", "agent/helper", "--project");
    const ok = catalog(
      "remove",
      "agent/helper",
      "--project",
      "--no-backup",
      "--yes"
    );
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(
      existsSync(join(fx.repo, ".claude/agents/helper.agent.md")),
      false
    );
    assert.equal(existsSync(agentFile()), true);
    assert.equal(
      existsSync(join(fx.configDir, "backups/agentry/removed")),
      false
    );
    const again = catalog("remove", "agent/helper", "--project", "--yes");
    assert.equal(again.status, 1);
    assert.match(again.stderr, /not installed in this project/);
    const skill = catalog("remove", "skill/alpha", "--yes");
    assert.equal(skill.status, 1);
    assert.match(skill.stderr, /agentry shelf remove/);
    assert.equal(catalog("remove").status, 2);
  });
});

describe("catalog update: CLAUDE.md files and MCP servers", () => {
  const claudeMd = () => join(fx.repo, "CLAUDE.md");

  test("CLAUDE.md: outdated when the project copy differs from the catalog's, update saves the old copy under updated/", () => {
    catalog("refresh");
    catalog("add", "claude-md/BASIC_CLAUDE");
    assert.doesNotMatch(catalog("list").stdout, /outdated/);
    write(
      join(origin, "claude-md-files/BASIC_CLAUDE.md"),
      "# Project guide\nnew rule\n"
    );
    commit("v2");
    catalog("refresh");
    assert.match(
      catalog("list").stdout,
      /claude-md\/BASIC_CLAUDE .*project {2}outdated$/m
    );
    const dry = catalog("update", "claude-md/BASIC_CLAUDE", "--dry-run");
    assert.match(dry.stdout, /update claude-md\/BASIC_CLAUDE at .*CLAUDE.md:/);
    assert.match(dry.stdout, /overwrite CLAUDE.md/);
    assert.equal(readFileSync(claudeMd(), "utf8"), "# Project guide\n");
    const done = catalog("update", "--all", "--yes");
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, /updated claude-md\/BASIC_CLAUDE \(project\)/);
    assert.equal(
      readFileSync(claudeMd(), "utf8"),
      "# Project guide\nnew rule\n"
    );
    const [stamp] = readdirSync(join(fx.configDir, "backups/agentry/updated"));
    const dir = join(fx.configDir, "backups/agentry/updated", stamp);
    assert.equal(
      readFileSync(join(dir, "claude-md_BASIC_CLAUDE_project"), "utf8"),
      "# Project guide\n"
    );
    assert.equal(
      JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")).items[
        "claude-md_BASIC_CLAUDE_project"
      ].what,
      "claude-md"
    );
    assert.doesNotMatch(catalog("list").stdout, /outdated/);
  });

  test("CLAUDE.md: a project file with another heading is not the catalog's and is never touched", () => {
    catalog("refresh");
    write(claudeMd(), "# My own notes\n");
    const json = JSON.parse(catalog("list", "--json").stdout);
    assert.equal(
      json.find(
        (entry: Record<string, any>) => entry.id === "claude-md/BASIC_CLAUDE"
      ).installed,
      undefined
    );
    assert.equal(
      catalog("update", "claude-md/BASIC_CLAUDE", "--yes").status,
      1
    );
    assert.equal(readFileSync(claudeMd(), "utf8"), "# My own notes\n");
  });

  const userServers = (servers: Record<string, unknown>) =>
    write(
      join(fx.configDir, ".claude.json"),
      `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`
    );
  const servers = () =>
    JSON.parse(readFileSync(join(fx.configDir, ".claude.json"), "utf8"))
      .mcpServers;

  test("MCP: new args and missing env keys go through mcp set, masked; existing env values stay; undo works", () => {
    catalog("refresh");
    userServers({
      tool: {
        type: "stdio",
        command: "echo",
        args: ["old"],
        env: { OTHER: "mine" },
      },
    });
    assert.match(catalog("list").stdout, /mcp\/tool .*user {2}outdated$/m);
    const dry = catalog("update", "mcp/tool", "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /update mcp\/tool in your user config/);
    assert.match(dry.stdout, /Edit user MCP server tool/);
    assert.ok(!dry.stdout.includes(SECRET), "the secret never prints");
    assert.deepEqual(servers().tool.args, ["old"]);
    const done = catalog("update", "mcp/tool", "--yes");
    assert.equal(done.status, 0, done.stderr);
    assert.ok(!done.stdout.includes(SECRET));
    assert.deepEqual(servers().tool.args, ["hi"]);
    assert.deepEqual(servers().tool.env, { OTHER: "mine", TOOL_TOKEN: SECRET });
    assert.doesNotMatch(catalog("list").stdout, /outdated/);
    assert.match(
      catalog("update", "mcp/tool").stdout,
      /mcp\/tool is up to date/
    );
    const undo = fx.run(["fix", "--undo", "--yes"]);
    assert.equal(undo.status, 0, undo.stderr);
    assert.deepEqual(servers().tool.args, ["old"]);
  });

  test("MCP: an env value you already have is never replaced; url servers and other commands are left alone", () => {
    catalog("refresh");
    userServers({
      tool: {
        type: "stdio",
        command: "echo",
        args: ["hi"],
        env: { TOOL_TOKEN: "mine-123" },
      },
      docs: { type: "http", url: "https://old.example/mcp" },
      shared: { type: "stdio", command: "other", args: ["x"] },
    });
    assert.doesNotMatch(catalog("list").stdout, /outdated/);
    assert.match(
      catalog("update", "--all").stdout,
      /Everything installed is up to date/
    );
    userServers({
      tool: {
        type: "stdio",
        command: "echo",
        args: ["old"],
        env: { TOOL_TOKEN: "mine-123" },
      },
    });
    assert.equal(catalog("update", "mcp/tool", "--yes").status, 0);
    assert.deepEqual(servers().tool, {
      type: "stdio",
      command: "echo",
      args: ["hi"],
      env: { TOOL_TOKEN: "mine-123" },
    });
  });
});
