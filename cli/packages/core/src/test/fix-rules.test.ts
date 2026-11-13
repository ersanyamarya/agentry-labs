import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
import { createDoctor } from "../doctor.js";
import { createFix } from "../fix.js";
import { createFixes } from "../fix-rules.js";
import { createFixUndo } from "../fix-undo.js";
import type { Paths } from "../paths.js";
import { createPaths } from "../paths.js";
import type { Finding, RunCommand, TextFix, UnfixableFix } from "../types.js";

// Layout: <root>/home/.claude (config), <root>/home/ws/repo (git repo), <root>/bin (PATH with a fake `trail`). Never the real home.
let root: string;
let home: string;
let configDir: string;
let repo: string;
let bin: string;
let paths: Paths;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-fixrules-")));
  assert.ok(
    !root.startsWith(realpathSync(homedir())),
    "TMPDIR must be outside the home directory"
  );
  home = join(root, "home");
  configDir = join(home, ".claude");
  repo = join(home, "ws", "repo");
  bin = join(root, "bin");
  mkdirSync(repo, { recursive: true });
  mkdirSync(bin);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  for (const name of ["trail", "tool"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\n");
    chmodSync(join(bin, name), 0o755);
  }
  paths = createPaths({
    env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir },
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const put = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
const settings = () => join(configDir, "settings.json");
const dotClaudeJson = () => join(configDir, ".claude.json");
const mcpJson = () => join(repo, ".mcp.json");

const setup = ({
  runCommand,
  renames = { graft: "trail" },
}: {
  runCommand?: RunCommand;
  renames?: Record<string, string>;
} = {}) => {
  const lines: string[] = [];
  const ran: { argv: string[]; cwd?: string }[] = [];
  const fix = createFix(paths, {
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
    fixes: createFixes({ renames, env: { PATH: bin } }),
    doctor: () =>
      createDoctor(paths, {
        out: () => {},
        err: () => {},
        platform: "linux",
        env: { PATH: bin },
        launchctlGetenv: () => "",
        renames,
      }),
    isTTY: () => false,
    runCommand:
      runCommand ??
      ((argv, options) => {
        ran.push({ argv, cwd: options.cwd });
        return { status: 0, stdout: "", stderr: "" };
      }),
    now: () => new Date("2026-11-03T10:20:30.456Z"),
  });
  return { fix, lines, ran, output: () => lines.join("\n") };
};
const undo = async () => {
  const lines: string[] = [];
  const code = await createFixUndo(paths, {
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
  }).run({ yes: true });
  return { code, output: lines.join("\n") };
};
const dirTree = (dir: string) =>
  existsSync(dir) ? readdirSync(dir, { recursive: true }).sort() : [];

describe("stale-name", () => {
  test("swaps a permission, a command found on PATH and a matcher; formatting and other bytes untouched", async () => {
    const original =
      '{\n\t"permissions": {\n\t\t"allow": [\n\t\t\t"Bash(graft ask:*)",\n\t\t\t"Read"\n\t\t]\n\t},\n\t"hooks": {\n\t\t"PreToolUse": [\n\t\t\t{\n\t\t\t\t"matcher": "Bash|mcp__graft__|mcp__trail__",\n\t\t\t\t"hooks": [{ "type": "command", "command": "graft hook pre" }]\n\t\t\t}\n\t\t]\n\t},\n\t"keep": "é  graft-less"\n}\n';
    put(settings(), original);
    const { fix, output } = setup();
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    const expected = original
      .replace("Bash(graft ask:*)", "Bash(trail ask:*)")
      .replace("Bash|mcp__graft__|mcp__trail__", "Bash|mcp__trail__")
      .replace('"graft hook pre"', '"trail hook pre"');
    assert.equal(readFileSync(settings(), "utf8"), expected);
    assert.match(output(), /verify \[stale-name\].*: gone/);
  });

  test("graft-hooks.cjs stays: the swapped path would not exist, so the finding gets no fix and the reason is shown", async () => {
    const helper = join(configDir, "helpers", "graft-hooks.cjs");
    put(helper, "// hook\n");
    const original = json({
      hooks: {
        Stop: [
          {
            hooks: [
              { type: "command", command: `node "${helper}" stop || exit 0` },
            ],
          },
        ],
      },
      statusLine: { type: "command", command: `node ${helper}` },
    });
    put(settings(), original);
    const { fix, output } = setup();
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.equal(readFileSync(settings(), "utf8"), original);
    assert.match(
      output(),
      /\[stale-name\] Stop hook still uses the old name "graft" \(now "trail"\)\n\s+no fix: .*trail-hooks\.cjs does not exist/
    );
    assert.match(output(), /statusLine command still uses.*\n\s+no fix: /);
    assert.deepEqual(
      dirTree(paths.backupsDir),
      [],
      "nothing to back up when nothing changes"
    );
  });

  test("the same command is swapped once the new file exists", async () => {
    const helper = join(configDir, "helpers", "graft-hooks.cjs");
    put(helper, "// old\n");
    put(join(configDir, "helpers", "trail-hooks.cjs"), "// new\n");
    const original = json({
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: `node "${helper}" stop` }] },
        ],
      },
    });
    put(settings(), original);
    const { fix, output } = setup();
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.equal(
      readFileSync(settings(), "utf8"),
      original.replace("graft-hooks.cjs", "trail-hooks.cjs")
    );
  });

  test("a bare argument or a command missing from PATH is not swapped", async () => {
    const original = json({
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: "npx graft-mcp --stop" }] },
        ],
      },
      statusLine: { type: "command", command: "echo graft" },
    });
    put(settings(), original);
    const { fix, output } = setup();
    await fix.run({ path: repo, yes: true });
    assert.equal(readFileSync(settings(), "utf8"), original);
    assert.match(output(), /no fix: .*cannot be checked/);
    assert.match(output(), /no fix: .*cannot be checked|not on PATH/);
  });

  test("an MCP server named by an old key is left alone", async () => {
    const original = json({
      mcpServers: { graft: { command: process.execPath, args: ["-e", "0"] } },
    });
    put(mcpJson(), original);
    put(settings(), json({ enabledMcpjsonServers: ["graft"] }));
    const { fix, output } = setup();
    await fix.run({ path: repo, yes: true });
    assert.equal(readFileSync(mcpJson(), "utf8"), original);
    assert.match(output(), /no fix: .*name is a key/);
  });
});

