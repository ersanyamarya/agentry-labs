// `agentry hook list|disable|enable|remove`: switch a hook from the user, project or local settings file off and back on, or
// delete it. Claude Code has no per-hook off switch (only `disableAllHooks`), so "disable" PARKS the hook: its entry is
// removed from the settings file and saved in <config dir>/agentry/parked-hooks.json; "enable" puts it back in the same
// file (same event, same matcher group) and drops the saved copy. "remove" only deletes the entry.
//
// Selector: the 8-hex `id` that `hook list` prints, a hash of event + matcher + the raw hook entry (src/lib/inventory/hooks.ts
// hookId); a prefix of 4 or more characters works. The same hook in two settings files has one id, so --scope user|project|local
// picks the file. Plugin hooks are refused (the plugin owns them: disable the plugin).
//
// Edits are text edits (src/lib/json-edit.ts) run through the fix engine (src/lib/fix.ts), like src/lib/plugin-toggle.ts: masked diff
// preview, confirm (or --yes), a backup of the settings file first, `agentry fix --undo` to restore. The engine's apply() must
// not write, so the parked store is written AFTER the settings edit succeeded (enable: dropped after); if saving the parked
// copy fails the message says so and `fix --undo` brings the hook back. After an undo of a disable the parked copy is still
// there; `hook enable` then sees the hook already in the file and only says so.
//
// Parked store: { version: 1, hooks: { "<scope>:<id>": { id, scope, file, event, matcher, hook, parkedAt } } }, mode 0600 in a
// 0700 folder. It holds the raw command (which can contain a secret), so it is as sensitive as the settings file: never
// printed, previews and lists show masked commands only.
// Exit codes: 0 done, previewed, declined or already so; 1 refused or failed; 2 usage or an ambiguous selector.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { atomicWrite, createFix } from "./fix.js";
import { isObject, list, readJson } from "./inventory/common.js";
import { createHooksReader, hookId } from "./inventory/hooks.js";
import { createJsonEdit } from "./json-edit.js";
import { maskShell } from "./mask.js";
import { messages } from "./messages.js";
import type { Paths } from "./paths.js";
import type {
  DoctorLike,
  Finding,
  FixOptions,
  FixRegistry,
  HookEntry,
  HookGroup,
  HookItem,
  HookState,
  Scope,
  SettingsJson,
} from "./types.js";

const RULE = "hook-toggle";
export const SCOPES: Scope[] = ["user", "project", "local"];
const words = messages().core.hookToggle;
export const APPLIES_NOTE = messages().core.appliesNote;

// [group index, hook index, group, hook] of the hook with this id under settings.hooks[event]; undefined when absent.
interface Located {
  gi: number;
  group: HookGroup;
  hi: number;
  hook: HookEntry;
}

const locate = (
  json: SettingsJson | undefined,
  event: string,
  id: string
): Located | undefined => {
  const groups = list(isObject(json?.hooks) ? json.hooks[event] : undefined);
  for (const [gi, group] of groups.entries()) {
    const found = group as HookGroup | undefined;
    for (const [hi, hook] of list(found?.hooks).entries()) {
      if (isObject(hook) && hookId(event, found?.matcher, hook) === id) {
        return { gi, hi, group: found as HookGroup, hook: hook as HookEntry };
      }
    }
  }
  return undefined;
};

/**
 * Settings text without the hook whose id is `id` under hooks[event]: drops its matcher group when it was the group's only
 * hook, and the event key when that group was the event's only group. Text edit, so the other bytes stay identical.
 * Returns the text unchanged when the hook is not there. Used by `hook remove|disable` and the dup-hook-scope fix.
 */
export const removeHookText = (
  text: string | undefined,
  event: string,
  id: string
): string | undefined => {
  const doc = createJsonEdit(text as string);
  const at = locate(doc.get([]) as SettingsJson, event, id);
  if (!at) {
    return text;
  }
  const groups = doc.get(["hooks", event]) as unknown[];
  if (list(at.group.hooks).length > 1) {
    doc.deleteElement(["hooks", event, at.gi, "hooks", at.hi]);
  } else if (groups.length > 1) {
    doc.deleteElement(["hooks", event, at.gi]);
  } else {
    doc.deleteKey(["hooks", event]);
  }
  return doc.text;
};

