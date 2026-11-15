// Confirm steps for turning a settings hook off or on and for removing one. The preview is src/lib/hook-toggle.ts's dry run
// (diff with secrets masked, backup location, refusals); nothing changes until y. `agentry fix --undo` restores the file.

import { messages } from "@agentry/core/messages";
import type { Api, Row } from "./types.js";
import type { useFlow } from "./use-flow.js";

const text = messages().flows.hook;

type Flow = ReturnType<typeof useFlow>;
interface Ctx {
  api: Api;
  dir: string;
  flow: Flow;
}

const start = async ({
  api,
  dir,
  flow,
  row,
  action,
  title,
  done,
}: Ctx & {
  row: Row;
  action: "enable" | "disable" | "remove";
  title: string;
  done: string;
}) => {
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const args = { dir, selector: row.hook!, action, scope: row.hookScope };
  const preview = await api.previewHook(args);
  flow.begin({
    kind: "confirm",
    title: messages().flows.preview(title),
    text: preview.text,
    appliable: preview.appliable,
    apply: () => api.applyHook(args),
    done,
  });
};

export const startHookToggle = ({
  api,
  dir,
  flow,
  row,
}: Ctx & { row: Row }) => {
  const action = row.hookOff ? "enable" : "disable";
  return start({
    api,
    dir,
    flow,
    row,
    action,
    title: text.toggleTitle(Boolean(row.hookOff), row.hook),
    done: text.toggled(row.hook, Boolean(row.hookOff)),
  });
};

export const startHookRemove = ({ api, dir, flow, row }: Ctx & { row: Row }) =>
  start({
    api,
    dir,
    flow,
    row,
    action: "remove",
    title: text.removeTitle(row.hook),
    done: text.removed(row.hook),
  });