describe("MCP entries", () => {
  const server = { command: process.execPath, args: ["-e", "0"] };

  test("dup-mcp-scope: identical entries → the repo's entry goes, the shared user entry stays, siblings are byte-identical", async () => {
    const original = `{\n\t"mcpServers": {\n\t\t"keep": { "command": "tool" },\n\t\t"shared": ${JSON.stringify(server)},\n\t\t"also": { "command": "tool" }\n\t}\n}\n`;
    put(mcpJson(), original);
    put(dotClaudeJson(), json({ mcpServers: { shared: server } }));
    put(
      settings(),
      json({ enabledMcpjsonServers: ["shared", "keep", "also"] })
    );
    const { fix, output } = setup();
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.equal(
      readFileSync(mcpJson(), "utf8"),
      original.replace(`\t\t"shared": ${JSON.stringify(server)},\n`, "")
    );
    assert.deepEqual(JSON.parse(readFileSync(dotClaudeJson(), "utf8")), {
      mcpServers: { shared: server },
    });
  });

  test("dup-mcp-scope: differing entries are not touched", async () => {
    const original = json({
      mcpServers: { shared: { ...server, args: ["-e", "1"] } },
    });
    put(mcpJson(), original);
    put(dotClaudeJson(), json({ mcpServers: { shared: server } }));
    put(settings(), json({ enabledMcpjsonServers: ["shared"] }));
    const { fix, output } = setup();
    await fix.run({ path: repo, yes: true });
    assert.equal(readFileSync(mcpJson(), "utf8"), original);
    assert.match(output(), /no fix: the project and user entries differ/);
  });

  test("missing-mcp-command: removes only that server", async () => {
    const original = `{\n  "mcpServers": {\n    "ok": { "command": "tool" },\n    "gone": { "command": "/no/such/command", "env": { "TOKEN": "s3cret-value" } }\n  }\n}\n`;
    put(mcpJson(), original);
    put(settings(), json({ enableAllProjectMcpServers: true }));
    const { fix, output } = setup();
    assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
    assert.doesNotMatch(
      output(),
      /s3cret-value/,
      "secrets never reach the preview"
    );
    assert.equal(readFileSync(mcpJson(), "utf8"), original);
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.equal(
      readFileSync(mcpJson(), "utf8"),
      '{\n  "mcpServers": {\n    "ok": { "command": "tool" }\n  }\n}\n'
    );
  });

  test("an unparsable file is refused, not rewritten", () => {
    const fixes = createFixes({
      renames: { graft: "trail" },
      env: { PATH: bin },
    });
    put(settings(), '{ "permissions": { "allow": ["Bash(graft x)",] } }');
    const finding: Finding = {
      id: "stale-name",
      severity: "warning",
      file: settings(),
      message:
        'Permission allow entry "Bash(graft x)" still uses the old name "graft" (now "trail")',
    };
    assert.match(
      (
        fixes["stale-name"]!(finding, {
          paths,
          cwd: repo,
          project: { cwd: repo, root: repo },
          findings: [],
        }) as UnfixableFix
      ).unfixable,
      /not valid JSON/
    );
    put(mcpJson(), '{"mcpServers": {"a": {"command": "/no/cmd"},}}');
    const second = fixes["missing-mcp-command"]!(
      {
        id: "missing-mcp-command",
        severity: "warning",
        file: mcpJson(),
        message:
          'MCP server "a" runs "/no/cmd", which is not on PATH or does not exist',
      },
      { paths, cwd: repo, project: { cwd: repo, root: repo }, findings: [] }
    );
    assert.match((second as UnfixableFix).unfixable, /not valid JSON/);
    // A file that went bad after planning: apply throws a typed error that carries no file content.
    const removal = fixes["dup-mcp-plugin"]!(
      {
        id: "dup-mcp-plugin",
        severity: "warning",
        file: mcpJson(),
        message:
          'MCP server "a" (project) duplicates the server of enabled plugin p@m',
      },
      { paths, cwd: repo, project: { cwd: repo, root: repo }, findings: [] }
    );
    assert.throws(
      () => (removal as TextFix).apply('{"mcpServers": {"a": {},}}'),
      (error: NodeJS.ErrnoException) =>
        error.code === "EJSONPARSE" && !error.message.includes("mcpServers")
    );
  });
});

