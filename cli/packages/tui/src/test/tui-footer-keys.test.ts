import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { footerKeys } from "../components/footer.js";
import {
  BACKUPS_KEYS,
  backupKeys,
  catalogKeys,
  DOCTOR_KEYS,
  pluginKeys,
  ruleKeys,
  skillKeys,
} from "../rows.js";
import type { KeyHint, Row } from "../types.js";

const asRow = (fields: Record<string, unknown>) =>
  ({ label: "x", ...fields }) as unknown as Row;

const hintOf = (keys: KeyHint[], key: string) =>
  keys.find(([one]) => one === key);

const sets: [string, KeyHint[]][] = [
  ["doctor", DOCTOR_KEYS],
  ["backups", backupKeys(asRow({ backup: "b", restorable: true }))],
  [
    "catalog",
    catalogKeys(
      asRow({
        kind: "catalog",
        itemKind: "agent",
        installed: true,
        outdated: true,
      })
    ),
  ],
  ["plugins", pluginKeys(asRow({ pluginScopes: ["user"] }))],
  ["rules", ruleKeys(asRow({ ruleFile: "/r.md" }))],
  ["skills", skillKeys(asRow({ kind: "skill" }))],
];

describe("footer key hints", () => {
  test("u is named per tab and every short form keeps the verb", () => {
    assert.equal(hintOf(DOCTOR_KEYS, "u")?.[1], "undo last fix");
    assert.equal(hintOf(sets[1][1], "u")?.[1], "restore");
    assert.equal(hintOf(sets[2][1], "u")?.[1], "update");
    for (const [name, keys] of sets) {
      for (const [key, text, short] of keys) {
        if (short && key !== "e" && key !== "space" && key !== "g") {
          assert.equal(
            short.split(" ")[0],
            text.split(" ")[0],
            `${name}: ${key} short form "${short}" must keep the verb of "${text}"`
          );
        }
      }
    }
  });

  test("x and X name what they do and have no short form", () => {
    for (const [, keys] of sets) {
      const remove = hintOf(keys, "x");
      const del = hintOf(keys, "X");
      if (remove && remove[1] !== "uninstall") {
        assert.equal(remove[1], "remove (copy kept)");
        assert.equal(remove[2], undefined);
      }
      if (del) {
        assert.equal(del[1], "delete (no copy)");
        assert.equal(del[2], undefined);
      }
    }
  });

  test("a footer that is too narrow drops whole keys, never the words of x and X", () => {
    const keys = skillKeys(asRow({ kind: "skill" }));
    for (const cols of [40, 60, 80, 100]) {
      const { left } = footerKeys(keys, cols);
      for (const [key, text] of left) {
        if (key === "x") {
          assert.equal(text, "remove (copy kept)");
        }
        if (key === "X") {
          assert.equal(text, "delete (no copy)");
        }
      }
    }
  });

  test("Backups deletes with X and prunes with d; Catalog and Plugins add with a", () => {
    assert.ok(hintOf(sets[1][1], "X"));
    assert.equal(hintOf(sets[1][1], "x"), undefined);
    assert.equal(hintOf(BACKUPS_KEYS, "d")?.[2], "delete old");
    assert.ok(hintOf(sets[2][1], "a"));
    assert.equal(hintOf(sets[2][1], "i"), undefined);
    assert.equal(hintOf(sets[2][1], "o"), undefined);
    assert.ok(hintOf(sets[3][1], "a"));
    assert.equal(hintOf(sets[3][1], "i"), undefined);
  });
});
