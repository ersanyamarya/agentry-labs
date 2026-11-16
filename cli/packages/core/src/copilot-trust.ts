// Trust a folder in GitHub Copilot (`trustedFolders` in <ch>/config.json), and take it back. Copilot loads a repo's own
// settings only for trusted folders (cli/docs/copilot-config-sources.md). config.json is JSONC: the comment header and
// every other key stay byte for byte (jsonc-edit.ts). The edit goes through the fix engine (preview, backup set, verify,
// `agentry fix --undo`) and is refused while Copilot runs, because Copilot rewrites config.json when it exits.
// Exit codes (as copilot-share.ts): 0 done, previewed, declined or already so; 1 refused or failed.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createFix } from "./fix.js";
import { isObject, list } from "./inventory/common.js";
import { addToArray, parseJsonc, removeFromArray } from "./jsonc-edit.js";
import { messages } from "./messages.js";
import type { Paths } from "./paths.js";
import type { DoctorLike, Finding, FixOptions, FixRegistry } from "./types.js";

export const RULE = "copilot-trust";
const { copilot, core } = messages();
const words = copilot.trust;

export interface TrustRunArgs {
  dryRun?: boolean;
  yes?: boolean;
}

export interface CopilotTrustOptions extends FixOptions {
  /** Whether a Copilot process is running (default: `pgrep -x copilot`). */
  isCopilotRunning?: () => boolean;
}

const pgrepCopilot = (): boolean =>
  spawnSync("pgrep", ["-x", "copilot"], { stdio: "ignore" }).status === 0;

// The trustedFolders strings of config.json text; undefined when the text does not parse.
const folders = (text: string): string[] | undefined => {
  try {
    const json = parseJsonc(text);
    return isObject(json)
      ? list(json.trustedFolders).filter(
          (item): item is string => typeof item === "string"
        )
      : [];
  } catch {
    return undefined;
  }
};

// The trusted entry above `dir` (its folder or a parent folder), if any.
const parentOf = (dir: string, entries: string[]): string | undefined => {
  const trusted = new Map(entries.map((entry) => [resolve(entry), entry]));
  for (let up = dirname(resolve(dir)); ; up = dirname(up)) {
    const hit = trusted.get(up);
    if (hit !== undefined) {
      return hit;
    }
    if (dirname(up) === up) {
      return;
    }
  }
};

export const createCopilotTrust = (
  paths: Paths,
  {
    isCopilotRunning = pgrepCopilot,
    out = console.log,
    err = console.error,
    ...fixOptions
  }: CopilotTrustOptions = {}
) => {
  const configFile = join(paths.copilotDir, "config.json");
  const tilde = (text: string): string =>
    paths.home ? text.replaceAll(`${paths.home}/`, "~/") : text;

  const run = async (
    dir: string,
    adding: boolean,
    { yes = false, dryRun = false }: TrustRunArgs
  ): Promise<number> => {
    const cwd = resolve(dir);
    const entry = paths.projectRoot(cwd);
    const shown = tilde(entry);
    const refuse = (reason: string): number => {
      err(core.refused(reason));
      return 1;
    };
    const readEntries = (): string[] | undefined =>
      folders(readFileSync(configFile, "utf8"));

    if (!existsSync(configFile)) {
      return refuse(words.noConfig(tilde(configFile)));
    }
    if (isCopilotRunning()) {
      return refuse(words.running);
    }
    let entries: string[] | undefined;
    try {
      entries = readEntries();
    } catch {
      entries = undefined;
    }
    if (entries === undefined) {
      return refuse(words.unreadable(tilde(configFile), "not valid JSON"));
    }
    const parent = parentOf(entry, entries);
    const exact = entries.includes(entry);
    if (adding) {
      if (exact) {
        out(words.already(shown));
        return 0;
      }
      if (parent !== undefined) {
        out(words.parentAlready(shown, tilde(parent)));
        return 0;
      }
    } else if (!exact) {
      out(words.alreadyNot(shown));
      if (parent !== undefined) {
        out(words.parentTrusted(shown, tilde(parent)));
      }
      return 0;
    }

    const reached = (): boolean => {
      try {
        return (readEntries() ?? []).includes(entry) === adding;
      } catch {
        return false;
      }
    };
    const finding: Finding = {
      id: RULE,
      severity: "info",
      message: `${entry} should be ${adding ? "trusted" : "not trusted"} in ${configFile}`,
      file: configFile,
    };
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: entry },
        findings: reached() ? [] : [finding],
        errors: [],
      }),
    });
    const fixes: FixRegistry = {
      [RULE]: () => ({
        ruleId: RULE,
        file: configFile,
        describe: () =>
          adding
            ? words.describe(shown, tilde(configFile))
            : words.describeUntrust(shown, tilde(configFile)),
        // The engine hands over the text as it is now, read again right before the write.
        apply: (text) => {
          if (isCopilotRunning()) {
            throw new Error(words.running);
          }
          if (text === undefined || text === "") {
            throw new Error(words.noConfig(tilde(configFile)));
          }
          return adding
            ? addToArray(text, "trustedFolders", [entry]).text
            : removeFromArray(text, "trustedFolders", [entry]).text;
        },
      }),
    };
    const code = await createFix(paths, {
      out,
      err,
      ...fixOptions,
      doctor,
      fixes,
    }).run({ path: cwd, yes, dryRun });
    if (code === 0 && !dryRun && reached()) {
      out(adding ? words.done(shown) : words.undone(shown));
      const after = adding ? undefined : readEntries();
      const still = after ? parentOf(entry, after) : undefined;
      if (still !== undefined) {
        out(words.parentTrusted(shown, tilde(still)));
      }
    }
    return code;
  };

  return {
    /** Add the project root of `dir` to trustedFolders. */
    trust: (dir: string, args: TrustRunArgs = {}): Promise<number> =>
      run(dir, true, args),
    /** Remove that exact entry; says when a parent entry still trusts the folder. */
    untrust: (dir: string, args: TrustRunArgs = {}): Promise<number> =>
      run(dir, false, args),
  };
};