describe("links, skills and plugins", () => {
  test("broken-skill-link: prune, then undo recreates the link", async () => {
    const link = join(configDir, "skills", "ghost");
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(join(root, "nowhere"), link);
    const { fix, output } = setup({
      runCommand: (argv: string[], { cwd }) => {
        execFileSync(argv[0], argv.slice(1), { cwd });
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
    assert.match(output(), /Remove the broken skill link "ghost"/);
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.equal(
      existsSync(link) ||
        (() => {
          try {
            lstatSync(link);
            return true;
          } catch {
            return false;
          }
        })(),
      false
    );
    assert.equal((await undo()).code, 0);
    assert.equal(readlinkSync(link), join(root, "nowhere"));
  });

  test("shelf-duplicate: removes the global copy, undo restores the folder byte for byte", async () => {
    const body = "---\nname: dupe\ndescription: x\n---\nbody\n";
    put(join(configDir, "skills", "dupe", "SKILL.md"), body);
    put(join(configDir, "skills", "dupe", "notes", "a.txt"), "a\n");
    put(join(configDir, "skill-shelf", "misc", "dupe", "SKILL.md"), body);
    put(
      join(configDir, "skill-shelf", "misc", "dupe", "notes", "a.txt"),
      "a\n"
    );
    const { fix, output } = setup({
      runCommand: (argv: string[], { cwd }) => {
        execFileSync(argv[0], argv.slice(1), { cwd });
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.equal(existsSync(join(configDir, "skills", "dupe")), false);
    assert.equal(
      existsSync(join(configDir, "skill-shelf", "misc", "dupe", "SKILL.md")),
      true
    );
    assert.equal((await undo()).code, 0);
    assert.equal(
      readFileSync(join(configDir, "skills", "dupe", "SKILL.md"), "utf8"),
      body
    );
    assert.equal(
      readFileSync(join(configDir, "skills", "dupe", "notes", "a.txt"), "utf8"),
      "a\n"
    );
  });

  test("dup-plugin-scope: one uninstall command per extra install, run from the project folder", async () => {
    const dir = join(configDir, "plugins", "cache", "mk", "tools", "1.0.0");
    mkdirSync(dir, { recursive: true });
    const file = join(configDir, "plugins", "installed_plugins.json");
    const both = json({
      version: 2,
      plugins: {
        "tools@mk": [
          { scope: "user", installPath: dir },
          { scope: "local", projectPath: repo, installPath: dir },
        ],
      },
    });
    put(file, both);
    const { fix, output, ran } = setup({
      runCommand: (argv: string[], { cwd }) => {
        ran.push({ argv, cwd });
        writeFileSync(
          file,
          json({
            version: 2,
            plugins: { "tools@mk": [{ scope: "user", installPath: dir }] },
          })
        );
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
    assert.match(
      output(),
      /run: claude plugin uninstall tools@mk --scope local/
    );
    assert.deepEqual(ran, []);
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.deepEqual(ran, [
      {
        argv: ["claude", "plugin", "uninstall", "tools@mk", "--scope", "local"],
        cwd: repo,
      },
    ]);
    assert.match(output(), /verify \[dup-plugin-scope\].*gone/);
    assert.equal((await undo()).code, 0);
    assert.equal(
      readFileSync(file, "utf8"),
      both,
      "the plugin list is restored byte for byte"
    );
  });
});

describe("dup-hook-scope", () => {
  const projectSettings = () => join(repo, ".claude", "settings.json");
  const localSettings = () => join(repo, ".claude", "settings.local.json");
  const userGraft = (arg: string) =>
    `node "${configDir}/helpers/graft-hooks.cjs" ${arg} || exit 0`;
  const user = () =>
    json({
      hooks: {
        PostToolUse: [
          {
            matcher: "Edit|Write|MultiEdit",
            hooks: [{ type: "command", command: userGraft("post-edit") }],
          },
        ],
        PreToolUse: [
          {
            matcher: "Skill|Bash",
            hooks: [{ type: "command", command: userGraft("pre-tool") }],
          },
        ],
        SessionStart: [
          { hooks: [{ type: "command", command: userGraft("session-start") }] },
        ],
      },
    });
  // The project copy: one duplicate alone in its group (group goes), one sharing a group (only the entry goes), one alone
  // in its event (event goes). statusLine runs the same script and stays.
  const project = [
    "{",
    '\t"statusLine": { "type": "command", "command": "node \\"${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs\\" statusline" },',
    '\t"hooks": {',
    '\t\t"PostToolUse": [',
    '\t\t\t{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node \\"${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs\\" post-edit" }] },',
    '\t\t\t{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "~/bin/lint.sh" }] }',
    "\t\t],",
    '\t\t"PreToolUse": [',
    '\t\t\t{ "matcher": "Bash", "hooks": [',
    '\t\t\t\t{ "type": "command", "command": "node \\"${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs\\" pre-tool" },',
    '\t\t\t\t{ "type": "command", "command": "~/bin/guard.sh" }',
    "\t\t\t] }",
    "\t\t],",
    '\t\t"SessionStart": [{ "hooks": [{ "type": "command", "command": "node \\"${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs\\" session-start" }] }],',
    '\t\t"Stop": [{ "hooks": [{ "type": "command", "command": "node \\"${CLAUDE_PROJECT_DIR:-.}/.trail/hook.cjs\\" session-start || exit 0" }] }]',
    "\t},",
    '\t"permissions": { "allow": ["Read"] },',
    '\t"keep": "é  untouched"',
    "}",
    "",
  ].join("\n");

  test("removes the project copies (entry, group, event as they empty); statusLine, other events and keys stay byte-identical; undo restores", async () => {
    put(settings(), user());
    put(projectSettings(), project);
    const { fix, output } = setup({ renames: {} });
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    // Exactly three lines go: the post-edit group, the pre-tool entry and the SessionStart event. Every other byte stays.
    const expected = project
      .split("\n")
      .filter((_, index) => ![4, 9, 13].includes(index))
      .join("\n");
    assert.ok(expected.includes("statusline") && expected.includes('"Stop"'));
    assert.equal(readFileSync(projectSettings(), "utf8"), expected, output());
    assert.equal(
      readFileSync(settings(), "utf8"),
      user(),
      "user file untouched"
    );
    assert.match(output(), /verify \[dup-hook-scope\].*gone/);
    assert.equal((await undo()).code, 0);
    assert.equal(readFileSync(projectSettings(), "utf8"), project);
  });

  test("a local copy goes too; an identical handler (same matcher and entry) is left alone", async () => {
    const same = {
      matcher: "Edit|Write|MultiEdit",
      hooks: [{ type: "command", command: userGraft("post-edit") }],
    };
    put(settings(), user());
    const local = json({
      hooks: {
        PostToolUse: [same],
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command:
                  'node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs" session-start',
              },
            ],
          },
        ],
      },
      env: { KEEP: "1" },
    });
    put(localSettings(), local);
    const { fix, output } = setup({ renames: {} });
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.deepEqual(JSON.parse(readFileSync(localSettings(), "utf8")), {
      hooks: { PostToolUse: [same] },
      env: { KEEP: "1" },
    });
  });

  test("the fix parses the doctor's message and leaves a hook edited since alone", () => {
    const make = createFixes()["dup-hook-scope"];
    const file = projectSettings();
    const fix = make(
      {
        id: "dup-hook-scope",
        severity: "warning",
        message:
          "PostToolUse hook (0123abcd) in project settings runs graft-hooks.cjs post-edit, which a user-level hook also runs; both run",
        file,
      },
      {} as Parameters<typeof make>[1]
    ) as TextFix;
    assert.equal(fix.file, file);
    const text = json({
      hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "x" }] }] },
    });
    assert.equal(fix.apply(text), text);
    assert.equal(
      make(
        {
          id: "dup-hook-scope",
          severity: "warning",
          message:
            "PostToolUse hook (0123abcd) in user settings runs x, which a user-level hook also runs; both run",
          file,
        },
        {} as Parameters<typeof make>[1]
      ),
      undefined
    );
  });
});

