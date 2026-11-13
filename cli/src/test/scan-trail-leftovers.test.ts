import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import type { Fixture } from "./helpers/fixture.js";
import { createFixture } from "./helpers/fixture.js";

// End to end on a temp workspace: one repo with a project copy of trail's hook and a retired mcp__trail permission, and a
// heimstream-shaped repo (trail's repo-level hook) that must stay untouched. The home is the fixture's, never the real one.
let fx: Fixture;
let ws: string;
beforeEach(() => {
  fx = createFixture();
  ws = join(fx.home, "ws");
});
afterEach(() => fx.cleanup());

const put = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const read = (file: string) => readFileSync(file, "utf8");
const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;
const hook = (command: string) => ({
  hooks: {
    PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command }] }],
  },
});

describe("scan --fix on trail leftovers", () => {
  test("previews and applies the hook and permission fixes with a backup; undo restores the bytes; the repo-level trail hook stays", () => {
    put(
      join(fx.configDir, "settings.json"),
      json(
        hook(
          `node "${fx.configDir}/helpers/graft-hooks.cjs" post-edit || exit 0`
        )
      )
    );
    const dirty = join(ws, "dirty");
    const projectFile = join(dirty, ".claude", "settings.json");
    const localFile = join(dirty, ".claude", "settings.local.json");
    put(
      projectFile,
      json(
        hook(
          'node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/graft-hooks.cjs" post-edit'
        )
      )
    );
    put(
      localFile,
      json({
        permissions: {
          allow: ["Bash(trail:*)", "mcp__trail__trail_find_code"],
        },
      })
    );
    const heim = join(ws, "heim", ".claude", "settings.json");
    put(
      heim,
      json(
        hook(
          'node "${CLAUDE_PROJECT_DIR:-.}/.trail/hook.cjs" session-start || exit 0'
        )
      )
    );
    for (const name of ["dirty", "heim"]) {
      execFileSync("git", ["init", "-q"], { cwd: join(ws, name) });
    }
    const before = [projectFile, localFile, heim].map(read);

    const preview = fx.run(["scan", ws, "--fix", "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /dup-hook-scope/);
    assert.match(preview.stdout, /stale-mcp-permission/);
    assert.match(preview.stdout, /nothing written/);
    assert.deepEqual([projectFile, localFile, heim].map(read), before);

    const applied = fx.run(["scan", ws, "--fix", "--yes"]);
    assert.equal(applied.status, 0, applied.stderr);
    assert.doesNotMatch(read(projectFile), /graft-hooks/);
    assert.doesNotMatch(read(localFile), /mcp__trail/);
    assert.match(read(localFile), /Bash\(trail:\*\)/);
    assert.equal(
      read(heim),
      before[2],
      "the repo-level trail hook is untouched"
    );

    const undone = fx.run(["fix", "--undo", "--yes"]);
    assert.equal(undone.status, 0, undone.stderr + undone.stdout);
    assert.deepEqual([projectFile, localFile, heim].map(read), before);
  });
});
