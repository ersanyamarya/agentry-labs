import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(repo, "scripts", "check-bundles.mjs");

function fixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "bundles-"));
  mkdirSync(join(dir, "skills", "alpha"), { recursive: true });
  writeFileSync(join(dir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");
  mkdirSync(join(dir, "rules"));
  writeFileSync(join(dir, "rules", "one.md"), "x");
  writeFileSync(join(dir, "bundles.tsv"), "# c\ngeneral\tskills/alpha\ngeneral\trules/one.md\n");
  mutate?.(dir);
  const r = spawnSync("node", [script, "--root", dir], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return r;
}
const tsvOf = (dir, body) => writeFileSync(join(dir, "bundles.tsv"), body);

test("clean fixture passes", () => {
  const r = fixture();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /bundles\.tsv ok \(2 components, 5 bundles\)/);
});
test("component without a line fails", () => {
  const r = fixture((d) => tsvOf(d, "general\tskills/alpha\n"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /rules\/one\.md has no line/);
});
test("line pointing at a missing path fails", () => {
  const r = fixture((d) => tsvOf(d, "general\tskills/alpha\ngeneral\trules/one.md\nweb\tskills/ghost\n"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /skills\/ghost does not exist/);
});
test("unknown bundle fails", () => {
  const r = fixture((d) => tsvOf(d, "global\tskills/alpha\ngeneral\trules/one.md\n"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown bundle "global"/);
});
test("component with two lines fails", () => {
  const r = fixture((d) => tsvOf(d, "general\tskills/alpha\nweb\tskills/alpha\ngeneral\trules/one.md\n"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already listed at line 1/);
});
test("the real repo passes", () => {
  const r = spawnSync("node", [script], { encoding: "utf8", cwd: repo });
  assert.equal(r.status, 0, r.stderr);
});
