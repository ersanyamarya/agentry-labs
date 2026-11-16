// Sharing Claude user items with Copilot, and trusting this repo in Copilot: core's copilotState and its previewCopilot /
// applyCopilot pair (the names match createData, as every section does). A pair shares one input schema; apply has no
// dryRun (core's apply always writes). `kind` and `name` pick the item for share and unshare; trust and untrust take none.

import { z } from "zod";
import {
  base,
  dirInput,
  dirSchema,
  nameSchema,
  outcomeSchema,
  previewSchema,
} from "./shared.js";

export const copilotKindSchema = z.enum(["skill", "agent", "rule", "mcp"]);

// What load carries (core's CopilotShareState): the same shape comes back from copilotState.
export const copilotStateSchema = z.object({
  signedIn: z.boolean(),
  trusted: z.boolean(),
  items: z.array(
    z.object({
      kind: copilotKindSchema,
      name: z.string(),
      repoWins: z.boolean(),
      state: z.enum(["shared", "notShared", "other", "setup", "repoWins"]),
      why: z.string().optional(),
    })
  ),
  // Set when reading the state failed; the rest is core's empty fallback.
  loadError: z.string().optional(),
});

// share and unshare name an item (one path segment: a skill folder, an agent or rule file name, an MCP server); trust and
// untrust name none, core takes the folder from dir.
const copilotInput = z
  .object({
    dir: dirSchema,
    action: z.enum(["share", "unshare", "trust", "untrust"]),
    kind: copilotKindSchema.optional(),
    name: nameSchema.optional(),
  })
  .refine(
    (input) =>
      input.action === "trust" ||
      input.action === "untrust" ||
      (input.kind !== undefined && input.name !== undefined),
    { message: "share and unshare need a kind and a name" }
  );

export const copilotContract = {
  copilotState: base.input(dirInput).output(copilotStateSchema.nullable()),
  previewCopilot: base.input(copilotInput).output(previewSchema),
  applyCopilot: base.input(copilotInput).output(outcomeSchema),
};
