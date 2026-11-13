// The server side of the contract: each procedure calls the same createData() method the TUI calls, so every write goes
// through core's backup-first functions. The data facade is a parameter, so tests pass one built on a temp HOME.

import { statSync } from "node:fs";
import { createData } from "@agentry/core/data";
import { maskHeader, maskMap } from "@agentry/core/mask";
import { createPaths } from "@agentry/core/paths";
import { packageVersion } from "@agentry/core/version";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { contract } from "../contract/index.js";

export type Api = ReturnType<typeof createData>;
type Loaded = ReturnType<Api["load"]>;

const isFolder = (dir: string): boolean => {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

// Every call names its project folder; core builds every path from it, so it must be a real folder before core sees it.
const call =
  <I extends { dir: string }, O>(fn: (input: I) => O) =>
  async ({ input }: { input: I }): Promise<Awaited<O>> => {
    if (!isFolder(input.dir)) {
      throw new ORPCError("BAD_REQUEST", { message: "dir is not a folder" });
    }
    return await fn(input);
  };

// core's fallback for a failed list part is a bare { loadError } object, not an array; screens get one shape either way.
const listPart = <T>(part: T[] & { loadError?: string }) =>
  Array.isArray(part)
    ? { items: [...part] }
    : { items: [], loadError: (part as { loadError?: string }).loadError };

// The MCP reader already masks; masking env and header values again here keeps a secret out of the browser even if a
// reader change ever let one through (maskMap is idempotent on masked values).
const remask = (server: Loaded["status"]["mcp"]["servers"][number]) => ({
  ...server,
  env: server.env && maskMap(server.env),
  headers: server.headers && maskMap(server.headers, maskHeader),
});

const toJson = (loaded: Loaded) => ({
  dir: loaded.dir,
  paths: {
    home: loaded.paths.home,
    configDir: loaded.paths.configDir,
    shelfDir: loaded.paths.shelfDir,
    backupsDir: loaded.paths.backupsDir,
  },
  status: {
    ...loaded.status,
    mcp: { servers: (loaded.status.mcp?.servers ?? []).map(remask) },
  },
  doctor: loaded.doctor,
  backups: listPart(loaded.backups),
  parkedHooks: listPart(loaded.parkedHooks),
  parked: listPart(loaded.parked),
  rules: listPart(loaded.rules),
  groups: listPart(loaded.groups),
  catalog: loaded.catalog,
});

export const createRouter = (data: Api) => {
  const os = implement(contract);
  return os.router({
    info: os.info.handler(() => ({
      dir: process.cwd(),
      version: packageVersion(),
    })),
    load: os.load.handler(call(({ dir }) => toJson(data.load(dir)))),
    skills: {
      // core names the text `message` here only; every write returns { ok, text } to the browser.
      toggleShelf: os.skills.toggleShelf.handler(
        call(async (input) => {
          const { ok, message } = await data.toggleShelf(input);
          return { ok, text: message };
        })
      ),
      shelveSkill: os.skills.shelveSkill.handler(call(data.shelveSkill)),
      unshelveSkill: os.skills.unshelveSkill.handler(call(data.unshelveSkill)),
      promoteSkill: os.skills.promoteSkill.handler(call(data.promoteSkill)),
      demoteSkill: os.skills.demoteSkill.handler(call(data.demoteSkill)),
      removeSkill: os.skills.removeSkill.handler(call(data.removeSkill)),
    },
    mcp: {
      previewMcp: os.mcp.previewMcp.handler(call(data.previewMcp)),
      applyMcp: os.mcp.applyMcp.handler(call(data.applyMcp)),
      previewMcpRemove: os.mcp.previewMcpRemove.handler(
        call(data.previewMcpRemove)
      ),
      applyMcpRemove: os.mcp.applyMcpRemove.handler(call(data.applyMcpRemove)),
      previewMcpAdd: os.mcp.previewMcpAdd.handler(call(data.previewMcpAdd)),
      applyMcpAdd: os.mcp.applyMcpAdd.handler(call(data.applyMcpAdd)),
      previewMcpSet: os.mcp.previewMcpSet.handler(call(data.previewMcpSet)),
      applyMcpSet: os.mcp.applyMcpSet.handler(call(data.applyMcpSet)),
    },
    hooks: {
      previewHook: os.hooks.previewHook.handler(call(data.previewHook)),
      applyHook: os.hooks.applyHook.handler(call(data.applyHook)),
    },
    plugins: {
      previewPlugin: os.plugins.previewPlugin.handler(call(data.previewPlugin)),
      applyPlugin: os.plugins.applyPlugin.handler(call(data.applyPlugin)),
      previewPluginInstall: os.plugins.previewPluginInstall.handler(
        call(data.previewPluginInstall)
      ),
      applyPluginInstall: os.plugins.applyPluginInstall.handler(
        call(data.applyPluginInstall)
      ),
    },
    rules: {
      removeRule: os.rules.removeRule.handler(call(data.removeRule)),
    },
    catalog: {
      refreshCatalog: os.catalog.refreshCatalog.handler(
        call(data.refreshCatalog)
      ),
      addFromCatalog: os.catalog.addFromCatalog.handler(
        call(data.addFromCatalog)
      ),
      updateFromCatalog: os.catalog.updateFromCatalog.handler(
        call(data.updateFromCatalog)
      ),
      removeAgent: os.catalog.removeAgent.handler(call(data.removeAgent)),
    },
    doctor: {
      previewFix: os.doctor.previewFix.handler(call(data.previewFix)),
      applyFix: os.doctor.applyFix.handler(call(data.applyFix)),
      previewUndo: os.doctor.previewUndo.handler(call(data.previewUndo)),
      applyUndo: os.doctor.applyUndo.handler(call(data.applyUndo)),
    },
    backups: {
      restoreBackup: os.backups.restoreBackup.handler(call(data.restoreBackup)),
      pruneBackups: os.backups.pruneBackups.handler(call(data.pruneBackups)),
    },
  });
};

export type AppRouter = ReturnType<typeof createRouter>;

const handlers = new WeakMap<Api, RPCHandler<Record<never, never>>>();

// Serves /rpc/* for one data facade. Unexpected failures are logged by procedure path and error name only: inputs can
// carry MCP env values typed in the browser, so they are never logged.
export const handleRpc = async (
  request: Request,
  data: Api,
  log: (line: string) => void = (line) => process.stderr.write(`${line}\n`)
): Promise<Response> => {
  let handler = handlers.get(data);
  if (!handler) {
    handler = new RPCHandler(createRouter(data), {
      clientInterceptors: [
        async ({ next, path }) => {
          try {
            return await next();
          } catch (error) {
            // A refused input (BAD_REQUEST) is the browser's mistake and needs no log. An output that fails its schema
            // is an INTERNAL_SERVER_ERROR whose cause lists the failing fields: log those paths, never the data.
            if (!(error instanceof ORPCError)) {
              log(
                `agentry ui: ${path.join(".")} failed (${error instanceof Error ? error.name : "error"})`
              );
            } else if (error.code === "INTERNAL_SERVER_ERROR") {
              const issues = (
                error.cause as
                  | { issues?: { path?: readonly PropertyKey[] }[] }
                  | undefined
              )?.issues;
              const where = (issues ?? [])
                .map((issue) => (issue.path ?? []).map(String).join("."))
                .join(", ");
              log(
                `agentry ui: ${path.join(".")} failed: ${error.message}${where ? ` (${where})` : ""}`
              );
            }
            throw error;
          }
        },
      ],
    });
    handlers.set(data, handler);
  }
  const { matched, response } = await handler.handle(request, {
    prefix: "/rpc",
    context: {},
  });
  return matched ? response : new Response("Not found", { status: 404 });
};

// The real facade for the running app: real HOME, built on first use so importing this module reads nothing.
let real: Api | undefined;
export const realData = (): Api => {
  real ??= createData({ makePaths: (dir) => createPaths({ cwd: dir }) });
  return real;
};
