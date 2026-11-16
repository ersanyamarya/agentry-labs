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
import type { DoctorContext } from "../doctor-rules.js";
import { hookRunKey, rules } from "../doctor-rules.js";
import { createCopilotReader } from "../inventory/copilot.js";
import { hookId } from "../inventory/hooks.js";
import { createPaths } from "../paths.js";
import type {
  CopilotInventory,
  HookEntry,
  HookGroup,
  HookItem,
  Scope,
  SettingsLayer,
} from "../types.js";

// In-process: the rules get a hand-built context; nothing is read from disk. The paths point at a home that does not exist.
const home = "/nonexistent-agentry-home";
const root = `${home}/ws/repo`;
const userFile = `${home}/.claude/settings.json`;
const projectFile = `${root}/.claude/settings.json`;
const localFile = `${root}/.claude/settings.local.json`;
const sources: Record<Scope, string> = {
  user: userFile,
  project: projectFile,
  local: localFile,
};

const PROJECT_GRAFT =
  'node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs" post-edit';
const USER_GRAFT = `node "${home}/.claude/helpers/graft-hooks.cjs" post-edit || exit 0`;

// A hook row as the hooks reader builds it: the id is hookId() of event, matcher and the raw entry.
const hook = ({
  scope,
  event = "PostToolUse",
  matcher,
  command,
  plugin,
  state = "active",
}: {
  scope: Scope | "plugin";
  event?: string;
  matcher?: string;
  command: string;
  plugin?: string;
  state?: HookItem["state"];
}): HookItem => {
  const raw: HookEntry = { type: "command", command };
  return {
    id: hookId(event, matcher, raw),
    event,
    matcher: matcher ?? "*",
    type: "command",
    command,
    scope,
    source:
      scope === "plugin"
        ? `${home}/.claude/plugins/x/hooks.json`
        : sources[scope],
    ...(plugin ? { plugin } : {}),
    state,
  };
};

// Settings layers hold the raw entries (plugin hooks are not in them); the inventory rows carry the state.
const layersOf = (items: HookItem[]): SettingsLayer[] =>
  (["user", "project", "local"] as Scope[]).flatMap((scope) => {
    const mine = items.filter((item) => item.scope === scope);
    if (mine.length === 0) {
      return [];
    }
    const hooks: Record<string, HookGroup[]> = {};
    for (const item of mine) {
      hooks[item.event] = [
        ...(hooks[item.event] ?? []),
        {
          ...(item.matcher === "*" ? {} : { matcher: item.matcher }),
          hooks: [{ type: "command", command: item.command }],
        },
      ];
    }
    return [{ scope, source: sources[scope], json: { hooks } }];
  });

// No Copilot home: every Copilot rule must stay quiet.
const noCopilot: CopilotInventory = {
  agents: [],
  errors: [],
  hooks: [],
  includeCoAuthoredBy: true,
  instructions: [],
  mcp: [],
  present: false,
  signedIn: false,
  skills: [],
  trusted: false,
};

// What the rule asked `line` to find, newest last.
const needles: string[] = [];

const context = (items: HookItem[]): DoctorContext => ({
  copilot: noCopilot,
  cwd: root,
  hooks: { items },
  launchctlGetenv: () => "",
  layers: layersOf(items),
  line: (_file, needle) => {
    needles.push(needle);
    return 7;
  },
  mcp: { servers: [] },
  paths: createPaths({
    memoize: true,
    env: { AGENTRY_HOME: home, CLAUDE_CONFIG_DIR: `${home}/.claude` },
  }),
  platform: "linux",
  plugins: { items: [] },
  project: { cwd: root, root },
  renames: {},
  skills: { items: [] },
  which: () => true,
});

const dupHookScope = (items: HookItem[]) => {
  const rule = rules.find((one) => one.id === "dup-hook-scope");
  assert.ok(rule, "dup-hook-scope is registered");
  return rule.run(context(items));
};

