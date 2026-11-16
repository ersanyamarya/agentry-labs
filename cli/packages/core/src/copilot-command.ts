// `agentry copilot status | share | unshare | trust | untrust`: the command line over the Phase 1 modules
// (copilot-share.ts, copilot-trust.ts). Sharing applies to all projects; trust is per repo. Every write goes through the fix
// engine inside those modules (preview, confirm or --yes, backup set, `agentry fix --undo`).
// Exit codes (as mcp-toggle.ts): 0 done, previewed, declined or already so; 1 refused or failed; 2 usage.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createCopilotShare, type ShareKind } from "./copilot-share.js";
import { createCopilotTrust } from "./copilot-trust.js";
import { createData } from "./data.js";
import { messages } from "./messages.js";
import type { Paths } from "./paths.js";
import type { CopilotShareItem, FixOptions } from "./types.js";

const { copilot: words, core } = messages();
const text = words.cli;

export type CopilotAction =
  | "status"
  | "share"
  | "unshare"
  | "trust"
  | "untrust";

const KINDS: ShareKind[] = ["skill", "agent", "rule", "mcp"];

export interface CopilotCommandArgs {
  action: CopilotAction;
  dryRun?: boolean;
  json?: boolean;
  kind?: string;
  /** share and unshare: the item name; trust and untrust: the folder (default: the current one). */
  name?: string;
  yes?: boolean;
}

export interface CopilotCommandOptions extends FixOptions {
  isCopilotRunning?: () => boolean;
}

const pickKind = (
  action: "share" | "unshare",
  items: CopilotShareItem[]
): CopilotShareItem[] => {
  // With no --kind, prefer the one the action can change: an unshared item to share, a shared one to unshare.
  const wanted = items.filter((item) =>
    action === "share" ? item.state !== "shared" : item.state === "shared"
  );
  return wanted.length > 0 ? wanted : items;
};

export const createCopilotCommand = (
  paths: Paths,
  options: CopilotCommandOptions = {}
) => {
  const tilde = (path: string): string =>
    paths.home && path.startsWith(`${paths.home}/`)
      ? `~${path.slice(paths.home.length)}`
      : path;

  const status = (cwd: string, json: boolean | undefined): number => {
    const data = createData({ makePaths: () => paths });
    const state = data.copilotState(cwd);
    if (!state) {
      return 1;
    }
    if (json) {
      console.log(
        JSON.stringify(
          { version: 1, home: paths.copilotDir, ...state },
          null,
          2
        )
      );
      return 0;
    }
    console.log(text.home(tilde(paths.copilotDir), state.signedIn));
    console.log(
      `${words.repoLabel}: ${state.trusted ? words.repoState.on : words.repoState.off}`
    );
    if (!state.signedIn) {
      console.log(words.signedOut);
    }
    if (state.items.length === 0) {
      console.log(text.noItems);
    }
    for (const item of state.items) {
      const label = words.states[item.state];
      console.log(
        `  ${item.kind}  ${item.name}  ${label}${item.why ? `  (${item.why})` : ""}`
      );
    }
    return 0;
  };

  // The kind of the one item `name` stands for, or a usage/refusal exit code.
  const resolveKind = (
    action: "share" | "unshare",
    name: string,
    kind: string | undefined,
    items: CopilotShareItem[]
  ): ShareKind | number => {
    if (kind !== undefined) {
      if (!KINDS.includes(kind as ShareKind)) {
        console.error(text.badKind(kind));
        return 2;
      }
      return kind as ShareKind;
    }
    const found = pickKind(
      action,
      items.filter((item) => item.name === name)
    );
    if (found.length === 0) {
      console.error(core.refused(text.noItem(name)));
      return 1;
    }
    if (found.length > 1) {
      console.error(
        text.ambiguous(name, found.map((item) => item.kind).join(", "))
      );
      return 2;
    }
    return found[0].kind;
  };

  const run = async ({
    action,
    name,
    kind,
    json,
    yes,
    dryRun,
  }: CopilotCommandArgs): Promise<number> => {
    if (yes && dryRun) {
      console.error(text.yesAndDryRun);
      return 2;
    }
    const writes = action !== "status";
    if (json && writes && !(yes || dryRun)) {
      console.error(text.jsonNeedsYes);
      return 2;
    }
    if (!existsSync(paths.copilotDir)) {
      console.error(words.noCopilot(tilde(paths.copilotDir)));
      return 1;
    }
    const isFolder = action === "trust" || action === "untrust";
    const cwd = resolve(isFolder ? (name ?? process.cwd()) : process.cwd());
    if (isFolder && !(existsSync(cwd) && statSync(cwd).isDirectory())) {
      console.error(core.refused(text.notFolder(cwd)));
      return 1;
    }
    const state = createData({ makePaths: () => paths }).copilotState(cwd);
    if (state && !(state.signedIn || json)) {
      (action === "status" ? console.log : console.error)(words.signedOut);
    }
    if (action === "status") {
      return status(cwd, json);
    }

    const lines: string[] = [];
    const errors: string[] = [];
    const io = json
      ? {
          out: (line: unknown) => lines.push(String(line)),
          err: (line: unknown) => errors.push(String(line)),
          warn: (line: unknown) => errors.push(String(line)),
        }
      : {};
    const engineOptions = { ...options, ...io };
    const args = { dryRun, yes, path: cwd };
    let code: number;
    let chosen: ShareKind | undefined;
    if (isFolder) {
      const trust = createCopilotTrust(paths, engineOptions);
      code = await trust[action](cwd, args);
    } else if (name === undefined) {
      return 2;
    } else {
      const resolved = resolveKind(action, name, kind, state?.items ?? []);
      if (typeof resolved === "number") {
        return resolved;
      }
      chosen = resolved;
      const share = createCopilotShare(paths, engineOptions);
      code = await share[action]({ kind: resolved, name, ...args });
    }
    if (json) {
      console.log(
        JSON.stringify(
          {
            version: 1,
            action,
            ok: code === 0,
            exitCode: code,
            dryRun: Boolean(dryRun),
            ...(chosen === undefined ? { dir: cwd } : { kind: chosen, name }),
            output: lines,
            errors,
          },
          null,
          2
        )
      );
    }
    return code;
  };

  return { run };
};
