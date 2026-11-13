// Renders the UI on a throwaway home with injected doctor rules and fixes. Never touches the real ~/.claude.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createData } from "@agentry/core/data";
import { createDiscover } from "@agentry/core/discover";
import type { DoctorOptions } from "@agentry/core/doctor";
import type { Rule } from "@agentry/core/doctor-rules";
import { createPaths } from "@agentry/core/paths";
import type { Finding } from "@agentry/core/types";
import { render } from "ink-testing-library";
import {
  addPlugin,
  createFixture,
} from "../../../../../src/test/helpers/fixture.js";
import { App, type AppProps } from "../../app.js";
import { createRecents } from "../../recents.js";

export const KEYS = {
  up: "\u001B[A",
  down: "\u001B[B",
  right: "\u001B[C",
  left: "\u001B[D",
  enter: "\r",
  esc: "\u001B",
  space: " ",
  tab: "\t",
};

// Frames carry escape codes when the test forces colour; patterns match the frame as drawn or with the codes removed.
export const stripAnsi = (text: string) =>
  text.replace(/\u001B\[[0-9;]*m/g, "");

// The frame with box borders removed and whitespace collapsed, so text the details pane wrapped can still be matched.
export const squash = (text: string) =>
  stripAnsi(text)
    .replace(/[│┌┐└┘─╭╮╰╯]/g, " ")
    .replace(/\s+/g, " ");

// The left rail is drawn on every line of a frame. Most tests look at the list and the details, so they see the frame
// without the rail; `rail()` gives the rail alone.
const RAIL =
  /^((?:\u001B\[[0-9;]*m|[^│|\u001B]){0,40}[│|])(?:\u001B\[[0-9;]*m)?/;
export const withoutRail = (frame: string) =>
  frame
    .split("\n")
    .map((line) => line.replace(RAIL, ""))
    .join("\n");
export const railOf = (frame: string) =>
  frame
    .split("\n")
    .map((line) => RAIL.exec(line)?.[1] ?? "")
    .join("\n");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface UiOptions {
  catalogRepo?: string;
  clipboard?: AppProps["clipboard"];
  env?: NodeJS.ProcessEnv;
  fit?: boolean;
  personal?: string[];
  plugin?: Parameters<typeof addPlugin>[1];
  size?: { cols: number; rows: number };
  spawn?: AppProps["spawn"];
}

export const createUi = ({
  env = {},
  spawn,
  personal = [],
  plugin,
  size = { cols: 124, rows: 60 }, // 102 columns for the list beside the 22-column rail
  fit = false,
  catalogRepo,
  clipboard,
}: UiOptions = {}) => {
  const fx = createFixture({
    shelf: {
      audit: { skills: ["review"] },
      video: { skills: ["trim", "ffmpeg-install"] },
    },
  });
  assert.ok(
    !fx.root.startsWith(homedir()),
    "TMPDIR must be outside the home directory"
  );
  writeFileSync(
    join(fx.configDir, "skill-shelf/video/trim/SKILL.md"),
    `---\nname: trim\ndescription: ${"x".repeat(40)}\n---\n`
  );

  for (const name of personal) {
    mkdirSync(join(fx.configDir, "skills", name), { recursive: true });
    writeFileSync(
      join(fx.configDir, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${"z".repeat(8)}\n---\n`
    );
  }
  mkdirSync(join(fx.repo, ".claude/skills/proj"), { recursive: true });
  writeFileSync(
    join(fx.repo, ".claude/skills/proj/SKILL.md"),
    "---\nname: proj\ndescription: p\n---\n"
  );
  const pluginInfo = plugin ? addPlugin(fx, plugin) : undefined;

  const target = join(fx.repo, "target.json");
  writeFileSync(target, '{\n\t"value": "BAD"\n}\n');
  writeFileSync(
    join(fx.repo, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        demo: {
          command: "echo",
          args: ["hi"],
          env: { API_KEY: "sk-supersecretvalue1234567890" },
        },
      },
    })
  );
  const rules: Rule[] = [
    {
      id: "fake-bad",
      run: () =>
        readFileSync(target, "utf8").includes("BAD")
          ? [
              {
                id: "fake-bad",
                severity: "warning",
                message: "target.json says BAD",
                file: target,
              },
            ]
          : [],
    },
    {
      id: "fake-nofix",
      run: () => [
        {
          id: "fake-nofix",
          severity: "info",
          message: "nothing can repair this",
          file: target,
        },
      ],
    },
  ];
  const fixes = {
    "fake-bad": (finding: Finding) => ({
      ruleId: finding.id,
      file: finding.file,
      describe: () => "Replace BAD with GOOD",
      apply: (text: string | undefined) => text?.replace("BAD", "GOOD"),
    }),
  };
  const doctorOptions: DoctorOptions = {
    platform: "linux",
    env: { PATH: "" },
    rules,
    renames: {},
    launchctlGetenv: () => "",
  };

  const makePaths = (dir: string) =>
    createPaths({
      env: {
        AGENTRY_HOME: fx.home,
        CLAUDE_CONFIG_DIR: fx.configDir,
        AGENTRY_MANAGED_DIR: fx.managedDir,
      },
      cwd: dir,
    });
  const finder = createDiscover();
  const props = {
    api: createData({
      makePaths,
      doctorOptions,
      fixOptions: { fixes },
      ...(catalogRepo ? { catalogOptions: { repo: catalogRepo } } : {}),
    }),
    startDir: fx.repo,
    recents: createRecents(makePaths(fx.repo)),
    discover: (roots: string[]) => finder.find(roots, { depth: 2 }),
    env,
    spawn,
    clipboard,
    ...(fit ? {} : { size }),
  };
  const app = render(<App {...props} />);
  if (!fit) {
    // Ink lays out to the stdout width, so the fake terminal is as wide as `size` says.
    Object.defineProperty(app.stdout, "columns", { value: size.cols });
    app.stdout.emit("resize");
  }
  const view = () => withoutRail(app.lastFrame() ?? "");

  const until = async (pattern: RegExp, what = String(pattern)) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (
        pattern.test(view()) ||
        pattern.test(stripAnsi(view())) ||
        pattern.test(squash(view()))
      ) {
        return view();
      }
      await wait(20);
    }
    assert.fail(`never saw ${what}; last frame:\n${app.lastFrame()}`);
  };
  const untilRail = async (pattern: RegExp) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (pattern.test(railOf(stripAnsi(app.lastFrame() ?? "")))) {
        return;
      }
      await wait(20);
    }
    assert.fail(`never saw ${pattern} in the rail:\n${app.lastFrame()}`);
  };
  // Tabs mount once data arrives and Ink subscribes to stdin in an effect after the frame; keys sent sooner are lost.
  const ready = async () => {
    await until(/Shelf\s+Skills/);
    await wait(60);
  };
  const press = async (...keys: string[]) => {
    for (const key of keys) {
      app.stdin.write(key);
      await wait(30);
    }
  };
  // Presses up or down until the highlighted row (the line starting with ">") matches.
  const moveTo = async (pattern: RegExp, key = KEYS.down) => {
    const selected = () =>
      stripAnsi(view())
        .split("\n")
        .find((line) => /^>/.test(line)) ?? "";
    for (let tries = 0; tries < 30 && !pattern.test(selected()); tries += 1) {
      await press(key);
    }
    assert.match(
      selected(),
      pattern,
      `could not select ${pattern}; last frame:\n${app.lastFrame()}`
    );
  };
  // Resizes the fake terminal (columns and rows, as Ink and the app see them) and waits for the redraw.
  const resize = async (cols: number, rows: number) => {
    Object.defineProperty(app.stdout, "columns", {
      value: cols,
      configurable: true,
    });
    Object.defineProperty(app.stdout, "rows", {
      value: rows,
      configurable: true,
    });
    app.stdout.emit("resize");
    await wait(120);
  };
  const stop = () => {
    app.unmount();
    fx.cleanup();
  };
  return {
    fx,
    plugin: pluginInfo,
    target,
    app,
    until,
    ready,
    press,
    moveTo,
    resize,
    stop,
    frame: view,
    raw: () => app.lastFrame() ?? "",
    untilRail,
    rail: () => railOf(app.lastFrame() ?? ""),
    exists: existsSync,
  };
};