describe("hookRunKey", () => {
  test("script file name plus the words up to the first shell operator, quotes stripped", () => {
    const where = { home, projectRoot: root };
    assert.deepEqual(hookRunKey(PROJECT_GRAFT, where), {
      script: "graft-hooks.cjs",
      args: ["post-edit"],
    });
    assert.deepEqual(hookRunKey(USER_GRAFT, where), {
      script: "graft-hooks.cjs",
      args: ["post-edit"],
    });
    assert.deepEqual(hookRunKey(`~/bin/run.sh "a b" c && echo x; y`, where), {
      script: "run.sh",
      args: ["a", "b", "c"],
    });
    assert.deepEqual(hookRunKey("~/bin/run.sh one;two", where), {
      script: "run.sh",
      args: ["one"],
    });
    assert.deepEqual(hookRunKey("~/bin/run.sh | tee log", where), {
      script: "run.sh",
      args: [],
    });
    assert.equal(hookRunKey("trail hook post-edit", where), undefined);
  });
});

describe("dup-hook-scope", () => {
  test("the real shape: project and local graft-hooks.cjs post-edit against the user copy with another matcher give one finding per handler", () => {
    const project = hook({
      scope: "project",
      matcher: "Edit|Write",
      command: PROJECT_GRAFT,
    });
    const local = hook({
      scope: "local",
      matcher: "Edit|Write",
      command: PROJECT_GRAFT,
    });
    const user = hook({
      scope: "user",
      matcher: "Edit|Write|MultiEdit",
      command: USER_GRAFT,
    });
    const findings = dupHookScope([user, project, local]);
    assert.equal(findings.length, 2);
    assert.deepEqual(
      findings.map(({ id, severity, file, line }) => ({
        id,
        severity,
        file,
        line,
      })),
      [
        {
          id: "dup-hook-scope",
          severity: "warning",
          file: projectFile,
          line: 7,
        },
        { id: "dup-hook-scope", severity: "warning", file: localFile, line: 7 },
      ]
    );
    assert.equal(
      findings[0].message,
      `PostToolUse hook (${project.id}) in project settings runs graft-hooks.cjs post-edit, which a user-level hook also runs; both run`
    );
    assert.equal(
      findings[1].message,
      `PostToolUse hook (${local.id}) in local settings runs graft-hooks.cjs post-edit, which a user-level hook also runs; both run`
    );
    // The line is looked up by the whole command as JSON writes it, not the script path statusLine may share.
    assert.equal(needles.at(-1), JSON.stringify(PROJECT_GRAFT).slice(1, -1));
  });

  test("byte-identical handlers (same event, matcher and entry) give none: Claude Code runs them once", () => {
    const command = `node "${home}/.claude/helpers/graft-hooks.cjs" post-edit`;
    assert.deepEqual(
      dupHookScope([
        hook({ scope: "user", matcher: "Edit", command }),
        hook({ scope: "project", matcher: "Edit", command }),
      ]),
      []
    );
  });

  test("the same entry under a different matcher gives a finding (the ids differ)", () => {
    const command = `node "${home}/.claude/helpers/graft-hooks.cjs" post-edit`;
    assert.equal(
      dupHookScope([
        hook({ scope: "user", matcher: "Edit|Skill", command }),
        hook({ scope: "project", matcher: "Edit", command }),
      ]).length,
      1
    );
  });

  test("heimstream's .trail/hook.cjs session-start gives none against the user graft-hooks.cjs session-start", () => {
    assert.deepEqual(
      dupHookScope([
        hook({
          scope: "user",
          event: "SessionStart",
          command: `node "${home}/.claude/helpers/graft-hooks.cjs" session-start || exit 0`,
        }),
        hook({
          scope: "project",
          event: "SessionStart",
          command:
            'node "${CLAUDE_PROJECT_DIR:-.}/.trail/hook.cjs" session-start || exit 0',
        }),
      ]),
      []
    );
  });

  test("other args or another event give none", () => {
    assert.deepEqual(
      dupHookScope([
        hook({ scope: "user", command: USER_GRAFT }),
        hook({
          scope: "project",
          command: PROJECT_GRAFT.replace("post-edit", "pre-edit"),
        }),
        hook({ scope: "project", event: "PreToolUse", command: PROJECT_GRAFT }),
      ]),
      []
    );
  });

  test("plugin hooks and disabled hooks give none", () => {
    assert.deepEqual(
      dupHookScope([
        hook({ scope: "user", command: USER_GRAFT }),
        hook({ scope: "plugin", plugin: "trail@x", command: PROJECT_GRAFT }),
        hook({ scope: "project", command: PROJECT_GRAFT, state: "disabled" }),
      ]),
      []
    );
    assert.deepEqual(
      dupHookScope([
        hook({ scope: "plugin", plugin: "trail@x", command: USER_GRAFT }),
        hook({ scope: "project", command: PROJECT_GRAFT }),
      ]),
      []
    );
  });

  test("the message masks a secret-looking argument", () => {
    const findings = dupHookScope([
      hook({ scope: "user", command: "~/bin/run.sh sk-live-123 || exit 0" }),
      hook({ scope: "project", command: '"$HOME/bin/run.sh" "sk-live-123"' }),
    ]);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, / runs run\.sh <masked>, which /);
    assert.doesNotMatch(findings[0].message, /sk-live/);
  });

  test("a user-only hook with matcher mcp__graft__ gives none", () => {
    assert.deepEqual(
      dupHookScope([
        hook({
          scope: "user",
          event: "PreToolUse",
          matcher: "mcp__graft__",
          command: `node "${home}/.claude/helpers/graft-hooks.cjs" pre-tool || exit 0`,
        }),
      ]),
      []
    );
  });
});

