import { describe, expect, test } from "vitest";
import { locales, messages } from "../messages.js";

// Every leaf of every locale is a non-empty string, or a function that returns one when given sample values.
const leaves = (value: unknown, path: string): [string, unknown][] =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([key, child]) =>
        leaves(child, `${path}.${key}`)
      )
    : [[path, value]];

describe("messages", () => {
  test("defaults to English", () => {
    expect(messages()).toBe(locales.en);
  });
  test("every leaf is a non-empty string or a function returning one", () => {
    for (const [locale, catalog] of Object.entries(locales)) {
      for (const [path, leaf] of leaves(catalog, locale)) {
        const text =
          typeof leaf === "function"
            ? (leaf as (...args: unknown[]) => unknown)("x", 2, "y")
            : leaf;
        expect(typeof text, path).toBe("string");
        expect((text as string).length, path).toBeGreaterThan(0);
      }
    }
  });
  test("terms hold the glossary", () => {
    expect(Object.keys(messages().terms)).toEqual([
      "library",
      "bundle",
      "thisProject",
      "allProjects",
      "loaded",
      "notLoaded",
      "added",
      "notAdded",
    ]);
  });
});
