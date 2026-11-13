// Backups: restore a removed or updated item, delete (prune) backups. dryRun: true is the preview.

import { z } from "zod";
import { base, dirSchema, keySchema, outcomeSchema } from "./shared.js";

const dryRun = z.boolean().optional();

export const backupsContract = {
  // id is matched against core's own backup list; the folder restored to is the one core recorded, not the browser's.
  restoreBackup: base
    .input(z.object({ dir: dirSchema, id: keySchema, dryRun }))
    .output(outcomeSchema),
  // ids (matched against the list), or every backup older than olderThan days, or all.
  pruneBackups: base
    .input(
      z.object({
        dir: dirSchema,
        ids: z.array(keySchema).min(1).max(1000).optional(),
        olderThan: z.number().int().nonnegative().optional(),
        all: z.boolean().optional(),
        dryRun,
      })
    )
    .output(outcomeSchema),
};