describe("stale-mcp-permission", () => {
  const rule = rules.find((one) => one.id === "stale-mcp-permission");
  assert.ok(rule, "stale-mcp-permission is registered");
  const run = ({
    project = {},
    local = {},
    user = {},
    servers = [],
  }: {
    project?: Record<string, string[]>;
    local?: Record<string, string[]>;
    user?: Record<string, string[]>;
    servers?: string[];
  }) =>
    rule.run({
      ...context([]),
      layers: [
        { scope: "user", source: userFile, json: { permissions: user } },
        {
          scope: "project",
          source: projectFile,
          json: { permissions: project },
        },
        { scope: "local", source: localFile, json: { permissions: local } },
      ],
      mcp: { servers: servers.map((name) => ({ name })) as never },
    });

  test("retired trail and graft tools in project or local permissions give one warning each", () => {
    const found = run({
      project: { allow: ["mcp__trail__trail_find_code", "Read"] },
      local: { allow: ["mcp__graft"], deny: ["mcp__graft__graft_repo_map"] },
    });
    assert.deepEqual(
      found.map((one) => [one.file, one.message]),
      [
        [
          projectFile,
          'Permission allow entry "mcp__trail__trail_find_code" is for MCP server "trail", which is not configured',
        ],
        [
          localFile,
          'Permission allow entry "mcp__graft" is for MCP server "graft", which is not configured',
        ],
        [
          localFile,
          'Permission deny entry "mcp__graft__graft_repo_map" is for MCP server "graft", which is not configured',
        ],
      ]
    );
  });

  test("user-layer permissions, Bash(trail:*), Bash(graft:*) and other servers give none", () => {
    assert.deepEqual(
      run({
        user: { allow: ["mcp__trail__trail_find_code"] },
        project: {
          allow: [
            "Bash(trail:*)",
            "Bash(graft:*)",
            "mcp__context7__query-docs",
          ],
        },
      }),
      []
    );
  });

  test("a server of that name that is configured keeps its permissions", () => {
    assert.deepEqual(
      run({
        project: { allow: ["mcp__trail__trail_find_code"] },
        servers: ["trail"],
      }),
      []
    );
  });

  test("a name that only starts the same (mcp__trailer) is not retired", () => {
    assert.deepEqual(run({ project: { allow: ["mcp__trailer__x"] } }), []);
  });
});

describe("trail-hooks-missing", () => {
  const rule = rules.find((one) => one.id === "trail-hooks-missing");
  assert.ok(rule, "trail-hooks-missing is registered");
  const run = ({
    command,
    onPath = true,
  }: {
    command?: string;
    onPath?: boolean;
  }) =>
    rule.run({
      ...context([]),
      layers: [
        {
          scope: "user",
          source: userFile,
          json: command
            ? {
                hooks: {
                  Stop: [{ hooks: [{ type: "command", command }] }],
                },
              }
            : {},
        },
      ],
      which: (name) => onPath && name === "trail",
    });

  test("trail on PATH and no trail hook in the user settings gives one info finding on that file", () => {
    const [found, ...rest] = run({});
    assert.equal(rest.length, 0);
    assert.equal(found?.severity, "info");
    assert.equal(found?.file, `${home}/.claude/settings.json`);
  });

  test("a user hook that runs trail's helper script gives none", () => {
    assert.deepEqual(run({ command: USER_GRAFT }), []);
    assert.deepEqual(
      run({ command: `node "${home}/.claude/helpers/trail-hooks.cjs" stop` }),
      []
    );
  });

  test("trail not on PATH gives none, and an unrelated hook does not count", () => {
    assert.deepEqual(run({ onPath: false }), []);
    assert.equal(run({ command: "~/bin/lint.sh" }).length, 1);
  });
});

