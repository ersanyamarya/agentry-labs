// `load`: everything the screens show for one project folder, from core's createData().load.
// The output schemas are also an allow-list: zod objects drop any field not named here, so a field core adds later never
// reaches the browser until it is listed (and checked for secrets) here. MCP env, headers, args and urls and hook commands
// arrive masked by core's mask.ts; the router masks env and headers once more before they leave.
// A part that failed to read carries `loadError` and whatever core's fallback had, so fields a fallback lacks are optional.
// List parts are always { items, loadError? } (core's fallback for a failed list is a bare object, not an array).

import { z } from "zod";
import { base, dirInput } from "./shared.js";

const loadError = z.string().optional();
const readError = z.object({ message: z.string(), source: z.string() });
const pluginState = z.enum(["active", "disabled", "not-here", "not-installed"]);

export const skillItemSchema = z.object({
  kind: z.enum(["file", "symlink", "broken"]),
  name: z.string(),
  plugin: z.string().optional(),
  scope: z.enum(["user", "project", "plugin"]),
  shelfGroup: z.string().optional(),
  source: z.string(),
  state: z.union([z.enum(["active", "broken"]), pluginState]),
  target: z.string().optional(),
  tokens: z.number().nullable(),
});

const mcpScope = z.enum([
  "local",
  "project",
  "user",
  "plugin",
  "desktop-config",
  "desktop-extension",
]);
export const mcpServerSchema = z.object({
  args: z.array(z.string()).optional(),
  command: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  loadsIn: z.array(z.string()),
  name: z.string(),
  plugin: z.string().optional(),
  scope: mcpScope,
  shadowedBy: z
    .object({ name: z.string(), scope: mcpScope, source: z.string() })
    .optional(),
  source: z.string(),
  state: z.enum([
    "active",
    "pending-approval",
    "rejected",
    "shadowed",
    "disabled",
  ]),
  transport: z.string(),
  url: z.string().optional(),
});

export const hookItemSchema = z.object({
  command: z.string().optional(),
  event: z.string(),
  id: z.string(),
  matcher: z.string(),
  plugin: z.string().optional(),
  scope: z.enum(["user", "project", "local", "plugin"]),
  source: z.string(),
  state: z.union([z.enum(["active", "disabled", "untrusted"]), pluginState]),
  type: z.string(),
});

export const pluginItemSchema = z.object({
  enabledBy: z.object({
    scope: z.string(),
    source: z.string(),
    value: z.boolean(),
  }),
  id: z.string(),
  installPath: z.string().optional(),
  installScope: z.string().optional(),
  installs: z.array(
    z.object({
      appliesHere: z.boolean(),
      installPath: z.string().optional(),
      projectPath: z.string().optional(),
      scope: z.string(),
      version: z.string(),
    })
  ),
  manifestFile: z.string().optional(),
  marketplace: z.string(),
  name: z.string(),
  skillTokens: z.number(),
  state: pluginState,
  version: z.string().optional(),
});

const statusSchema = z.object({
  copilot: z.unknown().nullable().optional(),
  errors: z.array(readError),
  hooks: z.object({
    items: z.array(hookItemSchema),
    disableAllHooks: z.boolean().optional(),
  }),
  mcp: z.object({ servers: z.array(mcpServerSchema) }),
  plugins: z.object({
    items: z.array(pluginItemSchema),
    marketplaces: z.array(
      z.object({
        installLocation: z.string().optional(),
        name: z.string(),
        source: z.string(),
        sourceType: z.string(),
      })
    ),
  }),
  project: z.object({
    cwd: z.string(),
    root: z.string(),
    repoKey: z.string().optional(),
    trusted: z.boolean().optional(),
  }),
  skills: z.object({
    items: z.array(skillItemSchema),
    skipped: z.array(
      z.object({ count: z.number(), path: z.string(), reason: z.string() })
    ),
  }),
  tokens: z.object({
    measured: z.number(),
    unit: z.string().optional(),
    notMeasured: z.array(z.string()).optional(),
  }),
  loadError,
});

