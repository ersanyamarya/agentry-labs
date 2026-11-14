import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { createAgents, frontmatter } from "../agents.js";
import { createPaths } from "../paths.js";

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-agents-")));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const paths = () =>
  createPaths({
    cwd: join(root, "repo"),
    env: { AGENTRY_HOME: join(root, "home"), PATH: process.env.PATH ?? "" },
  });

describe("frontmatter", () => {
  test("reads quoted values, bracket lists and multi-line lists", () => {
    const text = [
      "---",
      'name: "planner"',
      "description: Plans things",
      "tools: [read, search]",
      "skills:",
      "  - a",
      "  - b",
      "---",
      "body: not a field",
    ].join("\n");
    assert.deepEqual(frontmatter(text), {
      name: "planner",
      description: "Plans things",
      tools: "read, search",
      skills: "a, b",
    });
  });

  test("a file without frontmatter has no fields", () => {
    assert.deepEqual(frontmatter("# just text\n"), {});
  });
});

describe("agents", () => {
  test("lists user then project agents with model, tools and a name-and-description cost", () => {
    mkdirSync(join(root, "repo"), { recursive: true });
    write(
      join(root, "home", ".claude", "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Reviews diffs\nmodel: sonnet\ntools: Read, Grep\n---\nA long body that does not count.\n".padEnd(
        2000,
        "x"
      )
    );
    write(
      join(root, "repo", ".claude", "agents", "team", "helper.md"),
      "no frontmatter at all\n"
    );
    const found = createAgents(paths()).entries();
    assert.deepEqual(
      found.map((entry) => [entry.scope, entry.name]),
      [
        ["user", "reviewer"],
        ["project", "helper"],
      ]
    );
    const [reviewer, helper] = found;
    assert.equal(reviewer?.model, "sonnet");
    assert.equal(reviewer?.tools, "Read, Grep");
    assert.equal(reviewer?.description, "Reviews diffs");
    assert.ok((reviewer?.tokens ?? 99) < 20, "the body is not counted");
    assert.equal(helper?.description, "");
    assert.equal(helper?.label, ".claude/agents/team/helper.md");
  });

  test("nothing installed lists nothing, and --json prints the entries", () => {
    const lines: string[] = [];
    const agents = createAgents(paths(), { out: (text) => lines.push(text) });
    assert.equal(agents.list(), 0);
    assert.match(lines[0] ?? "", /No agents found/);
    write(
      join(root, "home", ".claude", "agents", "a.md"),
      "---\nname: a\n---\n"
    );
    lines.length = 0;
    assert.equal(agents.list({ json: true }), 0);
    assert.equal(JSON.parse(lines[0] ?? "[]")[0].name, "a");
  });
});
