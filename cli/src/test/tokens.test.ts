import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  descriptionTokens,
  estimateTokens,
  readDescription,
} from "../lib/tokens.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agentry-tokens-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const write = (text: string) => {
  const file = join(dir, "SKILL.md");
  writeFileSync(file, text);
  return file;
};

describe("estimateTokens", () => {
  test("is characters divided by four, rounded up", () => {
    assert.equal(estimateTokens(""), 0);
    assert.equal(estimateTokens("abcd"), 1);
    assert.equal(estimateTokens("abcde"), 2);
  });
});

describe("readDescription", () => {
  test("reads a plain value", () => {
    assert.equal(
      readDescription(
        write("---\nname: trim\ndescription: Cut a video\n---\nbody\n")
      ),
      "Cut a video"
    );
  });

  test("strips quotes", () => {
    assert.equal(
      readDescription(write('---\ndescription: "Use when: cutting"\n---\n')),
      "Use when: cutting"
    );
  });

  test("joins a folded (>) or literal (|) block", () => {
    assert.equal(
      readDescription(
        write(
          "---\nname: x\ndescription: >\n  Cut a video\n  and audio.\nversion: 1\n---\n"
        )
      ),
      "Cut a video and audio."
    );
    assert.equal(
      readDescription(write("---\ndescription: |-\n  one\n  two\n---\n")),
      "one two"
    );
  });

  test("returns empty when the file, the frontmatter or the field is missing", () => {
    assert.equal(readDescription(join(dir, "nope.md")), "");
    assert.equal(
      readDescription(write("# no frontmatter\ndescription: not here\n")),
      ""
    );
    assert.equal(readDescription(write("---\nname: trim\n---\n")), "");
  });
});

describe("descriptionTokens", () => {
  test("estimates the tokens of the description", () => {
    assert.equal(
      descriptionTokens(write(`---\ndescription: ${"x".repeat(40)}\n---\n`)),
      10
    );
  });
});
