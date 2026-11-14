import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import { createFixture, type Fixture } from "./helpers/fixture.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());

test("agentry agents list: user and project agents, --json, and usage errors", () => {
  fx = createFixture();
  mkdirSync(join(fx.configDir, "agents"), { recursive: true });
  writeFileSync(
    join(fx.configDir, "agents", "reviewer.md"),
    "---\nname: reviewer\ndescription: Reviews diffs\nmodel: sonnet\n---\n"
  );
  const text = fx.run(["agents", "list"]);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /user\s+reviewer\s+sonnet\s+~\s*\d+ tokens/);
  const json = JSON.parse(fx.run(["agents", "list", "--json"]).stdout);
  assert.equal(json[0].name, "reviewer");
  assert.equal(json[0].scope, "user");
  assert.equal(fx.run(["agents"]).status, 2);
  assert.equal(fx.run(["agents", "remove", "x"]).status, 2);
  assert.match(fx.run(["--help"]).stdout, /agents list \[--json\]/);
});