// ---- GitHub Copilot and trail rules: real temp folders, the real reader. Never the real home. ----

const SECRET = "sk-live-0123456789abcdefSECRET";

describe("copilot rules", () => {
  let tmp: string;
  let h: string;
  let ch: string;
  let repo: string;
  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "agentry-copilot-rules-")));
    assert.ok(
      !tmp.startsWith(realpathSync(homedir())),
      "TMPDIR must be outside the home directory"
    );
    h = join(tmp, "home");
    ch = join(h, ".copilot");
    repo = join(h, "ws", "repo");
    mkdirSync(repo, { recursive: true });
    mkdirSync(join(h, ".claude"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: repo });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const write = (file: string, text: string) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const writeJson = (file: string, value: unknown) =>
    write(file, JSON.stringify(value));
  const run = (id: string, env: NodeJS.ProcessEnv = {}) => {
    const rule = rules.find((one) => one.id === id);
    assert.ok(rule, `${id} is registered`);
    const paths = createPaths({
      memoize: true,
      env: {
        AGENTRY_HOME: h,
        CLAUDE_CONFIG_DIR: join(h, ".claude"),
        COPILOT_HOME: "",
        ...env,
      },
    });
    return rule.run({
      ...context([]),
      copilot: createCopilotReader(paths).read({ cwd: repo }),
      cwd: repo,
      line: () => 3,
      paths,
      project: { cwd: repo, root: repo },
    });
  };
  const withCopilot = () => mkdirSync(ch, { recursive: true });

  test("without a Copilot home no Copilot rule fires, whatever the repo holds", () => {
    writeJson(join(repo, ".mcp.json"), {
      mcpServers: {
        x: { type: "http", url: "https://h/mcp", headers: { A: SECRET } },
      },
    });
    writeJson(join(repo, ".github", "hooks", "h.json"), {
      SessionStart: [{ type: "command", command: "echo hi" }],
    });
    write(join(h, ".claude", "CLAUDE.md"), "x\n");
    write(join(h, ".claude", "rules", "r.md"), "x\n");
    for (const rule of rules.filter((one) => one.id.startsWith("copilot-"))) {
      assert.deepEqual(run(rule.id), [], rule.id);
    }
  });

  describe("copilot-broken-skill-link", () => {
    test("fires for a dead link in the Copilot skill folders with the Claude rule's wording; .claude/skills is left to it", () => {
      withCopilot();
      mkdirSync(join(ch, "skills"), { recursive: true });
      symlinkSync(join(tmp, "nowhere"), join(ch, "skills", "ghost"));
      mkdirSync(join(h, ".agents", "skills"), { recursive: true });
      symlinkSync(join(tmp, "gone"), join(h, ".agents", "skills", "old"));
      mkdirSync(join(repo, ".github", "skills"), { recursive: true });
      symlinkSync(join(tmp, "away"), join(repo, ".github", "skills", "far"));
      mkdirSync(join(repo, ".claude", "skills"), { recursive: true });
      symlinkSync(join(tmp, "x"), join(repo, ".claude", "skills", "mine"));
      const found = run("copilot-broken-skill-link");
      assert.deepEqual(found.map((item) => item.message).sort(), [
        `Skill link "far" points at ${tmp}/away, which does not exist`,
        `Skill link "ghost" points at ${tmp}/nowhere, which does not exist`,
        `Skill link "old" points at ${tmp}/gone, which does not exist`,
      ]);
      assert.ok(found.every((item) => item.severity === "warning"));
      assert.equal(
        found.find((item) => item.message.includes('"ghost"'))?.fix,
        `Remove the link: rm "${join(ch, "skills", "ghost")}"`
      );
    });

    test("a good link and a normal skill give none", () => {
      withCopilot();
      write(join(tmp, "real", "SKILL.md"), "---\nname: real\n---\n");
      mkdirSync(join(ch, "skills"), { recursive: true });
      symlinkSync(join(tmp, "real"), join(ch, "skills", "real"));
      assert.deepEqual(run("copilot-broken-skill-link"), []);
    });
  });

  describe("copilot-mcp-secret", () => {
    test("fires as an error per place, naming server and file and showing only the mask", () => {
      withCopilot();
      writeJson(join(ch, "mcp-config.json"), {
        mcpServers: {
          remote: {
            type: "http",
            url: `https://host/mcp?key=${SECRET}`,
            headers: { Authorization: `Bearer ${SECRET}` },
          },
          local: {
            type: "local",
            command: "npx",
            args: ["-y", "pkg", `--token=${SECRET}`],
            env: { KEY: SECRET },
          },
        },
      });
      writeJson(join(repo, ".mcp.json"), {
        mcpServers: {
          ws: { type: "http", url: "https://h/m", headers: { X: SECRET } },
        },
      });
      const found = run("copilot-mcp-secret");
      assert.equal(found.length, 5);
      assert.ok(found.every((item) => item.severity === "error"));
      assert.deepEqual(
        found.map(
          (item) =>
            item.file === join(ch, "mcp-config.json") ||
            item.file === join(repo, ".mcp.json")
        ),
        found.map(() => true)
      );
      assert.match(
        found.map((item) => item.message).join("\n"),
        /MCP server "ws" has a literal secret in headers\.X \(<masked>\)/
      );
      const text = JSON.stringify(found);
      assert.ok(!text.includes(SECRET), "no raw secret in any finding");
      assert.ok(!text.includes("0123456789"));
      assert.match(found[0]?.fix ?? "", /\$\{VAR\}/);
    });

    test("a ${VAR} reference, a disabled server and a short literal are not secrets", () => {
      withCopilot();
      writeJson(join(ch, "settings.json"), { disabledMcpServers: ["off"] });
      writeJson(join(ch, "mcp-config.json"), {
        mcpServers: {
          context7: {
            type: "http",
            url: "https://mcp.context7.com/mcp",
            headers: {
              CONTEXT7_API_KEY: "${CONTEXT7_API_KEY}",
              Authorization: "Bearer ${TOKEN}",
            },
            tools: ["*"],
          },
          local: {
            type: "local",
            command: "npx",
            args: ["-y", "pkg", "${HOME}/some_long_directory_name1"],
            env: { A: "${A}", MODE: "debug" },
          },
          off: { type: "http", url: "https://h/m", headers: { X: SECRET } },
        },
      });
      assert.deepEqual(run("copilot-mcp-secret"), []);
    });
  });

  describe("copilot-coauthor", () => {
    test("fires when the user setting is absent or true", () => {
      withCopilot();
      const [absent] = run("copilot-coauthor");
      assert.equal(absent?.severity, "warning");
      assert.equal(absent?.file, join(ch, "settings.json"));
      assert.match(absent?.message ?? "", /includeCoAuthoredBy is not set/);
      writeJson(join(ch, "settings.json"), { includeCoAuthoredBy: true });
      const [explicit] = run("copilot-coauthor");
      assert.match(explicit?.message ?? "", /includeCoAuthoredBy is true$/);
    });

    test("a trusted repo's file that sets true is the one reported; an untrusted repo file is ignored", () => {
      withCopilot();
      writeJson(join(ch, "settings.json"), { includeCoAuthoredBy: false });
      const repoSettings = join(repo, ".github", "copilot", "settings.json");
      writeJson(repoSettings, { includeCoAuthoredBy: true });
      assert.deepEqual(run("copilot-coauthor"), []);
      writeJson(join(ch, "config.json"), { trustedFolders: [repo] });
      const [found] = run("copilot-coauthor");
      assert.equal(found?.file, repoSettings);
    });

    test("false in the user settings gives none", () => {
      withCopilot();
      writeJson(join(ch, "settings.json"), { includeCoAuthoredBy: false });
      assert.deepEqual(run("copilot-coauthor"), []);
    });
  });

  describe("copilot-context7-local", () => {
    const oldEntry = {
      type: "local",
      command: "bunx",
      args: ["--bun", "@upstash/context7-mcp"],
      tools: ["*"],
    };
    test("fires for the old local entry and for an edited local one", () => {
      withCopilot();
      writeJson(join(ch, "mcp-config.json"), {
        mcpServers: { context7: oldEntry },
      });
      const [found] = run("copilot-context7-local");
      assert.equal(found?.severity, "warning");
      assert.equal(found?.file, join(ch, "mcp-config.json"));
      writeJson(join(ch, "mcp-config.json"), {
        mcpServers: {
          context7: { ...oldEntry, env: { DEFAULT_MINIMUM_TOKENS: "1000" } },
        },
      });
      assert.equal(run("copilot-context7-local").length, 1);
    });

    test("the http entry, no entry, or no Copilot home give none", () => {
      withCopilot();
      assert.deepEqual(run("copilot-context7-local"), []);
      writeJson(join(ch, "mcp-config.json"), {
        mcpServers: {
          context7: {
            type: "http",
            url: "https://mcp.context7.com/mcp",
            headers: { CONTEXT7_API_KEY: "${CONTEXT7_API_KEY}" },
            tools: ["*"],
          },
        },
      });
      assert.deepEqual(run("copilot-context7-local"), []);
    });
  });

  describe("copilot-untrusted-hooks", () => {
    const hookFile = () => join(repo, ".github", "hooks", "h.json");
    test("repo hooks in an untrusted repo fire with the setup command and no COPILOT_ALLOW_ALL", () => {
      withCopilot();
      writeJson(hookFile(), {
        SessionStart: [{ type: "command", command: "echo hi" }],
      });
      const [found, ...rest] = run("copilot-untrusted-hooks");
      assert.equal(rest.length, 0);
      assert.equal(found?.severity, "warning");
      assert.equal(found?.file, hookFile());
      assert.equal(found?.fix, "agentry copilot trust");
      assert.ok(!JSON.stringify(found).includes("COPILOT_ALLOW_ALL"));
    });

    test("a trusted repo (or parent), or no repo hooks, give none; a user hook does not count", () => {
      withCopilot();
      writeJson(join(ch, "hooks", "u.json"), {
        SessionStart: [{ type: "command", command: "echo u" }],
      });
      assert.deepEqual(run("copilot-untrusted-hooks"), []);
      writeJson(hookFile(), {
        SessionStart: [{ type: "command", command: "echo hi" }],
      });
      writeJson(join(ch, "config.json"), { trustedFolders: [join(h, "ws")] });
      assert.deepEqual(run("copilot-untrusted-hooks"), []);
    });
  });

  describe("copilot-dup-hook", () => {
    const userCmd = "bash ~/.copilot/helpers/x.sh go";
    const repoCmd = 'bash "./.github/helpers/x.sh" go || true';
    test("a repo hook a user hook of the same event also runs fires once, naming the command, event and both files", () => {
      withCopilot();
      const userHooks = join(ch, "hooks", "u.json");
      writeJson(userHooks, {
        SessionStart: [{ type: "command", command: userCmd }],
      });
      const repoFile = join(repo, ".github", "hooks", "r.json");
      writeJson(repoFile, {
        version: 1,
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", bash: repoCmd }] }],
        },
      });
      const [found, ...rest] = run("copilot-dup-hook");
      assert.equal(rest.length, 0);
      assert.equal(found?.severity, "warning");
      assert.equal(found?.file, repoFile);
      assert.match(
        found?.message ?? "",
        new RegExp(
          `^SessionStart hook \\([0-9a-f]{8}\\) runs twice in Copilot: ${repoFile} \\(repo\\) and ${userHooks} \\(user\\) both run bash "\\./\\.github/helpers/x\\.sh" go`
        )
      );
      assert.match(found?.fix ?? "", /^agentry fix removes the repo copy/);
    });

    test("a duplicate in .claude/settings.json is advice only and never says to edit that file", () => {
      withCopilot();
      writeJson(join(ch, "settings.json"), {
        hooks: { Stop: [{ hooks: [{ type: "command", command: userCmd }] }] },
      });
      const claudeFile = join(repo, ".claude", "settings.json");
      writeJson(claudeFile, {
        hooks: { Stop: [{ hooks: [{ type: "command", command: repoCmd }] }] },
      });
      const [found, ...rest] = run("copilot-dup-hook");
      assert.equal(rest.length, 0);
      assert.equal(found?.file, claudeFile);
      assert.match(found?.fix ?? "", /^Claude Code also runs the hooks in /);
      assert.match(found?.fix ?? "", /leave it as is/);
      assert.doesNotMatch(found?.fix ?? "", /agentry fix/);
    });

    test("another event, another script, or one level only gives none", () => {
      withCopilot();
      writeJson(join(ch, "hooks", "u.json"), {
        SessionStart: [{ type: "command", command: userCmd }],
      });
      const repoFile = join(repo, ".github", "hooks", "r.json");
      writeJson(repoFile, {
        Stop: [{ type: "command", command: repoCmd }],
        SessionStart: [
          { type: "command", command: "bash ./.github/helpers/x.sh other" },
          { type: "command", command: "echo hi" },
        ],
      });
      assert.deepEqual(run("copilot-dup-hook"), []);
      rmSync(join(ch, "hooks"), { recursive: true });
      writeJson(repoFile, {
        SessionStart: [{ type: "command", command: repoCmd }],
      });
      assert.deepEqual(run("copilot-dup-hook"), []);
    });
  });

  describe("copilot-cannot-see", () => {
    test("one finding per kind lists the names; rules point at setup, skills are advice", () => {
      withCopilot();
      write(join(h, ".claude", "rules", "a.md"), "x\n");
      write(join(h, ".claude", "rules", "b.md"), "x\n");
      write(
        join(h, ".claude", "skills", "one", "SKILL.md"),
        "---\nname: one\n---\n"
      );
      write(join(h, ".claude", "CLAUDE.md"), "x\n");
      const found = run("copilot-cannot-see");
      assert.equal(found.length, 3);
      assert.ok(found.every((item) => item.severity === "info"));
      const [rulesFinding] = found;
      assert.match(rulesFinding?.message ?? "", /2 Claude user rules: a, b$/);
      assert.match(rulesFinding?.fix ?? "", /agentry copilot share <name>/);
      assert.match(found[1]?.message ?? "", /1 Claude user skill: one$/);
      assert.match(found[1]?.fix ?? "", /agentry copilot share <name>/);
      assert.doesNotMatch(found[1]?.fix ?? "", /setup\.sh/);
      assert.match(found[2]?.message ?? "", /user CLAUDE\.md/);
    });

    test("twins in the Copilot home (or ~/.agents/skills) make it quiet", () => {
      withCopilot();
      write(join(h, ".claude", "rules", "a.md"), "x\n");
      write(join(ch, "instructions", "a.instructions.md"), "x\n");
      write(join(h, ".claude", "skills", "one", "SKILL.md"), "x");
      write(join(h, ".claude", "skills", "two", "SKILL.md"), "x");
      write(join(ch, "skills", "one", "SKILL.md"), "x");
      write(join(h, ".agents", "skills", "two", "SKILL.md"), "x");
      write(join(h, ".claude", "CLAUDE.md"), "x\n");
      write(join(ch, "copilot-instructions.md"), "x\n");
      assert.deepEqual(run("copilot-cannot-see"), []);
    });
  });

  describe("trail-old-index", () => {
    const index = () => join(repo, "graft", "INDEX.md");
    test("fires without a Copilot home for an untracked graft/INDEX.md and no .trail/cache", () => {
      write(index(), "# index\n");
      const [found, ...rest] = run("trail-old-index");
      assert.equal(rest.length, 0);
      assert.equal(found?.severity, "info");
      assert.equal(found?.file, index());
      assert.match(
        found?.message ?? "",
        /autobuild hook migrates it at the next session start/
      );
    });

    test("a .trail/cache, a tracked graft/ or no graft/INDEX.md give none", () => {
      assert.deepEqual(run("trail-old-index"), []);
      write(index(), "# index\n");
      mkdirSync(join(repo, ".trail", "cache"), { recursive: true });
      assert.deepEqual(run("trail-old-index"), []);
      rmSync(join(repo, ".trail"), { recursive: true });
      execFileSync("git", ["add", "-f", "graft/INDEX.md"], { cwd: repo });
      assert.deepEqual(run("trail-old-index"), []);
    });
  });
});
