// A fake oRPC client under the real TanStack Query helpers, so screens run their real query and mutation code.
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { vi } from "vitest";
import { loadFixture } from "./fixtures.js";

const write = () => vi.fn(async () => ({ ok: true, text: "done" }));

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
};

export const mockOrpc = () => ({
  client: mockClient,
  orpc: createTanstackQueryUtils(mockClient as never),
});