export const findingOutSchema = z.object({
  file: z.string(),
  fix: z.string().optional(),
  id: z.string(),
  line: z.number().optional(),
  message: z.string(),
  severity: z.enum(["error", "warning", "info"]),
});

const doctorSchema = z.object({
  errors: z.array(readError),
  findings: z.array(findingOutSchema),
  project: z.object({ cwd: z.string(), root: z.string() }).optional(),
  summary: z.object({
    error: z.number(),
    warning: z.number(),
    info: z.number(),
  }),
  loadError,
});

export const backupEntrySchema = z.object({
  bytes: z.number(),
  date: z.string(),
  days: z.number(),
  detail: z.string(),
  from: z.string().optional(),
  id: z.string(),
  kind: z.enum(["fix", "removed", "updated"]),
  name: z.string(),
  path: z.string(),
  undone: z.boolean().optional(),
  what: z.string().optional(),
});

export const parkedHookSchema = z.object({
  command: z.string().optional(),
  event: z.string(),
  id: z.string(),
  matcher: z.string(),
  parkedAt: z.string(),
  scope: z.string(),
  source: z.string(),
  state: z.string(),
  type: z.string(),
});

// A parked user-scope MCP server: its name and core's masked one-line summary, never the stored config.
export const parkedMcpSchema = z.object({
  name: z.string(),
  parkedAt: z.string().optional(),
  summary: z.string(),
});

export const ruleEntrySchema = z.object({
  bytes: z.number(),
  id: z.string(),
  kind: z.enum(["claude-md", "rule"]),
  label: z.string(),
  path: z.string(),
  scope: z.enum(["user", "project"]),
  title: z.string(),
  tokens: z.number(),
});

export const agentEntrySchema = z.object({
  bytes: z.number(),
  description: z.string(),
  id: z.string(),
  label: z.string(),
  model: z.string().optional(),
  name: z.string(),
  path: z.string(),
  scope: z.enum(["user", "project"]),
  tokens: z.number(),
  tools: z.string().optional(),
});

export const shelfGroupSchema = z.object({
  name: z.string(),
  tokens: z.number(),
  state: z.string(),
  items: z.array(
    z.object({
      kind: z.enum(["skills", "agents"]),
      name: z.string(),
      source: z.string(),
      tokens: z.number(),
      project: z.boolean(),
      global: z.boolean(),
    })
  ),
});

export const catalogEntrySchema = z.object({
  bundle: z.string(),
  description: z.string(),
  global: z.boolean().optional(),
  id: z.string(),
  installed: z.string().optional(),
  installs: z.array(
    z.object({
      label: z.string(),
      outdated: z.boolean(),
      path: z.string().optional(),
      scope: z.string(),
    })
  ),
  kind: z.enum(["skill", "agent", "rule", "claude-md", "mcp"]),
  name: z.string(),
  outdated: z.boolean(),
  shelf: z.string().nullable().optional(),
  tokens: z.number().nullable(),
});

const listOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), loadError });

export const loadSchema = z.object({
  dir: z.string(),
  // The folders screens name in their text (where backups go, the shelf); core's path helpers stay on the server.
  paths: z.object({
    home: z.string(),
    configDir: z.string(),
    shelfDir: z.string(),
    backupsDir: z.string(),
  }),
  status: statusSchema,
  doctor: doctorSchema,
  backups: listOf(backupEntrySchema),
  parkedHooks: listOf(parkedHookSchema),
  parked: listOf(parkedMcpSchema),
  rules: listOf(ruleEntrySchema),
  agents: listOf(agentEntrySchema),
  groups: listOf(shelfGroupSchema),
  catalog: z.object({
    fetched: z.boolean(),
    entries: z.array(catalogEntrySchema),
    loadError,
  }),
});

export type LoadData = z.infer<typeof loadSchema>;

// GET, so the server-side render can read without tripping the server's rule on cross-origin mutating requests; every
// other procedure is POST.
export const load = base
  .route({ method: "GET" })
  .input(dirInput)
  .output(loadSchema);
