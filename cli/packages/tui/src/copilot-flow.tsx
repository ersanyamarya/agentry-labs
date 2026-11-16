// Share a Claude user item with Copilot, or turn "Copilot in this repo" on or off (docs/agentry-copilot-share-plan.md). Same
// shape as mcp-flow.tsx: the data facade's previewCopilot, a confirm step, then applyCopilot on y. Sharing applies to all
// projects, and the preview says so. `agentry fix --undo` restores what changed.

import { messages } from "@agentry/core/messages";
import { copilotOf } from "./rows.js";
import type { Api, Data, Row } from "./types.js";
import type { Step, useFlow } from "./use-flow.js";

const { copilot: CP, flows } = messages();

type Flow = ReturnType<typeof useFlow>;
interface Ctx {
  api: Api;
  dir: string;
  flow: Flow;
}

const confirmStep = async (
  api: Api,
  call: Parameters<Api["previewCopilot"]>[0],
  title: string,
  done: string,
  intro?: string
): Promise<Step> => {
  const preview = await api.previewCopilot(call);
  return {
    kind: "confirm",
    title: flows.preview(title),
    text: intro ? `${intro}\n\n${preview.text}` : preview.text,
    appliable: preview.appliable,
    apply: () => api.applyCopilot(call),
    done,
  };
};

// C on a row agentry can share or unshare.
export const startCopilotShare = async ({
  api,
  dir,
  flow,
  row,
}: Ctx & { row: Row }) => {
  const { copilotKind: kind, copilotName: name } = row;
  if (!(kind && name)) {
    return;
  }
  const shared = Boolean(row.copilotShared);
  const action = shared ? "unshare" : "share";
  flow.begin(
    await confirmStep(
      api,
      { dir, action, kind, name },
      CP.preview[action](CP.kinds[kind], name),
      shared
        ? CP.unsharedDone(CP.kinds[kind], name)
        : CP.sharedDone(CP.kinds[kind], name)
    )
  );
};

// T: the repo root joins or leaves Copilot's trusted folders.
export const startCopilotTrust = async ({
  api,
  dir,
  flow,
  trusted,
}: Ctx & { trusted: boolean }) => {
  const action = trusted ? "untrust" : "trust";
  flow.begin(
    await confirmStep(
      api,
      { dir, action },
      CP.preview[action],
      trusted ? CP.trust.undone(dir) : CP.trust.done(dir),
      trusted ? undefined : CP.trust.explain
    )
  );
};

// C and T on the Skills, MCP, Agents and Rules tabs. Returns true when the key was used; nothing happens (false) while
// Copilot is not shown. A row that cannot be shared says why and writes nothing.
export const copilotKey = (
  input: string,
  {
    api,
    data,
    dir,
    flow,
    notify,
    row,
  }: Ctx & { data: Data; notify: (message: string) => void; row?: Row }
): boolean => {
  const state = copilotOf(data);
  if (!state || (input !== "C" && input !== "T")) {
    return false;
  }
  if (input === "T") {
    startCopilotTrust({ api, dir, flow, trusted: state.trusted });
  } else if (row?.copilotKind) {
    startCopilotShare({ api, dir, flow, row });
  } else {
    notify(row?.copilotWhy ?? CP.cannot);
  }
  return true;
};
