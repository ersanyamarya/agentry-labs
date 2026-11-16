// @vitest-environment node
// The oRPC router over a real createData() on a temp HOME: what load sends, that writes go through core (and back up),
// that previews write nothing, that bad input never reaches core, and that no secret reaches the browser.

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { createData } from "@agentry/core/data";
import { createPaths } from "@agentry/core/paths";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  addPlugin,
  createFixture,
  type Fixture,
} from "../../../../src/test/helpers/fixture.js";
import type { Client } from "../contract/index.js";
import { type Api, createRouter, handleRpc } from "../server/router.js";

const SECRETS = [
  "ghp_SECRETargTOKEN1234567890",
  "sk-SECRETenvVALUE123456",
  "SECRETurlVALUE99",
  "SECRETheaderVALUE77",
  "sk-SECREThookKEY55443322",
  "SECRETparkedVALUE",
];

let fx: Fixture;
let data: Api;
let client: Client;

const dataFor = (fixture: Fixture): Api =>
  createData({
    makePaths: (dir) =>
      createPaths({
        env: {
          AGENTRY_HOME: fixture.home,
          CLAUDE_CONFIG_DIR: fixture.configDir,
          AGENTRY_MANAGED_DIR: fixture.managedDir,
        },
        cwd: dir,
      }),
    doctorOptions: {
      env: { PATH: "" },
      launchctlGetenv: () => "",
      renames: {},
    },
    isCopilotRunning: () => false,
  });

// User MCP servers, a hook and a parked server, each holding a secret in a different place.
const writeSecrets = () => {
  writeFileSync(
    join(fx.configDir, ".claude.json"),
    JSON.stringify({
      mcpServers: {
        api: {
          command: "npx",
          args: ["srv", "--token", SECRETS[0]],
          env: { API_KEY: SECRETS[1], PLAIN: "${HOME_REF}" },
        },
        web: {
          type: "http",
          url: `https://mcp.example.com/mcp?key=${SECRETS[2]}`,
          headers: { Authorization: `Bearer ${SECRETS[3]}` },
        },
      },
    })
  );
  writeFileSync(
    join(fx.configDir, "settings.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: `notify --api-key ${SECRETS[4]} --quiet`,
              },
            ],
          },
        ],
      },
    })
  );
  mkdirSync(join(fx.configDir, "agentry"), { recursive: true });
  writeFileSync(
    join(fx.configDir, "agentry", "parked-mcp.json"),
    JSON.stringify({
      version: 1,
      servers: {
        old: {
          config: { command: "old-srv", env: { TOKEN: SECRETS[5] } },
          parkedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    })
  );
};

// Every file under the fixture with its content hash (links by target), minus agentry's own read caches.
const snapshot = (): Map<string, string> => {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(fx.root, path);
      if (rel.includes(join("cache", "agentry")) || entry.name === ".git") {
        continue;
      }
      if (entry.isSymbolicLink()) {
        files.set(rel, `link:${lstatSync(path).size}`);
      } else if (entry.isDirectory()) {
        files.set(rel, "dir");
        walk(path);
      } else {
        files.set(
          rel,
          createHash("sha256").update(readFileSync(path)).digest("hex")
        );
      }
    }
  };
  walk(fx.root);
  return files;
};

beforeEach(() => {
  fx = createFixture();
  data = dataFor(fx);
  client = createRouterClient(createRouter(data));
});
afterEach(() => fx.cleanup());

