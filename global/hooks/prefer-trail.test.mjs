import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decide } from "./prefer-trail.mjs";

const hook = fileURLToPath(new URL("./prefer-trail.mjs", import.meta.url));
const home = mkdtempSync(join(tmpdir(), "pt-home-"));
mkdirSync(join(home, ".claude"));
const repo = mkdtempSync(join(tmpdir(), "pt-repo-"));
mkdirSync(join(repo, "graft"));
mkdirSync(join(repo, "src"));
writeFileSync(join(repo, "src/a.ts"), "export const a = 1;\n");
writeFileSync(join(repo, "README.md"), "# hi\n");
const plain = mkdtempSync(join(tmpdir(), "pt-plain-"));

const env = { CLAUDE_PROJECT_DIR: "" };
const run = (cwd, tool_name, tool_input, session_id = `s-${Math.random()}`) => decide({ cwd, tool_name, tool_input, session_id }, { home, env });
const bash = (command, cwd = repo) => run(cwd, "Bash", { command });
const denied = (result) => result?.hookSpecificOutput?.permissionDecision === "deny";

test("denies search and cat commands on source in an indexed repo", () => {
	assert.ok(denied(bash("grep -rn foo src")));
	assert.ok(denied(bash("rg foo")));
	assert.ok(denied(bash("find . -name '*.ts'")));
	assert.ok(denied(bash("cat src/a.ts")));
	assert.ok(denied(bash("npm test && grep foo src/a.ts")));
});

test("the deny reason names a trail tool and the override", () => {
	const reason = bash("grep foo src").hookSpecificOutput.permissionDecisionReason;
	assert.match(reason, /trail_find_all/);
	assert.match(reason, /# no-trail:/);
});

test("allows filters, non-code files, other directories and non-search commands", () => {
	assert.equal(bash("git log --oneline | grep fix"), null);
	assert.equal(bash("cat README.md"), null);
	assert.equal(bash("grep foo /etc/hosts"), null);
	assert.equal(bash("cat <<'EOF' > src/b.ts\nx\nEOF"), null);
	assert.equal(bash("git status && npm test"), null);
	assert.equal(bash("grep -r foo src", plain), null);
});

test("a trailing no-trail marker lets the command run and logs the reason", () => {
	assert.equal(bash("grep -n 'exact text' src/a.ts # no-trail: exact literal"), null);
	assert.match(readFileSync(join(home, ".claude", "trail-bypass.log"), "utf8"), /exact literal/);
});

test("does nothing in a repo without graft/ or .trail/", () => {
	assert.equal(bash("grep -rn foo .", plain), null);
	assert.equal(run(plain, "Grep", { pattern: "x" }), null);
});

test("denies Grep and Glob inside the repo", () => {
	assert.ok(denied(run(repo, "Grep", { pattern: "x" })));
	assert.ok(denied(run(repo, "Glob", { pattern: "**/*.ts" })));
	assert.equal(run(repo, "Grep", { pattern: "x", path: plain }), null);
});

test("a whole-file Read of source is denied once per session, then allowed", () => {
	const file = join(repo, "src/a.ts");
	assert.ok(denied(run(repo, "Read", { file_path: file }, "same")));
	assert.equal(run(repo, "Read", { file_path: file }, "same"), null);
	assert.equal(run(repo, "Read", { file_path: file, limit: 20 }, "other"), null);
	assert.equal(run(repo, "Read", { file_path: join(repo, "README.md") }, "other"), null);
});

test("PREFER_TRAIL=off disables it", () => {
	assert.equal(decide({ cwd: repo, tool_name: "Bash", tool_input: { command: "grep foo src" } }, { home, env: { PREFER_TRAIL: "off" } }), null);
});

test("as a script: prints a deny for a bad call, nothing for an allowed one, and never fails on junk", () => {
	const call = (stdin) => spawnSync("node", [hook], { input: stdin, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: "" } });
	const bad = call(JSON.stringify({ cwd: repo, tool_name: "Bash", tool_input: { command: "grep -rn foo src" }, session_id: "x" }));
	assert.equal(bad.status, 0);
	assert.equal(JSON.parse(bad.stdout).hookSpecificOutput.permissionDecision, "deny");
	assert.equal(call(JSON.stringify({ cwd: repo, tool_name: "Bash", tool_input: { command: "ls" } })).stdout, "");
	const junk = call("not json");
	assert.equal(junk.status, 0);
	assert.equal(junk.stdout, "");
});