describe("backup and undo through a real fix", () => {
  test("--yes writes a backup set; undo returns every file to its original bytes", async () => {
    const original =
      '{\n\t"permissions": {\n\t\t"allow": ["Bash(graft ask:*)"]\n\t}\n}\n';
    put(settings(), original);
    const { fix, output } = setup();
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    assert.notEqual(readFileSync(settings(), "utf8"), original);
    const [set] = readdirSync(paths.backupsDir);
    const manifest = JSON.parse(
      readFileSync(join(paths.backupsDir, set, "manifest.json"), "utf8")
    );
    assert.equal(manifest.status, "done");
    assert.deepEqual(manifest.files[0].ruleIds, ["stale-name"]);
    assert.equal((await undo()).code, 0);
    assert.equal(readFileSync(settings(), "utf8"), original);
  });

  test("--dry-run prints the diff and writes nothing", async () => {
    const original =
      '{\n\t"permissions": {\n\t\t"allow": ["Bash(graft ask:*)"]\n\t}\n}\n';
    put(settings(), original);
    const { fix, output } = setup();
    assert.equal(await fix.run({ path: repo, dryRun: true }), 0);
    assert.match(
      output(),
      /-\t\t"allow": \["Bash\(graft ask:\*\)"\]\n\+\t\t"allow": \["Bash\(trail ask:\*\)"\]/
    );
    assert.match(output(), /Dry run: nothing written/);
    assert.equal(readFileSync(settings(), "utf8"), original);
    assert.deepEqual(dirTree(paths.backupsDir), []);
  });

  test("a file git tracks is marked in the preview", async () => {
    put(
      mcpJson(),
      json({ mcpServers: { gone: { command: "/no/such/command" } } })
    );
    put(settings(), json({ enableAllProjectMcpServers: true }));
    execFileSync("git", ["add", ".mcp.json"], { cwd: repo });
    const { fix, output } = setup();
    await fix.run({ path: repo, dryRun: true });
    assert.match(output(), /\.mcp\.json is tracked in git/);
  });
});

