// Old names the doctor reports as stale (old -> new). The list is empty: the tools renamed so far (graft -> trail) still
// ship files and hook matchers under the old name, so flagging them was wrong. A real rename goes in renames.json.
// AGENTRY_RENAMES (a JSON object) replaces the list; tests use it to stage a rename.
import renamesData from "./renames.json" with { type: "json" };

export const defaultRenames = (
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> =>
  env.AGENTRY_RENAMES
    ? (JSON.parse(env.AGENTRY_RENAMES) as Record<string, string>)
    : renamesData;
