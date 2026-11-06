import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createJsonEdit } from "../lib/json-edit.js";

const tabs =
  '{\n\t"a": 1,\n\t"mcpServers": {\n\t\t"one": { "command": "x" },\n\t\t"two": {\n\t\t\t"command": "y"\n\t\t},\n\t\t"three": "z"\n\t},\n\t"tail": [\n\t\t"p",\n\t\t"q",\n\t\t"r"\n\t]\n}\n';

describe("delete", () => {
  test("middle key: neighbours stay byte-identical, tabs and trailing newline kept", () => {
    const doc = createJsonEdit(tabs);
    doc.deleteKey(["mcpServers", "two"]);
    assert.equal(
      doc.text,
      '{\n\t"a": 1,\n\t"mcpServers": {\n\t\t"one": { "command": "x" },\n\t\t"three": "z"\n\t},\n\t"tail": [\n\t\t"p",\n\t\t"q",\n\t\t"r"\n\t]\n}\n'
    );
    assert.deepEqual(JSON.parse(doc.text).mcpServers, {
      one: { command: "x" },
      three: "z",
    });
  });

  test("first and last keys", () => {
    const first = createJsonEdit(tabs);
    first.deleteKey(["a"]);
    assert.equal(first.text, tabs.replace('\t"a": 1,\n', ""));
    const last = createJsonEdit(tabs);
    last.deleteKey(["mcpServers", "three"]);
    assert.equal(last.text, tabs.replace(',\n\t\t"three": "z"', ""));
  });

  test("only key leaves an empty object; the rest is untouched", () => {
    const doc = createJsonEdit(
      '{\n  "mcpServers": {\n    "x": {}\n  },\n  "k": 1\n}\n'
    );
    doc.deleteKey(["mcpServers", "x"]);
    assert.equal(doc.text, '{\n  "mcpServers": {},\n  "k": 1\n}\n');
  });

  test("array elements", () => {
    const doc = createJsonEdit(tabs);
    doc.deleteElement(["tail", 1]);
    assert.equal(doc.text, tabs.replace('\t\t"q",\n', ""));
    doc.deleteElement(["tail", 1]);
    assert.equal(
      doc.text,
      tabs.replace('\t\t"p",\n\t\t"q",\n\t\t"r"\n', '\t\t"p"\n')
    );
    doc.deleteElement(["tail", 0]);
    assert.equal(JSON.parse(doc.text).tail.length, 0);
  });

  test("two spaces, CRLF and no trailing newline survive", () => {
    const text = '{\r\n  "a": 1,\r\n  "b": 2\r\n}';
    const doc = createJsonEdit(text);
    doc.deleteKey(["a"]);
    assert.equal(doc.text, '{\r\n  "b": 2\r\n}');
  });

  test("minified files stay minified", () => {
    const doc = createJsonEdit('{"a":1,"b":{"c":2,"d":3},"e":4}');
    doc.deleteKey(["b", "c"]);
    assert.equal(doc.text, '{"a":1,"b":{"d":3},"e":4}');
  });

  test("missing path and wrong kind throw typed errors", () => {
    const doc = createJsonEdit(tabs);
    assert.throws(() => doc.deleteKey(["nope"]), { code: "EJSONPATH" });
    assert.throws(() => doc.deleteKey(["tail", 0]), { code: "EJSONPATH" });
    assert.throws(() => doc.deleteElement(["a"]), { code: "EJSONPATH" });
    assert.throws(() => doc.deleteKey([]), { code: "EJSONROOT" });
  });
});

describe("set and rename", () => {
  test("set replaces only the value", () => {
    const doc = createJsonEdit(tabs);
    doc.set(["mcpServers", "three"], "changed");
    assert.equal(doc.text, tabs.replace('"three": "z"', '"three": "changed"'));
  });

  test("set adds a missing key with the file's indentation, and into an empty object", () => {
    const doc = createJsonEdit(tabs);
    doc.set(["mcpServers", "four"], { command: "w" });
    assert.equal(JSON.parse(doc.text).mcpServers.four.command, "w");
    assert.match(
      doc.text,
      /\t\t"three": "z",\n\t\t"four": \{\n\t\t\t"command": "w"\n\t\t\}\n\t\},/
    );
    const empty = createJsonEdit('{\n\t"a": {}\n}\n');
    empty.set(["a", "k"], 1);
    assert.equal(empty.text, '{\n\t"a": {\n\t\t"k": 1\n\t}\n}\n');
  });

  test("renameInStrings changes string values only, keys and other bytes untouched", () => {
    const text =
      '{\n\t"graft": "graft ask",\n\t"n": 12,\n\t"list": ["graft", "other", "\\u00e9 graft"],\n\t"esc": "a\\/b"\n}\n';
    const doc = createJsonEdit(text);
    const count = doc.renameInStrings((value) =>
      value.replace(/graft/g, "trail")
    );
    assert.equal(count, 3);
    assert.equal(
      doc.text,
      '{\n\t"graft": "trail ask",\n\t"n": 12,\n\t"list": ["trail", "other", "é trail"],\n\t"esc": "a\\/b"\n}\n'
    );
  });

  test("renameInStrings passes the path and leaves text alone when nothing changes", () => {
    const doc = createJsonEdit(tabs);
    const seen: string[] = [];
    assert.equal(
      doc.renameInStrings((value, path) => {
        seen.push(path.join("."));
      }),
      0
    );
    assert.equal(doc.text, tabs);
    assert.ok(
      seen.includes("mcpServers.one.command") && seen.includes("tail.2")
    );
  });
});

describe("refusal", () => {
  const bad = [
    '{"a": 1,}',
    '{"a": 1} x',
    "// c\n{}",
    '{"a": 1, // c\n"b": 2}',
    "{'a': 1}",
    "",
    "﻿{}",
    '{"a": "tab\there"}',
    '{"a": 01}',
    '{"a"}',
  ];
  for (const text of bad) {
    test(`rejects ${JSON.stringify(text).slice(0, 30)} without quoting it`, () => {
      assert.throws(
        () => createJsonEdit(text),
        (error: Error & { code?: string }) =>
          error.code === "EJSONPARSE" && error.message === "not valid JSON"
      );
    });
  }

  test("duplicate keys on a path are refused", () => {
    const doc = createJsonEdit('{"a": 1, "a": 2}');
    assert.throws(() => doc.deleteKey(["a"]), { code: "EJSONDUP" });
  });

  test("get reads a value or undefined", () => {
    const doc = createJsonEdit(tabs);
    assert.deepEqual(doc.get(["mcpServers", "one"]), { command: "x" });
    assert.equal(doc.get(["nope", "x"]), undefined);
  });
});
