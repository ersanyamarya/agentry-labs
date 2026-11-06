import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createUi, stripAnsi } from "./helpers/tui.js";

const SECRET = "sk-supersecretvalue1234567890";

let ui: ReturnType<typeof createUi>;
let origin: string;
const write = (file: string, text: string) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};
const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd: origin,
    stdio: "ignore",
  });
beforeEach(async () => {
  origin = mkdtempSync(join(tmpdir(), "agentry-origin-"));
  write(
    join(origin, "skills/alpha/SKILL.md"),
    "---\nname: alpha\ndescription: alpha does a thing\n---\n"
  );
  write(
    join(origin, "agents/helper.agent.md"),
    "---\nname: helper\ndescription: Helps out\n---\nbody v1\n"
  );
  write(join(origin, "rules/style.md"), "# Style\nUse tabs.\n");
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
      },
    })
  );
  write(
    join(origin, "bundles.tsv"),
    "web\tskills/alpha\nglobal\tagents/helper.agent.md\n"
  );
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  ui = createUi({ catalogRepo: origin });
  await ui.ready();
  await ui.press("6", "f");
  await ui.until(/web bundle/);
});
afterEach(() => ui?.stop());

const configFile = (...parts: string[]) => join(ui.fx.configDir, ...parts);

describe("Catalog tab beyond skills", () => {
  test("lists agents, rules, CLAUDE.md files and MCP servers in their own sections", async () => {
    await ui.moveTo(/^>\s+helper/);
    const frame = stripAnsi(ui.frame()!);
    assert.match(frame, /Agents/);
    assert.match(frame, /Catalog \(6\)/);
    assert.match(ui.frame()!, /\bi add/);
    assert.match(ui.frame()!, /\bo (add to this )?project/);
    await ui.moveTo(/^>\s+style/);
    await ui.moveTo(/^>\s+BASIC_CLAUDE/);
    await ui.moveTo(/^>\s+docs/);
    assert.match(stripAnsi(ui.frame()!), /MCP servers/);
    assert.match(ui.frame()!, /item: mcp\/docs/);
  });

  test("i on an agent previews, c copies, y adds it to ~/.claude/agents and the row shows where", async () => {
    await ui.moveTo(/^>\s+helper/);
    await ui.press("i");
    await ui.until(/Add agent\/helper \(preview\)/);
    await ui.until(/would add agent\/helper to ~\/.claude\/agents/);
    assert.equal(
      existsSync(configFile("agents/helper.agent.md")),
      false,
      "a preview copies nothing"
    );
    await ui.press("y");
    await ui.until(/Added helper as an agent/);
    assert.match(
      readFileSync(configFile("agents/helper.agent.md"), "utf8"),
      /body v1/
    );
    await ui.until(/helper\s+~\d+\s+● global/);
  });

  test("o adds an agent to this project only", async () => {
    await ui.moveTo(/^>\s+helper/);
    await ui.press("o");
    await ui.until(/Add agent\/helper to this project \(preview\)/);
    await ui.press("y");
    await ui.until(/Added helper as an agent/);
    assert.equal(
      existsSync(join(ui.fx.repo, ".claude/agents/helper.agent.md")),
      true
    );
    assert.equal(existsSync(configFile("agents/helper.agent.md")), false);
    await ui.until(/helper\s+~\d+\s+● project/);
  });

  test("a rule goes to ~/.claude/rules; o explains it is for agents and MCP servers", async () => {
    await ui.moveTo(/^>\s+style/);
    await ui.press("o");
    await ui.until(/o adds an agent or an MCP server to this project only/);
    await ui.press("i");
    await ui.until(/Add rule\/style \(preview\)/);
    await ui.press("y");
    await ui.until(/Added style to ~\/.claude\/rules/);
    assert.equal(existsSync(configFile("rules/style.md")), true);
  });

  test("a CLAUDE.md file is refused when the project has one, added when it has none", async () => {
    await ui.moveTo(/^>\s+BASIC_CLAUDE/);
    write(join(ui.fx.repo, "CLAUDE.md"), "mine\n");
    await ui.press("i");
    await ui.until(/Add claude-md\/BASIC_CLAUDE \(preview\)/);
    await ui.until(/already has .*CLAUDE.md; not overwriting/);
    await ui.until(/Nothing can be applied here/);
    await ui.press("y");
    assert.equal(readFileSync(join(ui.fx.repo, "CLAUDE.md"), "utf8"), "mine\n");
    await ui.press("n");
    writeFileSync(join(ui.fx.repo, "CLAUDE.md"), "");
    execFileSync("rm", [join(ui.fx.repo, "CLAUDE.md")]);
    await ui.press("i");
    await ui.until(
      /would add claude-md\/BASIC_CLAUDE to this project as CLAUDE.md/
    );
    await ui.press("y");
    await ui.until(/Added BASIC_CLAUDE as this project's CLAUDE.md/);
    assert.equal(
      readFileSync(join(ui.fx.repo, "CLAUDE.md"), "utf8"),
      "# Project guide\n"
    );
  });

  test("o on an MCP server previews with the secret masked, y writes .mcp.json", async () => {
    await ui.moveTo(/^>\s+docs/);
    await ui.press("o");
    await ui.until(/Add mcp\/docs to this project \(preview\)/);
    await ui.until(/Add project MCP server docs/);
    assert.ok(!ui.frame()!.includes!(SECRET), "the secret never shows");
    await ui.press("y");
    await ui.until(/Added docs as an MCP server/);
    assert.ok(!ui.frame()!.includes!(SECRET));
    assert.equal(
      JSON.parse(readFileSync(join(ui.fx.repo, ".mcp.json"), "utf8")).mcpServers
        .docs.url,
      "https://example.com/mcp"
    );
    await ui.until(/docs\s+-\s+● project/);
  });

  test("an outdated item shows it; u previews the files, y overwrites and saves the old copy", async () => {
    await ui.moveTo(/^>\s+helper/);
    await ui.press("i");
    await ui.until(/Add agent/);
    await ui.press("y");
    await ui.until(/helper\s+~\d+\s+● global\s*$/m);
    assert.doesNotMatch(ui.frame()!, /outdated/);
    await ui.press("u");
    await ui.until(/helper is up to date/);

    write(
      join(origin, "agents/helper.agent.md"),
      "---\nname: helper\ndescription: Helps out\n---\nbody v2\n"
    );
    git("add", "-A");
    git("commit", "-q", "-m", "v2");
    await ui.press("f");
    await ui.until(/● global outdated/);
    await ui.until(/\bu update.*q quit/);
    await ui.press("u");
    await ui.until(/Update agent\/helper \(preview\)/);
    await ui.until(/overwrite helper.agent.md/);
    assert.match(
      readFileSync(configFile("agents/helper.agent.md"), "utf8"),
      /body v1/,
      "a preview changes nothing"
    );
    await ui.press("y");
    await ui.until(/Updated agent\/helper/);
    assert.match(
      readFileSync(configFile("agents/helper.agent.md"), "utf8"),
      /body v2/
    );
    assert.equal(existsSync(configFile("backups/agentry/updated")), true);
    await ui.until(/helper\s+~\d+\s+● global\s*$/m);
  });

  test("an MCP server with other args shows outdated; u previews masked, y sets them and keeps your env", async () => {
    write(
      configFile(".claude.json"),
      `${JSON.stringify({ mcpServers: { tool: { type: "stdio", command: "echo", args: ["old"], env: { OTHER: "mine" } } } }, null, 2)}\n`
    );
    await ui.press("f");
    await ui.until(/user outdated/);
    await ui.moveTo(/^>\s+tool/);
    await ui.until(/\bu update.*q quit/);
    await ui.press("u");
    await ui.until(/Update mcp\/tool \(preview\)/);
    await ui.until(/Edit user MCP server tool/);
    assert.ok(!ui.frame()!.includes!(SECRET), "the secret never shows");
    await ui.press("y");
    await ui.until(/Updated mcp\/tool/);
    const { tool } = JSON.parse(
      readFileSync(configFile(".claude.json"), "utf8")
    ).mcpServers;
    assert.deepEqual(tool.args, ["hi"]);
    assert.deepEqual(tool.env, { OTHER: "mine", TOOL_TOKEN: SECRET });
  });

  test("x on an MCP row points at the right tab", async () => {
    await ui.moveTo(/^>\s+docs/);
    await ui.press("x");
    await ui.until(/x removes a skill, agent or rule here/);
  });

  test("x on an installed agent previews, y removes it and keeps a copy; on an installed rule it removes the file", async () => {
    await ui.moveTo(/^>\s+helper/);
    await ui.press("x");
    await ui.until(/helper is not installed/);
    await ui.press("i");
    await ui.until(/Add agent/);
    await ui.press("y");
    await ui.until(/helper\s+~\d+\s+● global\s*$/m);
    await ui.until(/\bx remove.*q quit/);
    await ui.press("x");
    await ui.until(/Remove agent\/helper \(preview\)/);
    await ui.until(/remove agent\/helper: ~\/.claude\/agents\/helper.agent.md/);
    assert.equal(
      existsSync(configFile("agents/helper.agent.md")),
      true,
      "a preview changes nothing"
    );
    await ui.press("y");
    await ui.until(/Removed agent\/helper; a copy is in/);
    assert.equal(existsSync(configFile("agents/helper.agent.md")), false);
    assert.equal(existsSync(configFile("backups/agentry/removed")), true);

    await ui.moveTo(/^>\s+style/);
    await ui.press("i");
    await ui.until(/Add rule/);
    await ui.press("y");
    await ui.until(/style\s+~\d+\s+● global/);
    await ui.press("X");
    await ui.until(/Remove rule\/style \(preview\)/);
    await ui.press("y");
    await ui.until(/Removed rule\/style; no copy was kept/);
    assert.equal(existsSync(configFile("rules/style.md")), false);
  });
});

describe("Rules tab", () => {
  beforeEach(() => {
    write(configFile("rules/style.md"), "# Style\nUse tabs.\n");
    write(configFile("CLAUDE.md"), "# User guide\n");
    write(join(ui.fx.repo, "CLAUDE.md"), "# Project guide\n");
  });

  test("lists user and project files with their cost; x previews, n cancels, y removes with a copy kept", async () => {
    await ui.press("r", "8");
    await ui.until(/8 Rules/);
    await ui.until(/style\.md\s+~\d+\s+rule/);
    const frame = stripAnsi(ui.frame()!);
    assert.match(frame, /User/);
    assert.match(frame, /This project/);
    assert.match(frame, /^\s*>?\s+CLAUDE\.md\s+~\d+\s+CLAUDE\.md$/m);
    await ui.moveTo(/^>.*rules\/style\.md/);
    assert.match(ui.frame()!, /x remove/);
    await ui.press("x");
    await ui.until(/Remove style\.md \(user rule\) \(preview\)/);
    await ui.until(/would remove style\.md \(user rule\)/);
    await ui.press("n");
    await ui.until(/Cancelled/);
    assert.equal(existsSync(configFile("rules/style.md")), true);
    await ui.press("x");
    await ui.until(/Remove style\.md/);
    await ui.press("y");
    await ui.until(/Removed style\.md/);
    assert.equal(existsSync(configFile("rules/style.md")), false);
    assert.equal(existsSync(configFile("backups/agentry/removed")), true);
    await ui.press("7");
    await ui.until(/style\.md \(user rule\)/);
    assert.match(stripAnsi(ui.frame()!), /removed rule/);
  });

  test("X keeps no copy; e opens the file", async () => {
    const calls: [string, string[]][] = [];
    await ui.stop?.();
    ui = createUi({
      catalogRepo: origin,
      env: { EDITOR: "myedit" },
      spawn: (command, args) => (calls.push([command, args]), { status: 0 }),
    });
    write(configFile("rules/style.md"), "# Style\n");
    await ui.ready();
    await ui.press("8");
    await ui.until(/style\.md\s+~\d+\s+rule/);
    assert.match(ui.frame()!, /x remove/);
    await ui.moveTo(/^>.*rules\/style\.md/);
    await ui.press("e");
    assert.equal(calls.length, 1);
    assert.match(calls[0][1].join(" "), /rules\/style\.md$/);
    await ui.press("X");
    await ui.until(/Remove style\.md/);
    await ui.press("y");
    await ui.until(/no copy was kept/);
    assert.equal(existsSync(configFile("backups/agentry/removed")), false);
  });
});
