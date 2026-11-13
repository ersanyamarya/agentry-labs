// Doctor: preview and apply one finding's fix, and undo the last fix set.

import { z } from "zod";
import {
  base,
  dirInput,
  dirSchema,
  outcomeSchema,
  previewSchema,
} from "./shared.js";

export const severitySchema = z.enum(["error", "warning", "info"]);

// A finding as load returned it. Its `file` is not trusted as a path: core only uses id + file + message as a key to pick
// the matching finding from its own fresh doctor run, and fixes that one.
export const findingSchema = z.object({
  file: z.string().max(4096),
  fix: z.string().max(4096).optional(),
  id: z.string().min(1).max(200),
  line: z.number().int().nonnegative().optional(),
  message: z.string().max(8192),
  severity: severitySchema,
});

const fixInput = z.object({ dir: dirSchema, finding: findingSchema });

export const doctorContract = {
  // steps: how many edits and commands the fix would make (0: no automatic fix).
  previewFix: base
    .input(fixInput)
    .output(previewSchema.extend({ steps: z.number().int().nonnegative() })),
  applyFix: base.input(fixInput).output(outcomeSchema),
  previewUndo: base.input(dirInput).output(previewSchema),
  applyUndo: base.input(dirInput).output(outcomeSchema),
};
