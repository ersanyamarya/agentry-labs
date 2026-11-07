import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";
import type { Fixture } from "./helpers/fixture.js";
import { createFixture } from "./helpers/fixture.js";

// One fixture workspace shared by the tests below: a clean repo, a repo whose .mcp.json duplicates a user-level MCP
// server, a repo using the old name "graft", a worktree of the clean repo, and two folders the scan must skip.
let fx: Fixture;
let ws: string;
const rel = (path: string) => path.slice(ws.length + 1);
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, stdio: "ignore" });
const writeJson = (file: string, value: unknown) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
};
const scan = (...args: string[]) => {
  const { status, stdout, stderr } = fx.run(["scan", ws, ...args, "--json"]);
  assert.ok(status === 0 || status === 1, stderr);
  return JSON.parse(stdout);
};
const byName = (data: Record<string, any>, name: string) =>
  data.repos.find((row: Record<string, any>) => rel(row.path) === name);
const mcpServer = { command: process.execPath, args: ["-e", "0"] };

const buildWorkspace = () => {
  ws = join(fx.root, "ws");
  const clean = join(ws, "clean");
  const dupe = join(ws, "dupe");
  const stale = join(ws, "stale");

  mkdirSync(clean, { recursive: true });
  git(clean, "init", "-q");
  git(
    clean,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "init"
  );
  git(clean, "worktree", "add", "-q", join(ws, "clean-wt"));

  mkdirSync(dupe, { recursive: true });
  git(dupe, "init", "-q");
  writeJson(join(dupe, ".mcp.json"), { mcpServers: { shared: mcpServer } });

  mkdirSync(stale, { recursive: true });
  git(stale, "init", "-q");
  writeJson(join(stale, ".claude", "settings.json"), {
    permissions: { allow: ["Bash(graft *)"] },
  });

  // Skipped: a fake repo in node_modules and a graft/ map folder holding a repo.
  mkdirSync(join(ws, "node_modules", "fake-pkg"), { recursive: true });
  git(join(ws, "node_modules", "fake-pkg"), "init", "-q");
  mkdirSync(join(ws, "graft", "map"), { recursive: true });
  git(join(ws, "graft", "map"), "init", "-q");

  // User-level MCP server with the same name as the one in the dupe repo.
  writeJson(join(fx.configDir, ".claude.json"), {
    mcpServers: { shared: mcpServer },
  });
  // A user-level finding, reported once under global. It also approves the project's "shared" server: an unapproved
  // .mcp.json entry does not shadow the user one, so without this there is no duplicate to report.
  writeJson(join(fx.configDir, "settings.json"), {
    enabledMcpjsonServers: ["shared"],
    hooks: {
      Stop: [{ hooks: [{ type: "command", command: "/no/such/hook.sh" }] }],
    },
  });
};

beforeAll(() => {
  fx = createFixture();
  buildWorkspace();
});
afterAll(() => fx.cleanup());

describe("scan over a fixture workspace", () => {
  test("finds the three repos and the worktree; skips node_modules and graft/", () => {
    const data = scan();
    assert.deepEqual(
      data.repos
        .map((row: Record<string, any>) => `${rel(row.path)}:${row.kind}`)
        .sort(),
      ["clean-wt:worktree", "clean:repo", "dupe:repo", "stale:repo"]
    );
    assert.equal(data.totals.repos, 4);
    assert.ok(!JSON.stringify(data).includes("fake-pkg"));
    assert.ok(!JSON.stringify(data).includes("graft/map"));
  });

  test("findings land only on the duplicate and stale repos, with the expected rule ids", () => {
    const data = scan();
    assert.deepEqual(byName(data, "clean").findings, []);
    assert.deepEqual(byName(data, "clean-wt").findings, []);
    assert.deepEqual(
      byName(data, "dupe").findings.map((item: Record<string, any>) => item.id),
      ["dup-mcp-scope"]
    );
    assert.deepEqual(
      byName(data, "stale").findings.map(
        (item: Record<string, any>) => item.id
      ),
      ["stale-name"]
    );
  });

  test("global findings appear once in the global block, not per repo", () => {
    const data = scan();
    assert.deepEqual(
      data.global.findings.map((item: Record<string, any>) => item.id),
      ["missing-hook-file"]
    );
    for (const row of data.repos) {
      assert.ok(
        !row.findings.some(
          (item: Record<string, any>) => item.id === "missing-hook-file"
        )
      );
    }
  });

  test("--only-problems drops the clean repo and the clean worktree", () => {
    const data = scan("--only-problems");
    assert.deepEqual(
      data.repos.map((row: Record<string, any>) => rel(row.path)).sort(),
      ["dupe", "stale"]
    );
  });

  test("repos are sorted by findings, most first", () => {
    const warnings = scan().repos.map(
      (row: Record<string, any>) => row.summary.warning
    );
    assert.deepEqual(
      warnings,
      [...warnings].sort((a, b) => b - a)
    );
    assert.ok(warnings[0] >= 1 && warnings.at(-1) === 0);
  });

  test("a repeat scan reuses the cache; editing one repo's config re-scans only that repo", () => {
    rmSync(join(fx.configDir, "cache"), { recursive: true, force: true });
    const first = scan();
    assert.deepEqual(first.cache, { enabled: true, hits: 0, misses: 4 });
    assert.deepEqual(scan().cache, { enabled: true, hits: 4, misses: 0 });

    const file = join(ws, "dupe", ".mcp.json");
    writeJson(file, { mcpServers: { renamed: mcpServer } });
    utimesSync(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    const third = scan();
    assert.deepEqual(third.cache, { enabled: true, hits: 3, misses: 1 });
    assert.deepEqual(byName(third, "dupe").findings, []);
    assert.deepEqual(
      byName(third, "stale").findings.map(
        (item: Record<string, any>) => item.id
      ),
      ["stale-name"]
    );
  });
});
