import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { DoctorContext } from "../doctor-rules.js";
import { hookRunKey, rules } from "../doctor-rules.js";
import { hookId } from "../inventory/hooks.js";
import { createPaths } from "../paths.js";
import type {
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

// What the rule asked `line` to find, newest last.
const needles: string[] = [];

const context = (items: HookItem[]): DoctorContext => ({
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
