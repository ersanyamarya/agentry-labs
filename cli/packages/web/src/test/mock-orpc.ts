// A fake oRPC client under the real TanStack Query helpers, so screens run their real query and mutation code.
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { vi } from "vitest";
import { loadFixture } from "./fixtures.js";

const write = () => vi.fn(async () => ({ ok: true, text: "done" }));
const preview = () =>
  vi.fn(async () => ({ appliable: true, text: "Would change a file" }));

export const mockClient = {
  info: vi.fn(async () => ({ dir: "/work/app", version: "0.1.0" })),
  load: vi.fn(async () => loadFixture()),
  skills: {
    toggleShelf: write(),
    shelveSkill: write(),
    unshelveSkill: write(),
    promoteSkill: write(),
    demoteSkill: write(),
    removeSkill: write(),
  },
  mcp: {
    previewMcp: preview(),
    applyMcp: write(),
    previewMcpRemove: preview(),
    applyMcpRemove: write(),
    previewMcpAdd: preview(),
    applyMcpAdd: write(),
    previewMcpSet: preview(),
    applyMcpSet: write(),
  },
  hooks: { previewHook: preview(), applyHook: write() },
  plugins: {
    previewPlugin: preview(),
    applyPlugin: write(),
    previewPluginInstall: preview(),
    applyPluginInstall: write(),
  },
  rules: { removeRule: write() },
  catalog: {
    refreshCatalog: write(),
    addFromCatalog: write(),
    updateFromCatalog: write(),
    removeAgent: write(),
  },
  doctor: {
    previewFix: preview(),
    applyFix: write(),
    previewUndo: preview(),
    applyUndo: write(),
  },
  copilot: {
    copilotState: vi.fn(async () => null),
    previewCopilot: preview(),
    applyCopilot: write(),
  },
  backups: { restoreBackup: write(), pruneBackups: write() },
};

export const mockOrpc = () => ({
  client: mockClient,
  orpc: createTanstackQueryUtils(mockClient as never),
});
