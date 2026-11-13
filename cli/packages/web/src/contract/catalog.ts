// The agentry-labs catalog: fetch, install, update, and remove an installed agent. dryRun: true is the preview.

import { z } from "zod";
import {
  base,
  dirInput,
  dirSchema,
  nameSchema,
  outcomeSchema,
} from "./shared.js";

// "kind/name" or a bare name, matched against the fetched catalog's own entries (never joined into a path as given).
const catalogName = z
  .string()
  .min(1)
  .max(400)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)?$/, {
    message: "not a catalog name",
  });
const names = z.array(catalogName).min(1).max(200);
const dryRun = z.boolean().optional();

export const catalogContract = {
  refreshCatalog: base.input(dirInput).output(outcomeSchema),
  // Reaches a file path: group is the shelf group a skill is copied into (<shelf>/<group>/<name>), so one segment.
  addFromCatalog: base
    .input(
      z.object({
        dir: dirSchema,
        names,
        group: nameSchema.optional(),
        project: z.boolean().optional(),
        dryRun,
      })
    )
    .output(outcomeSchema),
  updateFromCatalog: base
    .input(z.object({ dir: dirSchema, names, dryRun }))
    .output(outcomeSchema),
  // target "agent/<name>", matched against the catalog's installed agents.
  removeAgent: base
    .input(
      z.object({
        dir: dirSchema,
        target: catalogName,
        project: z.boolean().optional(),
        dryRun,
        backup: z.boolean().optional(),
      })
    )
    .output(outcomeSchema),
};
