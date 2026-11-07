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
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createDoctor } from "../lib/doctor.js";
import type { Rule } from "../lib/doctor-rules.js";
import { createFix } from "../lib/fix.js";
import { createFixUndo } from "../lib/fix-undo.js";
import type { Paths } from "../lib/paths.js";
import { createPaths } from "../lib/paths.js";
import type { Finding, FixRegistry, RunCommand } from "../lib/types.js";
import { createFixture } from "./helpers/fixture.js";

// Same fake rule as src/test/fix.test.ts: target.json is reported while it contains BAD. Never the real home.
let root: string;
let home: string;
let configDir: string;
let repo: string;
let target: string;
let paths: Paths;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-undo-")));
  assert.ok(
    !root.startsWith(realpathSync(homedir())),
    "TMPDIR must be outside the home directory"
  );
  home = join(root, "home");
  configDir = join(home, ".claude");
  repo = join(home, "ws", "repo");
  target = join(repo, "target.json");
  mkdirSync(repo, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(target, original());
  paths = createPaths({
    env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: configDir },
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const original = () =>
  '{\n\t"name": "demo",\n\t"value": "BAD",\n\t"keep": true\n}\n';
const fixed = () => original().replace("BAD", "GOOD");
const fakeRule: Rule = {
  id: "fake-bad",
  run: () =>
    existsSync(target) && readFileSync(target, "utf8").includes("BAD")
      ? [
          {
            id: "fake-bad",
            severity: "warning",
            message: "target.json says BAD",
            file: target,
          },
        ]
      : [],
};
const now = () => new Date("2026-11-03T10:20:30.456Z");
const SET = "2026-11-03T10-20-30-456Z";

const replaceFix = (finding: Finding) => ({
  ruleId: finding.id,
  file: finding.file,
  describe: () => "Replace BAD with GOOD",
  apply: (text: string | undefined) => (text ?? "").replace("BAD", "GOOD"),
});

// Runs `agentry fix`'s engine with the given fixes (default: replace BAD) and returns the fix's exit code.
const applyFix = async ({
  fixes = { "fake-bad": replaceFix },
  runCommand,
}: {
  fixes?: FixRegistry;
  runCommand?: RunCommand;
} = {}) => {
  const lines: string[] = [];
  const fix = createFix(paths, {
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
    fixes,
    doctor: () =>
      createDoctor(paths, {
        out: () => {},
        platform: "linux",
        env: { PATH: "" },
        rules: [fakeRule],
        renames: {},
        launchctlGetenv: () => "",
      }),
    isTTY: () => false,
    runCommand: runCommand ?? (() => ({ status: 0, stdout: "", stderr: "" })),
    now,
  });
  return fix.run({ path: repo, yes: true });
};

const undoFixture = ({
  tty = false,
  answers = [],
}: {
  tty?: boolean;
  answers?: boolean[];
} = {}) => {
  const lines: string[] = [];
  const asked: string[] = [];
  const undo = createFixUndo(paths, {
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
    isTTY: () => tty,
    confirm: async (question) => {
      asked.push(question);
      return answers[asked.length - 1] ?? false;
    },
    now,
  });
  return { undo, asked, output: () => lines.join("\n") };
};

const manifest = (set = SET) =>
  JSON.parse(
    readFileSync(join(paths.backupsDir, set, "manifest.json"), "utf8")
  );

describe("round trip", () => {
  test("fix then undo restores identical bytes and mode", async () => {
    chmodSync(target, 0o640);
    assert.equal(await applyFix(), 0);
    assert.equal(readFileSync(target, "utf8"), fixed());
    const { undo, output } = undoFixture();
    assert.equal(await undo.run({ yes: true }), 0);
    assert.equal(readFileSync(target, "utf8"), original());
    // biome-ignore lint/suspicious/noBitwiseOperators: masks the permission bits of a file mode
    assert.equal(statSync(target).mode & 0o7777, 0o640);
    assert.match(output(), /restored ~\/ws\/repo\/target\.json/);
    assert.equal(manifest().undoneAt, "2026-11-03T10:20:30.456Z");
  });

  test("with no timestamp the newest set is undone", async () => {
    assert.equal(await applyFix(), 0);
    const { undo } = undoFixture();
    assert.equal(await undo.run({ yes: true }), 0);
    assert.equal(readFileSync(target, "utf8"), original());
  });

  test("a timestamp in the createdAt form picks its set", async () => {
    assert.equal(await applyFix(), 0);
    const { undo } = undoFixture();
    assert.equal(
      await undo.run({ timestamp: "2026-11-03T10:20:30.456Z", yes: true }),
      0
    );
    assert.equal(readFileSync(target, "utf8"), original());
  });

  test("a git-tracked file is noted after restore", async () => {
    execFileSync("git", ["add", "target.json"], { cwd: repo });
    await applyFix();
    const { undo, output } = undoFixture();
    assert.equal(await undo.run({ yes: true }), 0);
    assert.match(output(), /Git tracks 1 restored file/);
    assert.match(output(), /target\.json/);
  });
});

describe("missing and symlink kinds", () => {
  test("a file the fix created is deleted on undo", async () => {
    const created = join(repo, "created.json");
    const fixes: FixRegistry = {
      "fake-bad": (finding: Finding) => [
        replaceFix(finding),
        {
          ruleId: finding.id,
          file: created,
          describe: () => "Create created.json",
          apply: () => '{"made": true}\n',
        },
      ],
    };
    assert.equal(await applyFix({ fixes }), 0);
    assert.equal(readFileSync(created, "utf8"), '{"made": true}\n');
    assert.equal(
      manifest().files.find(
        (entry: Record<string, any>) => entry.kind === "missing"
      ).result,
      "written"
    );
    const { undo } = undoFixture();
    assert.equal(await undo.run({ yes: true }), 0);
    assert.equal(existsSync(created), false);
    assert.equal(readFileSync(target, "utf8"), original());
  });

  test("a broken symlink removed by a command is recreated with its target", async () => {
    const link = join(repo, "dangling");
    symlinkSync("/nonexistent/agentry-undo-target", link);
    const fixes: FixRegistry = {
      "fake-bad": (finding: Finding) => [
        replaceFix(finding),
        {
          ruleId: finding.id,
          file: link,
          describe: () => "Prune dangling link",
          apply: () => ({ command: ["rm", link], cwd: repo }),
        },
      ],
    };
    const runCommand = (argv: string[]) => {
      rmSync(argv[1]);
      return { status: 0, stdout: "", stderr: "" };
    };
    assert.equal(await applyFix({ fixes, runCommand }), 0);
    assert.equal(existsSync(link), false);
    const { undo, output } = undoFixture();
    assert.equal(await undo.run({ yes: true }), 0);
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.equal(readlinkSync(link), "/nonexistent/agentry-undo-target");
    assert.match(
      output(),
      /linked ~\/ws\/repo\/dangling -> \/nonexistent\/agentry-undo-target/
    );
  });
});

describe("conflicts", () => {
  test("a file edited since the fix is skipped and exits 1; the edit is kept", async () => {
    await applyFix();
    writeFileSync(target, `${fixed()}// my edit\n`);
    const { undo, output } = undoFixture();
    assert.equal(await undo.run({ yes: true }), 1);
    assert.equal(readFileSync(target, "utf8"), `${fixed()}// my edit\n`);
    assert.match(
      output(),
      /conflict {2}~\/ws\/repo\/target\.json \(changed since the fix wrote it\); skipped: pass --force to overwrite/
    );
    assert.equal(manifest().undoneAt, undefined);
  });

  test("--force overwrites the conflicting file and marks the set undone", async () => {
    await applyFix();
    writeFileSync(target, `${fixed()}// my edit\n`);
    const { undo, output } = undoFixture();
    assert.equal(await undo.run({ yes: true, force: true }), 0);
    assert.equal(readFileSync(target, "utf8"), original());
    assert.match(output(), /overwritten: --force/);
    assert.ok(manifest().undoneAt);
  });
});

describe("--list and previews", () => {
  test("--list prints the sets and changes nothing", async () => {
    await applyFix();
    const before = readFileSync(target, "utf8");
    const beforeFiles = readdirSync(join(paths.backupsDir, SET)).sort();
    const { undo, output } = undoFixture({ tty: true, answers: [true] });
    assert.equal(await undo.run({ list: true }), 0);
    assert.match(output(), new RegExp(`${SET}  done +1 file`));
    assert.equal(readFileSync(target, "utf8"), before);
    assert.deepEqual(
      readdirSync(join(paths.backupsDir, SET)).sort(),
      beforeFiles
    );
    assert.equal(manifest().undoneAt, undefined);
  });

  test("--list with no sets says so", async () => {
    const { undo, output } = undoFixture();
    assert.equal(await undo.run({ list: true }), 0);
    assert.match(output(), /No backup sets .* yet\./);
  });

  test("without a terminal or --yes it only previews and writes nothing", async () => {
    await applyFix();
    const { undo, output, asked } = undoFixture({ tty: false });
    assert.equal(await undo.run({}), 0);
    assert.match(output(), /restore {3}~\/ws\/repo\/target\.json/);
    assert.match(
      output(),
      /Not a terminal, so preview only: nothing restored\. Pass --yes to apply\./
    );
    assert.equal(readFileSync(target, "utf8"), fixed());
    assert.deepEqual(asked, []);
    assert.equal(manifest().undoneAt, undefined);
  });

  test("--dry-run previews even in a terminal, without asking", async () => {
    await applyFix();
    const { undo, output, asked } = undoFixture({ tty: true, answers: [true] });
    assert.equal(await undo.run({ dryRun: true }), 0);
    assert.match(output(), /Dry run: nothing restored\./);
    assert.deepEqual(asked, []);
    assert.equal(readFileSync(target, "utf8"), fixed());
  });

  test("in a terminal it asks first; no means nothing is restored", async () => {
    await applyFix();
    const { undo, output, asked } = undoFixture({
      tty: true,
      answers: [false],
    });
    assert.equal(await undo.run({}), 0);
    assert.equal(asked.length, 1);
    assert.match(output(), /Nothing restored\./);
    assert.equal(readFileSync(target, "utf8"), fixed());
  });

  test("command fixes are listed as not undoable, with the masked command", async () => {
    const fixes: FixRegistry = {
      "fake-bad": (finding: Finding) => [
        replaceFix(finding),
        {
          ruleId: finding.id,
          file: finding.file,
          describe: () => "Run the cleaner",
          apply: () => ({
            command: ["cleaner", "--api-key", "sk-abcdef1234567890xyz"],
            cwd: repo,
          }),
        },
      ],
    };
    await applyFix({ fixes });
    const { undo, output } = undoFixture();
    assert.equal(await undo.run({ yes: true }), 0);
    assert.match(
      output(),
      /Command fixes cannot be undone automatically; undo these by hand if needed:\n {2}\[fake-bad\] cleaner --api-key <masked> {2}\(in ~\/ws\/repo\)/
    );
    assert.doesNotMatch(output(), /sk-abcdef/);
  });
});

describe("refusals", () => {
  test("a set cannot be undone twice", async () => {
    await applyFix();
    const first = undoFixture();
    assert.equal(await first.undo.run({ yes: true }), 0);
    const second = undoFixture();
    assert.equal(await second.undo.run({ yes: true }), 1);
    assert.match(
      second.output(),
      /already undone at 2026-11-03T10:20:30\.456Z/
    );
  });

  test("an unknown timestamp exits 2 and changes nothing", async () => {
    await applyFix();
    const { undo, output } = undoFixture();
    assert.equal(
      await undo.run({ timestamp: "2020-01-01T00-00-00-000Z", yes: true }),
      2
    );
    assert.match(output(), /No backup set "2020-01-01T00-00-00-000Z"/);
    assert.equal(readFileSync(target, "utf8"), fixed());
  });

  test("no backup sets at all exits 2", async () => {
    const { undo } = undoFixture();
    assert.equal(await undo.run({ yes: true }), 2);
  });
});

describe("CLI", () => {
  test("fix --undo --list on a fixture with no sets says so and writes nothing", () => {
    const fixture = createFixture();
    try {
      const { status, stdout } = fixture.run(["fix", "--undo", "--list"]);
      assert.equal(status, 0);
      assert.match(stdout, /No backup sets/);
      assert.ok(!existsSync(join(fixture.configDir, "backups")));
    } finally {
      fixture.cleanup();
    }
  });

  test("an unknown timestamp exits 2 through the CLI", () => {
    const fixture = createFixture();
    try {
      assert.equal(
        fixture.run(["fix", "--undo", "2020-01-01T00-00-00-000Z"]).status,
        2
      );
      assert.equal(
        fixture.run(["fix", "--undo", "--list", "2020-01-01"]).status,
        2
      );
      assert.equal(fixture.run(["fix", "--list"]).status, 2);
    } finally {
      fixture.cleanup();
    }
  });
});
