// Confirm step for moving a skill folder between this project and ~/.claude/skills: the preview is lib/shelf.mjs's own dry
// run, and nothing moves until y. It is a plain move (no copy kept), so the done line says where it went.

import type { useFlow } from "./use-flow.js";
import type { Api } from "./types.js";

type Flow = ReturnType<typeof useFlow>;
type Ctx = { api: Api; dir: string; flow: Flow };

export const startScopeMove = async ({ api, dir, flow, skill, promote }: Ctx & { skill: string; promote: boolean }) => {
	const preview = await (promote ? api.promoteSkill : api.demoteSkill)({ dir, skill, dryRun: true });
	flow.begin({
		kind: "confirm",
		title: `${promote ? "Move to all projects" : "Move to this project only"}: ${skill} (preview)`,
		text: preview.text,
		appliable: preview.ok,
		apply: () => (promote ? api.promoteSkill : api.demoteSkill)({ dir, skill }),
		done: promote ? `${skill} now lives in ~/.claude/skills and loads in every project.` : `${skill} now lives in this project's .claude/skills only.`,
	});
};
