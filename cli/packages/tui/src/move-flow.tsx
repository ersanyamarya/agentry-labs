// Confirm step for moving a skill folder between this project and ~/.claude/skills: the preview is src/lib/shelf.ts's own dry
// run, and nothing moves until y. It is a plain move (no copy kept), so the done line says where it went.

import { messages } from "@agentry/core/messages";
import type { Api } from "./types.js";
import type { useFlow } from "./use-flow.js";

const text = messages().flows.move;

type Flow = ReturnType<typeof useFlow>;
interface Ctx {
  api: Api;
  dir: string;
  flow: Flow;
}

export const startScopeMove = async ({
  api,
  dir,
  flow,
  skill,
  promote,
}: Ctx & { skill: string; promote: boolean }) => {
  const preview = await (promote ? api.promoteSkill : api.demoteSkill)({
    dir,
    skill,
    dryRun: true,
  });
  flow.begin({
    kind: "confirm",
    title: text.title(promote, skill),
    text: preview.text,
    appliable: preview.ok,
    apply: () => (promote ? api.promoteSkill : api.demoteSkill)({ dir, skill }),
    done: text.done(promote, skill),
  });
};
