// What the screens know about sharing with Copilot, from `load`. Pure, so it is tested without a server. Same rules as the
// terminal UI's rows.ts: Copilot shows only when its folder exists and it is signed in, a Claude user item can be shared
// (or unshared) when core lists it as shared or notShared, and any other row says why it cannot.

import { messages } from "@agentry/core/messages";
import type { LoadData } from "../contract/index.js";

const CP = messages().copilot;

export type CopilotLoad = NonNullable<LoadData["copilot"]>;
export type CopilotKind = CopilotLoad["items"][number]["kind"];

// What a Copilot cell needs for one row. `kind` and `name` are set when the row can be shared or unshared; otherwise `why`
// says why not.
export interface Share {
  kind?: CopilotKind;
  name?: string;
  shared: boolean;
  why?: string;
}

// The Copilot state to show, or undefined: nothing about Copilot appears without its folder or while it is signed out.
export const copilotOf = (load?: LoadData): CopilotLoad | undefined =>
  load?.copilot?.signedIn && Array.isArray(load.copilot.items)
    ? load.copilot
    : undefined;

// The Copilot cell of one Claude item. `name` is the item's name among the user items (its folder or file name), or
// undefined for a row that is not one (project, plugin, library only); `fallback` is then the reason.
export const shareOf = (
  state: CopilotLoad | undefined,
  kind: CopilotKind,
  name: string | undefined,
  fallback: string = CP.cannot
): Share | undefined => {
  if (!state) {
    return;
  }
  const item =
    name === undefined
      ? undefined
      : state.items.find((one) => one.kind === kind && one.name === name);
  if (item && (item.state === "shared" || item.state === "notShared")) {
    return { kind, name: item.name, shared: item.state === "shared" };
  }
  return { shared: false, why: item?.why ?? fallback };
};

// `user:<folder><name>.md` ids of core's agent and rule entries, as the terminal UI reads them.
export const userName = (id: string, folder: string) =>
  new RegExp(`^user:${folder}([^/]+)\\.md$`).exec(id)?.[1];

export const skillFolder = (source: string) => source.split("/").at(-1);
