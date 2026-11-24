// Copilot in the terminal UI: a Copilot column and the C and T keys on Skills, MCP, Agents and Rules, only when ~/.copilot
// exists and Copilot is signed in. Everything runs on a throwaway home (the fixture's <home>/.copilot), never the real one.
import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, test } from "vitest";
import { helpKeys } from "../components/help.js";
import { createUi, KEYS, stripAnsi } from "./helpers/tui.js";

let ui: ReturnType<typeof createUi>;
afterEach(() => ui?.stop());

type Fx = Parameters<
  NonNullable<Parameters<typeof createUi>[0]>["setup"] & {}
>[0];
const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const SIGNED_IN = '{ "loggedInUsers": [{ "login": "a" }] }\n';
const copilotHome = (fx: Fx) => join(fx.home, ".copilot");
const SERVER = { type: "stdio", command: "echo", args: ["hi"] };

// A user rule, a user and a project agent, a user MCP server, and a Copilot home (config text as given; none = no home).
const items = (config?: string) => (fx: Fx) => {
  write(join(fx.configDir, "rules", "style.md"), "# style\n");
  write(
    join(fx.configDir, "agents", "reviewer.md"),
    "---\nname: reviewer\ndescription: Reviews diffs\n---\nBody.\n"
  );
  write(
    join(fx.repo, ".claude", "agents", "helper.md"),
    "---\nname: helper\ndescription: Helps out\n---\n"
  );
  write(
    join(fx.configDir, ".claude.json"),
    `${JSON.stringify({ mcpServers: { userdemo: SERVER } })}\n`
  );
  if (config !== undefined) {
    write(join(copilotHome(fx), "config.json"), config);
  }
};
const open = async (config: string | null = SIGNED_IN, cols = 124) => {
  ui = createUi({
    personal: ["notes"],
    plugin: {
      settingsText: '{\n\t"enabledPlugins": {\n\t\t"demo@mkt": true\n\t}\n}\n',
    },
    setup: items(config ?? undefined),
    ...(cols === 124 ? {} : { fit: true }),
  });
  await ui.ready();
  if (cols !== 124) {
    await ui.resize(cols, 36);
  }
};
// Tab key and a word its list shows.
const TABS: [string, RegExp][] = [
  ["1", /Library\s+Skills/],
  ["2", /SERVER/],
  ["5", /Files\s+Cost/],
  ["6", /Agents\s+Cost/],
];

describe("Copilot is hidden without a signed-in Copilot", () => {
  for (const [label, config] of [
    ["no ~/.copilot", null],
    ["not signed in", "{}\n"],
  ] as const) {
    // biome-ignore lint/suspicious/noLoopFunc: the callback runs immediately and does not outlive the iteration
    test(`${label}: no column, no key hint, no help line, no sidebar line`, async () => {
      await open(config);
      assert.doesNotMatch(stripAnsi(ui.rail()), /Copilot/);
      for (const [key, name] of TABS) {
        await ui.press(key);
        await ui.until(name);
        assert.doesNotMatch(stripAnsi(ui.frame()!), /Copilot|Not shared/);
        await ui.press("?");
        await ui.until(/Keys \(\? or esc to close\)/);
        assert.doesNotMatch(stripAnsi(ui.frame()!), /Copilot|C {2,}share/);
        await ui.press("?");
      }
      // The keys do nothing: no preview, no notice.
      await ui.press("1");
      await ui.press("C");
      await ui.press("T");
      assert.doesNotMatch(stripAnsi(ui.frame()!), /preview|Copilot/);
      assert.ok(!existsSync(join(copilotHome(ui.fx), "skills")));
    });
  }

  test("helpKeys adds the Copilot lines only when asked and only on the four tabs", () => {
    const text = (tab: number, on: boolean) =>
      helpKeys(tab, on).flat().join(" ");
    for (const tab of [0, 1, 4, 5]) {
      assert.match(text(tab, true), /Copilot/);
      assert.doesNotMatch(text(tab, false), /Copilot/);
    }
    for (const tab of [2, 3, 6, 7, 8]) {
      assert.doesNotMatch(text(tab, true), /Copilot/);
    }
  });
});

