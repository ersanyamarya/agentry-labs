import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { Fixture } from "./helpers/fixture.js";
import { createFixture } from "./helpers/fixture.js";

let fx: Fixture;
let ws: string;
beforeEach(() => {
  fx = createFixture();
  ws = join(fx.root, "ws");
  mkdirSync(ws);
});
afterEach(() => fx.cleanup());

const newRepo = (
  name: string,
  {
    mcp,
    settings,
  }: { mcp?: Record<string, unknown>; settings?: Record<string, unknown> } = {}
) => {
  const dir = join(ws, name);
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  if (mcp) {
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: mcp }));
  }
  if (settings) {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, ".claude", "settings.json"),
      JSON.stringify(settings)
    );
  }
  return dir;
};
// A permission entry using the old tool name: a stale-name warning for that repo.
const stale = { permissions: { allow: ["Bash(graft *)"] } };
const scan = (...args: string[]) => {
  const { status, stdout, stderr } = fx.run(["scan", ...args, "--json"]);
  assert.ok(status === 0 || status === 1, stderr);
  return JSON.parse(stdout);
};

describe("scan", () => {
  test("lists each repo with counts, sorted by findings; --only-problems drops clean repos", () => {
    newRepo("clean");
    newRepo("bad", { settings: stale });
    const data = scan(ws);
    assert.deepEqual(
      data.repos.map((row: Record<string, any>) => row.path.slice(ws.length)),
      ["/bad", "/clean"]
    );
    assert.equal(data.repos[0].summary.warning, 1);
    assert.equal(data.repos[0].findings[0].id, "stale-name");
    assert.equal(data.repos[1].summary.warning, 0);
    assert.equal(data.totals.repos, 2);
    assert.deepEqual(Object.keys(data).sort(), [
      "cache",
      "depth",
      "global",
      "repos",
      "roots",
      "totals",
      "version",
    ]);
    assert.deepEqual(Object.keys(data.repos[0]).sort(), [
      "counts",
      "errors",
      "findings",
      "kind",
      "path",
      "root",
      "summary",
      "tokens",
    ]);

    const only = scan(ws, "--only-problems");
    assert.deepEqual(
      only.repos.map((row: Record<string, any>) => row.path.slice(ws.length)),
      ["/bad"]
    );
  });

  test("a finding in a user-level file is reported once under global, not per repo", () => {
    writeFileSync(
      join(fx.configDir, "settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "/no/such/hook.sh" }] }],
        },
      })
    );
    newRepo("one");
    newRepo("two");
    const data = scan(ws);
    assert.equal(data.global.findings.length, 1);
    assert.equal(data.global.findings[0].id, "missing-hook-file");
    for (const row of data.repos) {
      assert.deepEqual(row.findings, []);
    }
    assert.equal(data.totals.error, 1);
    assert.equal(fx.run(["scan", ws]).status, 1);
  });

  test("human table shows the global block, header and repos; exit 2 for a missing root", () => {
    newRepo("one");
    const { status, stdout } = fx.run(["scan", ws]);
    assert.equal(status, 0);
    assert.match(stdout, /^Global \(user-level\):/);
    assert.match(
      stdout,
      /repo +skills +mcp +hooks +plugins +~tokens +findings/
    );
    assert.match(stdout, /1 repo scanned/);
    const missing = fx.run(["scan", join(ws, "nope")]);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /Not a folder/);
  });

  test("default root is the current folder; --depth limits the search; bad --depth exits 2", () => {
    newRepo("deep");
    mkdirSync(join(ws, "a", "b"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: join(ws, "a", "b") });
    const { stdout } = fx.run(["scan", "--json"], { cwd: ws });
    assert.equal(JSON.parse(stdout).repos.length, 2);
    assert.equal(scan(ws, "--depth", "1").repos.length, 1);
    assert.equal(fx.run(["scan", ws, "--depth", "x"]).status, 2);
  });

  test("repeat scan reuses the cache; a changed file invalidates only its repo; --no-cache bypasses it", () => {
    const one = newRepo("one", { settings: {} });
    newRepo("two", { settings: {} });
    assert.deepEqual(scan(ws).cache, { enabled: true, hits: 0, misses: 2 });
    assert.deepEqual(scan(ws).cache, { enabled: true, hits: 2, misses: 0 });

    const file = join(one, ".claude", "settings.json");
    writeFileSync(file, JSON.stringify({ disableAllHooks: true }));
    utimesSync(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    assert.deepEqual(scan(ws).cache, { enabled: true, hits: 1, misses: 1 });
    assert.deepEqual(scan(ws, "--no-cache").cache, {
      enabled: false,
      hits: 0,
      misses: 2,
    });
  });

  test("a new settings file in a repo, or a user-level change, is noticed; cached data matches a fresh scan", () => {
    const one = newRepo("one");
    newRepo("two");
    scan(ws);
    mkdirSync(join(one, ".claude"));
    writeFileSync(
      join(one, ".claude", "settings.local.json"),
      JSON.stringify(stale)
    );
    const second = scan(ws);
    assert.deepEqual(second.cache, { enabled: true, hits: 1, misses: 1 });
    assert.equal(second.repos[0].summary.warning, 1);

    const settings = join(fx.configDir, "settings.json");
    writeFileSync(settings, "{}");
    assert.equal(scan(ws).cache.misses, 2);
    const { cache: _a, ...cached } = scan(ws);
    const { cache: _b, ...fresh } = scan(ws, "--no-cache");
    assert.deepEqual(cached, fresh);
  });

  test("writes only under the cache folder in the config dir", () => {
    newRepo("one");
    scan(ws);
    assert.ok(readdirSync(join(fx.configDir, "cache", "agentry")).length >= 1);
    assert.ok(!existsSync(join(ws, "one", "cache")));
    scan(ws, "--no-cache");
  });
});
