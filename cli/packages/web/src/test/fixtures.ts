// A `load` result shaped like the real one, small enough to read. Tests change what they need and cast the rest.
import type { LoadData } from "../contract/index.js";

const list = <T>(items: T[]) => ({ items });

export const loadFixture = (): LoadData =>
  ({
    dir: "/work/app",
    paths: {
      home: "/home/me",
      configDir: "/home/me/.claude",
      shelfDir: "/home/me/.claude/skill-shelf",
      backupsDir: "/home/me/.claude/backups/agentry",
    },
    status: {
      skills: {
        items: [
          {
            kind: "file",
            name: "run-fallow",
            scope: "user",
            source: "/home/me/.claude/skills/run-fallow",
            state: "active",
            tokens: 158,
          },
          {
            kind: "file",
            name: "proj-only",
            scope: "project",
            source: "/work/app/.claude/skills/proj-only",
            state: "active",
            tokens: 40,
          },
          {
            kind: "symlink",
            name: "audit-one",
            scope: "user",
            shelfGroup: "audit",
            source: "/home/me/.claude/skills/audit-one",
            state: "active",
            tokens: 10,
          },
        ],
        skipped: [],
      },
      mcp: { servers: [] },
      hooks: { items: [] },
      plugins: { items: [], marketplaces: [] },
      project: { cwd: "/work/app", root: "/work/app" },
      tokens: { measured: 208 },
      errors: [],
    },
    doctor: {
      findings: [{}, {}, {}],
      summary: { error: 2, warning: 1, info: 0 },
      errors: [],
    },
    backups: list([]),
    parkedHooks: list([]),
    parked: list([]),
    rules: list([{}, {}, {}, {}]),
    groups: list([
      {
        name: "audit",
        tokens: 10,
        state: "off",
        items: [
          {
            kind: "skills",
            name: "audit-one",
            source: "/home/me/.claude/skill-shelf/audit/audit-one",
            tokens: 10,
            project: false,
            global: true,
          },
          {
            kind: "skills",
            name: "audit-two",
            source: "/home/me/.claude/skill-shelf/audit/audit-two",
            tokens: 20,
            project: false,
            global: false,
          },
        ],
      },
    ]),
    catalog: { fetched: false, entries: [] },
  }) as unknown as LoadData;
