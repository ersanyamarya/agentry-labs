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
      "on",
      "off",
      "shared",
      "notShared",
    ]);
  });
  test("copilot: share states use the glossary and sharing says all projects", () => {
    const { copilot, terms } = messages();
    expect(copilot.states.shared).toBe("Shared");
    expect(copilot.states.notShared).toBe("Not shared");
    expect(terms.shared).toBe("shared");
    expect(terms.notShared).toBe("not shared");
    expect(copilot.forAllProjects).toContain(terms.allProjects);
    expect(
      copilot.describeShare("skill", "demo", "~/.copilot/skills/demo")
    ).toBe(
      "share the skill demo with Copilot for all projects: ~/.copilot/skills/demo"
    );
    expect(copilot.setupOwned("x")).toContain(
      "setup.sh uninstall --only copilot"
    );
  });
  test("copilot: UI words come from the glossary", () => {
    const { copilot, terms } = messages();
    expect(copilot.column).toBe("Copilot");
    expect(copilot.repoLabel).toBe("Copilot in this repo");
    expect(copilot.repoState).toEqual({ on: "On", off: "Off" });
    expect(copilot.forAllProjects).toBe(
      `Shared with Copilot for ${terms.allProjects}`
    );
    expect(Object.keys(copilot.whyNot)).toEqual([
      "projectOnly",
      "plugin",
      "libraryOnly",
      "setup",
      "other",
      "repoWins",
    ]);
    expect(copilot.preview.share("skill", "demo")).toContain(terms.allProjects);
    expect(copilot.preview.unshare("skill", "demo")).toContain("demo");
    expect(copilot.trust.explain).toContain("hooks and MCP servers");
  });
  test("copilot: command words name the kinds, the flag and the counts", () => {
    const { cli } = messages().copilot;
    expect(cli.ambiguous("x", "skill, agent")).toContain("--kind");
    expect(cli.ambiguous("x", "skill, agent")).toContain("skill, agent");
    expect(cli.noItem("x")).toContain("x");
    expect(cli.jsonNeedsYes).toContain("--yes");
    expect(cli.sharedLine({ skills: 1, agents: 0, rules: 2, mcp: 1 })).toBe(
      "Shared with Copilot: 1 skill, 0 agents, 2 rules, 1 MCP server"
    );
  });
});