describe("stale-mcp-permission", () => {
  const localSettings = () => join(repo, ".claude", "settings.local.json");
  const local = [
    "{",
    '\t"permissions": {',
    '\t\t"allow": [',
    '\t\t\t"Bash(trail:*)",',
    '\t\t\t"mcp__trail__trail_find_code",',
    '\t\t\t"mcp__graft",',
    '\t\t\t"WebFetch"',
    "\t\t],",
    '\t\t"deny": ["mcp__trail__trail_repo_map"]',
    "\t},",
    '\t"keep": "é  untouched"',
    "}",
    "",
  ].join("\n");

  test("removes only the retired entries; the rest of the array and file stay byte-identical; undo restores", async () => {
    put(localSettings(), local);
    const { fix, output } = setup({ renames: {} });
    assert.equal(await fix.run({ path: repo, yes: true }), 0, output());
    const expected = [
      "{",
      '\t"permissions": {',
      '\t\t"allow": [',
      '\t\t\t"Bash(trail:*)",',
      '\t\t\t"WebFetch"',
      "\t\t],",
      '\t\t"deny": []',
      "\t},",
      '\t"keep": "é  untouched"',
      "}",
      "",
    ].join("\n");
    assert.equal(readFileSync(localSettings(), "utf8"), expected, output());
    assert.match(output(), /verify \[stale-mcp-permission\].*gone/);
    assert.equal((await undo()).code, 0);
    assert.equal(readFileSync(localSettings(), "utf8"), local);
  });
});