const describeHook = ({
  event,
  matcher,
  hook,
}: {
  event: string;
  matcher?: string;
  hook?: HookEntry;
}): string =>
  `${event} ${matcher || "*"} ${hook?.command === undefined ? `(${hook?.type ?? "hook"})` : maskShell(String(hook.command))}`;

/** A hook taken out of a settings file by `hook disable`; the raw entry is kept so `hook enable` can put it back. */
export interface ParkedHook {
  event: string;
  file: string;
  hook: HookEntry;
  id: string;
  matcher: string;
  parkedAt: string;
  scope: string;
}

export interface ParkedHooksStore {
  hooks: Record<string, ParkedHook>;
  version: number;
}

/** A parked hook shaped like an active row of `hook list`. */
export interface ParkedRow {
  command?: string;
  event: string;
  id: string;
  matcher: string;
  parkedAt: string;
  plugin?: undefined;
  scope: string;
  source: string;
  state: HookState | "off";
  type: string;
}

export type HookAction = "disable" | "enable" | "remove";

export interface HookArgs {
  action: HookAction;
  path?: string;
  scope?: string;
  selector: string;
}

/** What `inspect` found: a refusal (with exit code), an "already so" note, or the hook to act on (active and/or parked). */
export type Inspected =
  | {
      refusal: string;
      code: number;
      already?: undefined;
      cwd?: undefined;
      active?: undefined;
      parked?: undefined;
    }
  | {
      already: string;
      refusal?: undefined;
      code?: undefined;
      cwd?: undefined;
      active?: undefined;
      parked?: undefined;
    }
  | {
      cwd: string;
      active?: HookItem;
      parked?: ParkedHook;
      refusal?: undefined;
      code?: undefined;
      already?: undefined;
    };

