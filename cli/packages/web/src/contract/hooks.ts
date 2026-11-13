// Hooks in settings files: disable (park), enable, remove, as core's previewHook/applyHook pair with one input schema.

import { z } from "zod";
import {
  base,
  dirSchema,
  keySchema,
  outcomeSchema,
  previewSchema,
} from "./shared.js";

// selector is a hook id (or event) core matches against the hooks it read; scope picks one settings file when the same
// hook sits in several. Neither is joined into a path: core takes the file from its own inventory.
const hookInput = z.object({
  dir: dirSchema,
  selector: keySchema,
  action: z.enum(["disable", "enable", "remove"]),
  scope: z.enum(["user", "project", "local"]).optional(),
});

export const hooksContract = {
  previewHook: base.input(hookInput).output(previewSchema),
  applyHook: base.input(hookInput).output(outcomeSchema),
};
