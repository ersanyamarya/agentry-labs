// Confirm step for deleting a skill (or, with call "removeRule", a CLAUDE.md or rule file): the preview is the lib's own dry run, and nothing is deleted until y. A copy of
// the folder is kept under ~/.claude/backups/agentry/removed/ (Backups tab: u restores) unless backup is false (X key).

import { messages } from "@agentry/core/messages";
import type { Api } from "./types.js";
import type { useFlow } from "./use-flow.js";

const text = messages().flows.remove;

interface RemoveArgs {
  api: Api;
  backup?: boolean;
  call?: "removeSkill" | "removeAgent" | "removeRule";
  dir: string;
  flow: ReturnType<typeof useFlow>;
  label?: string;
  project?: boolean;
  target: string;
}

export const startRemove = async ({
  api,
  dir,
  flow,
  target,
  label,
  project,
  backup = true,
  call = "removeSkill",
}: RemoveArgs) => {
  const preview = await api[call]({
    dir,
    target,
    project,
    backup,
    dryRun: true,
  });
  flow.begin({
    kind: "confirm",
    title: text.title(label),
    text: preview.text,
    appliable: preview.ok,
    apply: () => api[call]({ dir, target, project, backup }),
    done: text.done(label, backup),
  });
};