describe("load", () => {
  test("returns every section as plain JSON, over HTTP too", async () => {
    // The fetch path the server route uses, with load sent as GET.
    const http: Client = createORPCClient(
      new RPCLink({
        url: "http://127.0.0.1/rpc",
        method: (_options, path) =>
          path.join(".") === "load" ? "GET" : "POST",
        fetch: (request) => handleRpc(request, data),
      })
    );
    const loaded = await http.load({ dir: fx.repo });
    expect(Object.keys(loaded).sort()).toEqual(
      [
        "agents",
        "backups",
        "catalog",
        "dir",
        "doctor",
        "groups",
        "parked",
        "parkedHooks",
        "paths",
        "rules",
        "status",
      ].sort()
    );
    expect(loaded.dir).toBe(fx.repo);
    expect(loaded.paths.configDir).toBe(fx.configDir);
    expect(loaded.groups.items.map((group) => group.name).sort()).toEqual([
      "audit",
      "video",
    ]);
    expect(loaded.backups).toEqual({ items: [] });
    expect(JSON.parse(JSON.stringify(loaded))).toEqual(loaded);
  });

  test("sends MCP env, headers, args, urls, hook commands and parked servers masked", async () => {
    writeSecrets();
    const loaded = await client.load({ dir: fx.repo });
    const text = JSON.stringify(loaded);
    for (const secret of SECRETS) {
      expect(text).not.toContain(secret);
    }
    const api = loaded.status.mcp.servers.find(
      (server) => server.name === "api"
    );
    expect(api?.env).toEqual({ API_KEY: "<masked>", PLAIN: "${HOME_REF}" });
    expect(api?.args).toEqual(["srv", "--token", "<masked>"]);
    const web = loaded.status.mcp.servers.find(
      (server) => server.name === "web"
    );
    expect(web?.headers).toEqual({ Authorization: "Bearer <masked>" });
    expect(loaded.status.hooks.items[0]?.command).toContain("<masked>");
    expect(loaded.parked.items.map((server) => server.name)).toEqual(["old"]);
  });

  test("plugins, rules and parked hooks pass the output schema with real core data", async () => {
    addPlugin(fx, {
      settingsText: JSON.stringify({
        enabledPlugins: { "demo@mkt": true },
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo done" }] }],
        },
      }),
    });
    writeFileSync(join(fx.repo, "CLAUDE.md"), "# Project\n");
    writeFileSync(join(fx.configDir, "CLAUDE.md"), "# User\n");
    mkdirSync(join(fx.repo, ".claude", "rules"), { recursive: true });
    writeFileSync(join(fx.repo, ".claude", "rules", "style.md"), "Be terse.\n");

    const before = await client.load({ dir: fx.repo });
    const [hook] = before.status.hooks.items;
    const parked = await client.hooks.applyHook({
      dir: fx.repo,
      selector: hook!.id,
      action: "disable",
    });
    expect(parked.ok).toBe(true);

    const loaded = await client.load({ dir: fx.repo });
    expect(loaded.status.plugins.items.map((plugin) => plugin.id)).toEqual([
      "demo@mkt",
    ]);
    expect(loaded.rules.items).toHaveLength(3);
    expect(loaded.parkedHooks.items).toHaveLength(1);
    expect(loaded.parkedHooks.items[0]?.command).toBe("echo done");
    // applyHook backs the settings file up first, like every hook write.
    expect(loaded.backups.items.some((entry) => entry.kind === "fix")).toBe(
      true
    );
  });

  test("a part core could not read comes back with loadError, not a failed call", async () => {
    const real = data.load(fx.repo);
    const failing = {
      ...data,
      load: () => ({
        ...real,
        status: {
          project: { cwd: fx.repo, root: fx.repo },
          skills: { items: [], skipped: [] },
          mcp: { servers: [] },
          hooks: { items: [] },
          plugins: { items: [], marketplaces: [] },
          tokens: { measured: 0 },
          errors: [],
          loadError: "status failed (EACCES)",
        },
        backups: { loadError: "backups failed (EACCES)" },
      }),
    } as unknown as Api;
    const loaded = await createRouterClient(createRouter(failing)).load({
      dir: fx.repo,
    });
    expect(loaded.status.loadError).toBe("status failed (EACCES)");
    expect(loaded.backups).toEqual({
      items: [],
      loadError: "backups failed (EACCES)",
    });
  });
});

