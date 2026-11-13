// Skills: shelf links and skill folders (core shelf.ts through createData). The dryRun calls stay single procedures under
// core's names: dryRun: true is the preview, the same call without it applies.

import { z } from "zod";
import {
  base,
  dirSchema,
  nameSchema,
  outcomeSchema,
  shelfTargetSchema,
} from "./shared.js";

const dryRun = z.boolean().optional();

// target is resolved against the shelf folder listing; global picks ~/.claude over this project's .claude.
const toggleShelf = base
  .input(
    z.object({
      dir: dirSchema,
      target: shelfTargetSchema,
      on: z.boolean(),
      global: z.boolean().optional(),
    })
  )
  .output(outcomeSchema);

// Reaches a file path: core moves <skills>/<skill> to <shelf>/<group>/<skill>, so both are single path segments.
const shelveSkill = base
  .input(
    z.object({
      dir: dirSchema,
      skill: nameSchema,
      group: nameSchema,
      dryRun,
      project: z.boolean().optional(),
    })
  )
  .output(outcomeSchema);

const unshelveSkill = base
  .input(z.object({ dir: dirSchema, target: shelfTargetSchema, dryRun }))
  .output(outcomeSchema);

// Reaches a file path: <project>/.claude/skills/<skill> and ~/.claude/skills/<skill>.
const skillMove = z.object({ dir: dirSchema, skill: nameSchema, dryRun });
const promoteSkill = base.input(skillMove).output(outcomeSchema);
const demoteSkill = base.input(skillMove).output(outcomeSchema);

// Reaches a file path: with project, core deletes <project>/.claude/skills/<target> after only an exists check, so ".."
// would be the .claude folder itself; the shelf target schema (single segments, no leading dot) rules that out.
const removeSkill = base
  .input(
    z.object({
      dir: dirSchema,
      target: shelfTargetSchema,
      dryRun,
      project: z.boolean().optional(),
      backup: z.boolean().optional(),
    })
  )
  .output(outcomeSchema);

export const skillsContract = {
  toggleShelf,
  shelveSkill,
  unshelveSkill,
  promoteSkill,
  demoteSkill,
  removeSkill,
};