export const createHookToggle = (
  paths: Paths,
  { out = console.log, err = console.error, ...fixOptions }: FixOptions = {}
) => {
  const reader = createHooksReader(paths);
  const tilde = (text: unknown): string =>
    paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text);

  const readParked = (): ParkedHooksStore => {
    try {
      const store = JSON.parse(
        readFileSync(paths.parkedHooks, "utf8")
      ) as ParkedHooksStore | null;
      return isObject(store?.hooks)
        ? (store as ParkedHooksStore)
        : { version: 1, hooks: {} };
    } catch {
      return { version: 1, hooks: {} };
    }
  };
  const writeParked = (store: ParkedHooksStore): void => {
    mkdirSync(dirname(paths.parkedHooks), { recursive: true, mode: 0o700 });
    atomicWrite(
      paths.parkedHooks,
      `${JSON.stringify(store, null, "\t")}\n`,
      0o600
    );
  };
  const keyOf = (scope: string, id: string): string => `${scope}:${id}`;

  // Parked hooks for display: masked, with the same fields as an active row.
  const listParked = (): ParkedRow[] =>
    Object.values(readParked().hooks)
      .filter((entry) => isObject(entry))
      .map(
        (entry): ParkedRow => ({
          id: entry.id,
          event: entry.event,
          matcher: entry.matcher || "*",
          type: entry.hook?.type ?? "command",
          command:
            typeof entry.hook?.command === "string"
              ? maskShell(entry.hook.command)
              : undefined,
          scope: entry.scope,
          source: entry.file,
          state: "off",
          parkedAt: entry.parkedAt,
        })
      );

  // Prints the hooks (active, then parked) one per line, or as JSON.
  const runList = ({
    path,
    json = false,
  }: {
    path?: string;
    json?: boolean;
  } = {}): number => {
    const cwd = resolve(path ?? process.cwd());
    const active = reader.read({ cwd }).hooks;
    const all = [...active, ...listParked()];
    if (json) {
      out(JSON.stringify(all, null, 2));
      return 0;
    }
    for (const hook of all) {
      out(
        `${hook.id}  ${hook.scope.padEnd(7)} ${hook.state.padEnd(8)} ${hook.event}  ${hook.matcher}  ${hook.command ?? `(${hook.type})`}${hook.plugin ? `  [${hook.plugin}]` : ""}`
      );
    }
    return 0;
  };

  // → { active?: item, parked?: entry } for the selector, or { refusal, code }.
  const inspect = ({ selector, action, scope, path }: HookArgs): Inspected => {
    const cwd = resolve(path ?? process.cwd());
    const refuse = (refusal: string, code = 1): Inspected => ({
      refusal,
      code,
    });
    if (scope !== undefined && !SCOPES.includes(scope as Scope)) {
      return refuse(messages().core.scopeOneOf(SCOPES.join(", ")), 2);
    }
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the value comes from user files and may be missing at runtime
    if (!/^[0-9a-f]{4,8}$/.test(selector ?? "")) {
      return refuse(words.selectorHelp, 2);
    }
    const wanted = (item: { id: string; scope: string }): boolean =>
      item.id.startsWith(selector) &&
      (scope === undefined || item.scope === scope);
    const active = reader.read({ cwd }).hooks.filter(wanted);
    const parked = Object.values(readParked().hooks).filter(
      (entry) =>
        isObject(entry) && wanted({ id: String(entry.id), scope: entry.scope })
    );
    const own = active.filter((item) => item.scope !== "plugin");
    const plugin = active.filter((item) => item.scope === "plugin");
    const pool: HookItem[] = action === "enable" ? [] : own;
    const poolParked: ParkedHook[] = action === "disable" ? [] : parked;
    const ids = new Set([...pool, ...poolParked].map((item) => item.id));
    if (ids.size > 1) {
      return refuse(words.matchesSeveral(selector, [...ids].join(", ")), 2);
    }
    if (pool.length + poolParked.length === 0) {
      if (plugin.length > 0 && action !== "enable") {
        return refuse(
          words.pluginManages(selector, plugin[0].plugin as string)
        );
      }
      if (action === "disable" && parked.length > 0) {
        return {
          already: words.alreadyOff(
            selector,
            describeHook({
              event: parked[0].event,
              matcher: parked[0].matcher,
              hook: parked[0].hook,
            })
          ),
        };
      }
      if (action === "enable" && own.length > 0) {
        return {
          already: words.alreadyOn(selector, own[0].scope),
        };
      }
      return refuse(words.noHook(action, selector, scope));
    }
    const scopesFound = [
      ...new Set([
        ...pool.map((item) => item.scope),
        ...poolParked.map((entry) => entry.scope),
      ]),
    ];
    if (scopesFound.length > 1) {
      return refuse(words.existsIn(selector, scopesFound.join(" and ")), 2);
    }
    return { cwd, active: pool[0], parked: poolParked[0] };
  };

  const run = async ({
    selector,
    action,
    scope,
    path,
    yes = false,
    dryRun = false,
  }: HookArgs & { yes?: boolean; dryRun?: boolean }): Promise<number> => {
    const found = inspect({ selector, action, scope, path });
    if (found.refusal !== undefined) {
      err(messages().core.refused(found.refusal));
      return found.code;
    }
    if (found.already !== undefined) {
      out(found.already);
      return 0;
    }
    const { cwd, active } = found;
    const parked = found.parked as ParkedHook; // set whenever `active` is not

    // remove of a hook that is only parked: delete the saved copy, no file involved
    if (action === "remove" && !active) {
      out(
        words.wouldDeleteParked(describeHook(parked), tilde(paths.parkedHooks))
      );
      if (dryRun) {
        return 0;
      }
      if (!yes) {
        err(words.addYes);
        return 1;
      }
      const store = readParked();
      delete store.hooks[keyOf(parked.scope, parked.id)];
      writeParked(store);
      out(words.parkedDeleted(selector));
      return 0;
    }

    const { id } = active ?? parked;
    const hookScope = (active ?? parked).scope;
    const file = active?.source ?? parked.file;
    const { event } = active ?? parked;
    const raw = active
      ? locate(readJson<SettingsJson>(file, []), event, id)
      : { group: { matcher: parked.matcher || undefined }, hook: parked.hook };
    if (!raw) {
      err(words.notInFile(selector, tilde(file)));
      return 1;
    }
    const matcherRaw =
      typeof raw.group.matcher === "string" ? raw.group.matcher : undefined;
    const label = describeHook({ event, matcher: matcherRaw, hook: raw.hook });
    const wantPresent = action === "enable";
    const present = () =>
      locate(readJson<SettingsJson>(file, []), event, id) !== undefined;
    if (wantPresent && present()) {
      out(words.alreadyInFile(selector, tilde(file), hookScope));
      return 0;
    }
    if (wantPresent && !existsSync(dirname(file))) {
      err(words.noDirToPutBack(tilde(dirname(file))));
      return 1;
    }

    const removeText = (text: string | undefined): string | undefined =>
      removeHookText(text, event, id);
    const insertText = (text: string | undefined): string => {
      const group = {
        ...(matcherRaw !== undefined && { matcher: matcherRaw }),
        hooks: [raw.hook],
      };
      if (text === undefined || text.trim() === "") {
        return `${JSON.stringify({ hooks: { [event]: [group] } }, null, "\t")}\n`;
      }
      const doc = createJsonEdit(text);
      const groups = doc.get(["hooks", event]);
      if (doc.get(["hooks"]) === undefined) {
        doc.set(["hooks"], { [event]: [group] });
      } else if (Array.isArray(groups)) {
        const gi = groups.findIndex(
          (one) =>
            isObject(one) &&
            (typeof one.matcher === "string" ? one.matcher : undefined) ===
              matcherRaw &&
            Array.isArray(one.hooks)
        );
        if (gi >= 0) {
          doc.set(
            ["hooks", event, gi, "hooks"],
            [...groups[gi].hooks, raw.hook]
          );
        } else {
          doc.set(["hooks", event], [...groups, group]);
        }
      } else {
        doc.set(["hooks", event], [group]);
      }
      return doc.text;
    };

    const verb = words.verbs[action];
    const finding: Finding = {
      id: RULE,
      severity: "info",
      message: `hook ${selector} should be ${wantPresent ? "back in" : "out of"} ${hookScope} settings`,
      file,
    };
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: paths.projectRoot(cwd) },
        findings: present() === wantPresent ? [] : [finding],
        errors: [],
      }),
    });
    const fixes: FixRegistry = {
      [RULE]: () => ({
        ruleId: RULE,
        file,
        describe: () => words.describe(verb, id, label, hookScope),
        apply: wantPresent ? insertText : removeText,
      }),
    };
    const code = await createFix(paths, {
      out,
      err,
      doctor,
      fixes,
      ...fixOptions,
    }).run({ path: cwd, yes, dryRun });
    if (code !== 0 || dryRun || present() !== wantPresent) {
      return code;
    }
    const now = (fixOptions.now?.() ?? new Date()).toISOString();
    try {
      const store = readParked();
      if (action === "disable") {
        store.hooks[keyOf(hookScope, id)] = {
          id,
          scope: hookScope,
          file,
          event,
          matcher: matcherRaw ?? "",
          hook: raw.hook,
          parkedAt: now,
        };
        writeParked(store);
        out(words.isOff(id, tilde(paths.parkedHooks)));
      } else if (action === "enable") {
        delete store.hooks[keyOf(hookScope, id)];
        writeParked(store);
        out(words.backIn(id, hookScope));
      } else {
        out(words.removedFrom(id, hookScope));
      }
    } catch {
      err(words.saveFailed);
      return 1;
    }
    return 0;
  };

  return { inspect, run, list: runList, listParked, readParked };
};