describe("skills writes", () => {
  test("toggleShelf links the skill into the project, as the TUI does", async () => {
    const result = await client.skills.toggleShelf({
      dir: fx.repo,
      target: "audit/review",
      on: true,
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBeTypeOf("string");
    const link = join(fx.repo, ".claude", "skills", "review");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  test("removeSkill deletes the folder after a copy to the backups", async () => {
    const skill = join(fx.configDir, "skills", "mine");
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), "---\nname: mine\n---\n");
    const result = await client.skills.removeSkill({
      dir: fx.repo,
      target: "mine",
    });
    expect(result.ok).toBe(true);
    expect(existsSync(skill)).toBe(false);
    const removed = join(fx.configDir, "backups", "agentry", "removed");
    expect(readdirSync(removed)).toHaveLength(1);
    const loaded = await client.load({ dir: fx.repo });
    expect(loaded.backups.items.map((entry) => entry.kind)).toEqual([
      "removed",
    ]);
  });
});

test("previews and dry runs write nothing", async () => {
  writeSecrets();
  const skill = join(fx.configDir, "skills", "mine");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: mine\n---\n");
  const { status, doctor } = await client.load({ dir: fx.repo });
  const before = snapshot();

  const dir = fx.repo;
  const runs = [
    await client.skills.removeSkill({ dir, target: "mine", dryRun: true }),
    await client.skills.shelveSkill({
      dir,
      skill: "mine",
      group: "audit",
      dryRun: true,
    }),
    await client.skills.unshelveSkill({
      dir,
      target: "audit/review",
      dryRun: true,
    }),
    await client.backups.pruneBackups({ dir, all: true, dryRun: true }),
  ];
  expect(runs.every((run) => typeof run.text === "string")).toBe(true);
  const [hook] = status.hooks.items;
  const preview = await client.hooks.previewHook({
    dir,
    selector: hook!.id,
    action: "disable",
  });
  expect(preview.appliable).toBe(true);
  expect(preview.text).not.toContain(SECRETS[4]);
  const [finding] = doctor.findings;
  expect(finding).toBeDefined();
  const fix = await client.doctor.previewFix({ dir, finding: finding! });
  expect(fix.steps).toBeTypeOf("number");
  const previews = [
    preview,
    fix,
    await client.mcp.previewMcpRemove({ dir, name: "api" }),
    await client.mcp.previewMcpRemove({ dir, name: "web" }),
    await client.mcp.previewMcpSet({ dir, name: "api", env: ["NEW=1"] }),
    await client.doctor.previewUndo({ dir }),
  ];
  // Preview text reaches the browser too: no secret in any of it.
  for (const { text } of previews) {
    for (const secret of SECRETS) {
      expect(text).not.toContain(secret);
    }
  }

  expect(snapshot()).toEqual(before);
});

describe("input the browser must not control", () => {
  test.each([
    ["a group that climbs out of the shelf", { group: "../evil" }],
    ["a group with a slash", { group: "a/b" }],
    ["a hidden skill name", { skill: ".hidden" }],
  ])("shelveSkill refuses %s", async (_what, bad) => {
    await expect(
      client.skills.shelveSkill({
        dir: fx.repo,
        skill: "mine",
        group: "audit",
        ...bad,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("removeSkill refuses .. as a project skill (it would be the .claude folder)", async () => {
    mkdirSync(join(fx.repo, ".claude", "skills"), { recursive: true });
    await expect(
      client.skills.removeSkill({ dir: fx.repo, target: "..", project: true })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(existsSync(join(fx.repo, ".claude"))).toBe(true);
  });

  test.each([
    ["a relative dir", "repo"],
    ["a dir that does not exist", "/no/such/agentry/folder"],
  ])("refuses %s", async (_what, dir) => {
    await expect(client.load({ dir })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("a dir that is a file is refused before core runs", async () => {
    const file = join(fx.root, "file.txt");
    writeFileSync(file, "x");
    await expect(
      client.skills.toggleShelf({ dir: file, target: "audit", on: true })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("an unknown procedure is a 404 over HTTP", async () => {
    const response = await handleRpc(
      new Request("http://127.0.0.1/rpc/skills/nope", { method: "POST" }),
      data
    );
    expect(response.status).toBe(404);
  });
});

// Sharing with Copilot over the router, on a throwaway <home>/.copilot (never the real one).
describe("copilot", () => {
  const copilotHome = () => join(fx.home, ".copilot");
  const signIn = () => {
    mkdirSync(copilotHome(), { recursive: true });
    writeFileSync(
      join(copilotHome(), "config.json"),
      '{ "loggedInUsers": [{ "login": "a" }] }\n'
    );
  };
  const userSkill = () => {
    mkdirSync(join(fx.configDir, "skills", "mine"), { recursive: true });
    writeFileSync(
      join(fx.configDir, "skills", "mine", "SKILL.md"),
      "---\nname: mine\ndescription: mine\n---\nBody\n"
    );
  };

  test("without ~/.copilot the state is null and load has no copilot field", async () => {
    expect(await client.copilot.copilotState({ dir: fx.repo })).toBeNull();
    expect("copilot" in (await client.load({ dir: fx.repo }))).toBe(false);
  });

  test("load and copilotState carry the share state; a preview writes nothing, apply links the skill", async () => {
    signIn();
    userSkill();
    const state = await client.copilot.copilotState({ dir: fx.repo });
    expect(state?.signedIn).toBe(true);
    expect(state?.trusted).toBe(false);
    expect(
      state?.items.find((item) => item.kind === "skill" && item.name === "mine")
        ?.state
    ).toBe("notShared");
    expect((await client.load({ dir: fx.repo })).copilot).toEqual(state);

    const input = {
      dir: fx.repo,
      action: "share",
      kind: "skill",
      name: "mine",
    } as const;
    const before = snapshot();
    const preview = await client.copilot.previewCopilot(input);
    expect(preview.appliable).toBe(true);
    expect(preview.text).toContain("all projects");
    expect(snapshot()).toEqual(before);

    expect((await client.copilot.applyCopilot(input)).ok).toBe(true);
    expect(
      lstatSync(join(copilotHome(), "skills", "mine")).isSymbolicLink()
    ).toBe(true);
    const after = await client.copilot.copilotState({ dir: fx.repo });
    expect(
      after?.items.find((item) => item.kind === "skill" && item.name === "mine")
        ?.state
    ).toBe("shared");
  });

  test("trust and untrust edit only Copilot's config.json", async () => {
    signIn();
    const trust = { dir: fx.repo, action: "trust" } as const;
    expect((await client.copilot.previewCopilot(trust)).appliable).toBe(true);
    expect((await client.copilot.applyCopilot(trust)).ok).toBe(true);
    expect(readFileSync(join(copilotHome(), "config.json"), "utf8")).toContain(
      "trustedFolders"
    );
    expect((await client.copilot.copilotState({ dir: fx.repo }))?.trusted).toBe(
      true
    );
    const untrust = { dir: fx.repo, action: "untrust" } as const;
    expect((await client.copilot.applyCopilot(untrust)).ok).toBe(true);
    expect((await client.copilot.copilotState({ dir: fx.repo }))?.trusted).toBe(
      false
    );
  });

  test("no secret reaches the browser or Copilot's mcp-config.json when an MCP server is shared", async () => {
    signIn();
    writeSecrets();
    const api = {
      dir: fx.repo,
      action: "share",
      kind: "mcp",
      name: "api",
    } as const;
    const preview = await client.copilot.previewCopilot(api);
    expect(preview.appliable).toBe(true);
    expect((await client.copilot.applyCopilot(api)).ok).toBe(true);
    const written = readFileSync(
      join(copilotHome(), "mcp-config.json"),
      "utf8"
    );
    // A server with a secret in its URL is refused, so only `api` was written.
    const web = { ...api, name: "web" } as const;
    const refused = await client.copilot.previewCopilot(web);
    expect(refused.appliable).toBe(false);
    for (const secret of SECRETS) {
      expect(preview.text).not.toContain(secret);
      expect(refused.text).not.toContain(secret);
      expect(written).not.toContain(secret);
    }
  });

  test.each([
    ["share without a kind or name", { action: "share" }],
    ["unshare without a name", { action: "unshare", kind: "skill" }],
    [
      "a name that climbs out of a folder",
      { action: "share", kind: "skill", name: ".." },
    ],
    ["a name with a slash", { action: "share", kind: "skill", name: "a/b" }],
    ["an unknown kind", { action: "share", kind: "hook", name: "x" }],
    ["an unknown action", { action: "delete" }],
  ])("refuses %s", async (_what, extra) => {
    signIn();
    await expect(
      client.copilot.previewCopilot({ dir: fx.repo, ...extra } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.copilot.applyCopilot({ dir: fx.repo, ...extra } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(existsSync(join(copilotHome(), "skills"))).toBe(false);
  });

  test("a dir that is not a folder is refused", async () => {
    await expect(
      client.copilot.copilotState({ dir: "/no/such/agentry/folder" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
