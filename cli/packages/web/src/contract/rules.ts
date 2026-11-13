// CLAUDE.md and rule files: delete after a copy to the backups. dryRun: true is the preview.

import { z } from "zod";
import { base, dirSchema, keySchema, outcomeSchema } from "./shared.js";

// target is a rule id, label or path that core matches against the rule files it listed for dir; a path that is not in
// that list is refused, so the browser cannot name an arbitrary file.
const removeRule = base
  .input(
    z.object({
      dir: dirSchema,
      target: keySchema,
      dryRun: z.boolean().optional(),
      backup: z.boolean().optional(),
    })
  )
  .output(outcomeSchema);

export const rulesContract = { removeRule };
