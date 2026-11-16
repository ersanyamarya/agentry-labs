import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { addToArray, parseJsonc, removeFromArray } from "../jsonc-edit.js";

const JSONC =
  '// User settings belong in settings.json.\n// This file is managed automatically.\n{\n  "firstLaunchAt": "2026-01-01", // keep\n  "host": "https://github.com",\n  "loggedInUsers": [{ "login": "x" }]\n}\n';
const withTrusted = JSONC.replace(
  '"host"',
  '"trustedFolders": ["/already"],\n  "host"'
);

describe("parseJsonc", () => {
  test("accepts a comment header and trailing commas", () => {
    assert.deepEqual(parseJsonc('// c\n{"a": [1, 2,], /* x */ "b": "//",}\n'), {
      a: [1, 2],
      b: "//",
    });
  });

  test("rejects invalid text", () => {
    assert.throws(() => parseJsonc("{ not json"));
  });
});

describe("addToArray", () => {
  test("adds a missing key and keeps every byte outside it", () => {
    const { text, added } = addToArray(JSONC, "trustedFolders", ["/a b"]);
    assert.deepEqual(added, ["/a b"]);
    assert.ok(text.startsWith(JSONC.slice(0, JSONC.indexOf('"host"'))));
    assert.match(text, /\/\/ keep/);
    assert.match(text, /"loggedInUsers": \[\{ "login": "x" \}\]/);
    assert.deepEqual(
      (parseJsonc(text) as Record<string, unknown>).trustedFolders,
      ["/a b"]
    );
  });

  test("tolerates a trailing comma", () => {
    const src = '{\n  "trustedFolders": [\n    "/a",\n  ],\n}\n';
    const { text } = addToArray(src, "trustedFolders", ["/b"]);
    assert.deepEqual(
      (parseJsonc(text) as Record<string, unknown>).trustedFolders,
      ["/a", "/b"]
    );
  });

  test("does not duplicate an entry already listed", () => {
    const { text, added } = addToArray(withTrusted, "trustedFolders", [
      "/already",
      "/new one",
    ]);
    assert.deepEqual(added, ["/new one"]);
    assert.equal(text.split('"/already"').length - 1, 1);
    assert.equal(addToArray(text, "trustedFolders", ["/already"]).text, text);
  });

  test("refuses text that is not a JSON object", () => {
    assert.throws(() => addToArray("{ not json", "trustedFolders", ["/a"]));
  });
});

describe("removeFromArray", () => {
  test("removes only the named entries and restores the file", () => {
    const { text: added } = addToArray(withTrusted, "trustedFolders", ["/one"]);
    const { text, removed } = removeFromArray(added, "trustedFolders", [
      "/one",
    ]);
    assert.deepEqual(removed, ["/one"]);
    assert.equal(text, withTrusted);
  });

  test("leaves the file alone when nothing matches", () => {
    const r = removeFromArray(withTrusted, "trustedFolders", ["/nope"]);
    assert.equal(r.text, withTrusted);
    assert.deepEqual(r.removed, []);
  });
});
