// @vitest-environment node
// Every method on core's createData() is reachable from the web: it is a contract procedure, or it is listed here with the
// reason the web does not need it. Adding a method to core fails this test until one of the two is done.

import { createData } from "@agentry/core/data";
import { createPaths } from "@agentry/core/paths";
import { expect, test } from "vitest";
import { contract } from "../contract/index.js";

// Not procedures on purpose.
const LEFT_OUT: Record<string, string> = {};

// `load` sits at the top of the contract; every other procedure is nested under its section.
const procedures = () => {
  const names = new Set<string>();
  for (const [key, value] of Object.entries(contract)) {
    if ("~orpc" in value) {
      names.add(key);
    } else {
      for (const name of Object.keys(value)) {
        names.add(name);
      }
    }
  }
  return names;
};

test("every createData method is a contract procedure or left out on purpose", () => {
  const data = createData({ makePaths: (dir) => createPaths({ cwd: dir }) });
  const have = procedures();
  const missing = Object.keys(data).filter(
    (name) => !(have.has(name) || name in LEFT_OUT)
  );
  expect(missing).toEqual([]);
});

test("every contract procedure exists on createData (no stale names)", () => {
  const data = createData({ makePaths: (dir) => createPaths({ cwd: dir }) });
  const unknown = [...procedures()].filter(
    (name) => !(name in data) && name !== "info"
  );
  expect(unknown).toEqual([]);
});

test("every LEFT_OUT entry names a real method and says why", () => {
  const data = createData({ makePaths: (dir) => createPaths({ cwd: dir }) });
  for (const [name, why] of Object.entries(LEFT_OUT)) {
    expect(name in data).toBe(true);
    expect(why.length).toBeGreaterThan(10);
  }
});
