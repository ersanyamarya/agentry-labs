import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createDiscover } from "../lib/discover.mjs";

let root;
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-discover-")));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const repo = (...parts) => mkdirSync(join(root, ...parts, ".git"), { recursive: true });
const worktree = (...parts) => {
	mkdirSync(join(root, ...parts), { recursive: true });
	writeFileSync(join(root, ...parts, ".git"), "gitdir: /elsewhere\n");
};
const find = (options, roots = [root]) => createDiscover().find(roots, options).map((item) => `${item.path.slice(root.length)}:${item.kind}`);

describe("discover", () => {
	test("finds repos (.git folder) and worktrees (.git file), sorted", () => {
		repo("b");
		worktree("a");
		assert.deepEqual(find(), ["/a:worktree", "/b:repo"]);
	});

	test("skips dependency, build, map and hidden folders", () => {
		for (const dir of ["node_modules/x", "dist/x", "build/x", ".next/x", "target/x", ".dart_tool/x", "graft/x", ".hidden/x"]) {
			repo(...dir.split("/"));
		}
		repo("real");
		assert.deepEqual(find(), ["/real:repo"]);
	});

	test("descends into a found repo only to report nested repos and worktrees, and into .claude/worktrees", () => {
		repo("app");
		repo("app", "packages", "inner");
		worktree("app", ".claude", "worktrees", "wt");
		mkdirSync(join(root, "app", "plain", "folder"), { recursive: true });
		assert.deepEqual(find(), ["/app:repo", "/app/.claude/worktrees/wt:worktree", "/app/packages/inner:repo"]);
	});

	test("--depth limits how deep it looks; 0 checks only the root", () => {
		repo("one");
		repo("one", "two", "three");
		assert.deepEqual(find({ depth: 1 }), ["/one:repo"]);
		assert.deepEqual(find({ depth: 3 }), ["/one:repo", "/one/two/three:repo"]);
		assert.deepEqual(find({ depth: 0 }), []);
		repo();
		assert.deepEqual(find({ depth: 0 }), [":repo"]);
	});

	test("several roots are merged without duplicates; a missing root is ignored", () => {
		repo("a");
		assert.deepEqual(find({}, [root, join(root, "a"), join(root, "missing")]), ["/a:repo"]);
	});
});
