import assert from "node:assert/strict";
import { test } from "vitest";
import { projectDirs } from "../inventory/common.js";

const paths = (root: string) => ({
  configDir: "/home/u/.claude",
  projectRoot: () => root,
});

test("a project folder is read for project settings", () => {
  assert.deepEqual(projectDirs(paths("/home/u/ws/repo"), "/home/u/ws/repo"), [
    "/home/u/ws/repo",
  ]);
});

test("the home folder has no project settings: its .claude is the user's own config", () => {
  assert.deepEqual(projectDirs(paths("/home/u"), "/home/u"), []);
});