describe("Copilot shown", () => {
  test("column, sidebar line, key hints and help on the four tabs", async () => {
    await open();
    assert.match(stripAnsi(ui.rail()), /Copilot in this repo[\s│]+Off/);
    await ui.until(/notes\s+Not shared/);
    for (const [key, name] of TABS) {
      await ui.press(key);
      await ui.until(name);
      await ui.until(/Not shared|Copilot/);
      await ui.press("?");
      const help = await ui.until(/Keys \(\? or esc to close\)/);
      assert.match(stripAnsi(help), /C\s+share or stop sharing with Copilot/);
      assert.match(stripAnsi(help), /T\s+turn Copilot on or off in this repo/);
      assert.match(stripAnsi(help), /all projects/);
      await ui.press("?");
    }
    await ui.press("2");
    await ui.until(/Copilot/);
    await ui.press("3");
    await ui.until(/nothing here/);
    assert.doesNotMatch(stripAnsi(ui.frame()!), /Copilot|Not shared/);
    await ui.press("C");
    assert.doesNotMatch(stripAnsi(ui.frame()!), /preview/);
    await ui.press("?");
    await ui.until(/Keys \(\? or esc to close\)/);
    assert.doesNotMatch(stripAnsi(ui.frame()!), /Copilot/);
  });

  test("Skills: C previews for all projects, y links the skill, C again unshares", async () => {
    await open();
    await ui.until(/notes\s+Not shared/);
    await ui.moveTo(/^>.*notes/);
    assert.match(ui.frame()!, /C share/);
    await ui.press("C");
    await ui.until(
      /Share the skill notes with Copilot for all projects \(preview\)/
    );
    assert.match(stripAnsi(ui.frame()!), /Preview only; nothing is written/);
    assert.ok(!existsSync(join(copilotHome(ui.fx), "skills", "notes")));
    await ui.press("y");
    await ui.until(/Shared the skill notes with Copilot for all projects/);
    assert.ok(
      lstatSync(join(copilotHome(ui.fx), "skills", "notes")).isSymbolicLink()
    );
    await ui.until(/notes\s+Shared/);
    await ui.until(/C unshare/);
    await ui.press("C");
    await ui.until(/Stop sharing the skill notes with Copilot \(preview\)/);
    await ui.press("n");
    await ui.until(/Cancelled; nothing changed/);
    assert.ok(existsSync(join(copilotHome(ui.fx), "skills", "notes")));
    await ui.press("C");
    await ui.until(/Stop sharing the skill notes/);
    await ui.press("y");
    await ui.until(/no longer shared with Copilot/);
    assert.ok(!existsSync(join(copilotHome(ui.fx), "skills", "notes")));
  });

  test("Skills: a project skill, a plugin skill and a library-only skill say why and write nothing", async () => {
    await open();
    await ui.until(/notes\s+Not shared/);
    await ui.moveTo(/^>.*▸ audit/, KEYS.up);
    await ui.press(KEYS.enter);
    await ui.moveTo(/^>.*review/);
    await ui.press("C");
    await ui.until(/In the library only: turn it on first/);
    await ui.moveTo(/^>.*proj/);
    await ui.until(/A project item: Copilot already loads/);
    await ui.press("C");
    assert.doesNotMatch(stripAnsi(ui.frame()!), /\(preview\)/);
    await ui.moveTo(/^>.*demo:\*/);
    await ui.press("C");
    await ui.until(/A plugin item: plugin items are not shared/);
    assert.doesNotMatch(stripAnsi(ui.frame()!), /\(preview\)/);
    assert.ok(!existsSync(join(copilotHome(ui.fx), "skills")));
  });

  test("Skills: a repo skill of the same name wins and is not shared", async () => {
    ui = createUi({
      personal: ["notes"],
      setup: (fx) => {
        items(SIGNED_IN)(fx);
        write(
          join(fx.repo, ".github", "skills", "notes", "SKILL.md"),
          "---\nname: notes\ndescription: repo\n---\n"
        );
      },
    });
    await ui.ready();
    await ui.until(/notes\s+Repo wins/);
    await ui.moveTo(/^>.*notes\s+Repo wins/);
    await ui.press("C");
    await ui.until(/This repo has its own item of that name/);
    assert.ok(!existsSync(join(copilotHome(ui.fx), "skills")));
  });

  test("Rules: a user rule is shared as an instructions file; CLAUDE.md and project rows say why", async () => {
    await open();
    await ui.press("5");
    await ui.until(/style\.md\s+~\d+\s+rule\s+Not shared/);
    await ui.moveTo(/^>.*style\.md/);
    await ui.press("C");
    await ui.until(
      /Share the rule style with Copilot for all projects \(preview\)/
    );
    await ui.press("y");
    await ui.until(/Shared the rule style with Copilot for all projects/);
    assert.ok(
      existsSync(
        join(copilotHome(ui.fx), "instructions", "style.instructions.md")
      )
    );
    await ui.until(/style\.md\s+~\d+\s+rule\s+Shared/);
  });

  test("Rules: a project CLAUDE.md says why and writes nothing", async () => {
    ui = createUi({
      setup: (fx) => {
        items(SIGNED_IN)(fx);
        write(join(fx.repo, "CLAUDE.md"), "# project\n");
      },
    });
    await ui.ready();
    await ui.press("5");
    await ui.until(/CLAUDE\.md/);
    await ui.moveTo(/^>.*CLAUDE\.md/);
    await ui.press("C");
    await ui.until(/A project item/);
    assert.ok(!existsSync(join(copilotHome(ui.fx), "instructions")));
  });

  test("Agents: a user agent is shared; a project agent says why", async () => {
    await open();
    await ui.press("6");
    await ui.until(/reviewer\s+~\d+\s+-\s+Not shared/);
    await ui.moveTo(/^>.*helper/);
    await ui.until(/A project item/);
    await ui.press("C");
    await ui.moveTo(/^>.*reviewer/, KEYS.up);
    await ui.press("C");
    await ui.until(
      /Share the agent reviewer with Copilot for all projects \(preview\)/
    );
    await ui.press("y");
    await ui.until(/Shared the agent reviewer with Copilot/);
    assert.ok(existsSync(join(copilotHome(ui.fx), "agents", "reviewer.md")));
    await ui.until(/reviewer\s+~\d+\s+-\s+Shared/);
  });

  test("MCP: a user server is shared with C; project and plugin rows say why", async () => {
    await open();
    await ui.press("2");
    await ui.until(/userdemo/);
    await ui.moveTo(/^>.*userdemo/);
    await ui.until(/userdemo.*Not shared/);
    await ui.press("C");
    await ui.until(
      /Share the MCP server userdemo with Copilot for all projects \(preview\)/
    );
    await ui.press("y");
    await ui.until(/Shared the MCP server userdemo with Copilot/);
    const config = JSON.parse(
      readFileSync(join(copilotHome(ui.fx), "mcp-config.json"), "utf8")
    );
    assert.equal(config.mcpServers.userdemo.command, "echo");
    await ui.moveTo(/^>.*\bdemo\s+project/, KEYS.up);
    await ui.press("C");
    await ui.until(/A project item/);
  });

  test("T turns Copilot on in this repo with a preview, and off again", async () => {
    await open();
    await ui.until(/notes\s+Not shared/);
    await ui.press("T");
    await ui.until(/Trust this folder in Copilot \(preview\)/);
    assert.match(
      stripAnsi(ui.frame()!),
      /run this repo's hooks and MCP servers/
    );
    await ui.press("y");
    await ui.until(/Copilot now trusts/);
    const trusted = () =>
      JSON.parse(readFileSync(join(copilotHome(ui.fx), "config.json"), "utf8"))
        .trustedFolders ?? [];
    assert.deepEqual(trusted(), [ui.fx.repo]);
    await ui.untilRail(/Copilot in this repo[\s│]+On/);
    await ui.until(/T stop Copilot/);
    await ui.press("T");
    await ui.until(/Stop trusting this folder in Copilot \(preview\)/);
    await ui.press("y");
    await ui.until(/no longer trusts/);
    assert.deepEqual(trusted(), []);
    await ui.untilRail(/Copilot in this repo[\s│]+Off/);
  });

  test("80 columns: every tab and its help fit, with the new column", async () => {
    await open(SIGNED_IN, 80);
    for (const [key, name] of TABS) {
      await ui.press(key);
      await ui.press(KEYS.down);
      await ui.until(name);
      const fits = (frame: string) =>
        stripAnsi(frame)
          .split("\n")
          .every((line) => [...line].length <= 80);
      assert.ok(fits(ui.raw()), `${name} at 80:\n${ui.raw()}`);
      await ui.press("?");
      await ui.until(/Keys \(\? or esc to close\)/);
      assert.ok(fits(ui.raw()), `${name} help at 80:\n${ui.raw()}`);
      assert.match(stripAnsi(ui.frame()!), /turn Copilot on or off/);
      await ui.press("?");
    }
  });
});
