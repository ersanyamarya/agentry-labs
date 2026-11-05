// `agentry hook list|disable|enable|remove`: switch a hook from the user, project or local settings file off and back on, or
// delete it. Claude Code has no per-hook off switch (only `disableAllHooks`), so "disable" PARKS the hook: its entry is
// removed from the settings file and saved in <config dir>/agentry/parked-hooks.json; "enable" puts it back in the same
// file (same event, same matcher group) and drops the saved copy. "remove" only deletes the entry.
//
// Selector: the 8-hex `id` that `hook list` prints, a hash of event + matcher + the raw hook entry (lib/inventory/hooks.mjs
// hookId); a prefix of 4 or more characters works. The same hook in two settings files has one id, so --scope user|project|local
// picks the file. Plugin hooks are refused (the plugin owns them: disable the plugin).
//
// Edits are text edits (lib/json-edit.mjs) run through the fix engine (lib/fix.mjs), like lib/plugin-toggle.mjs: masked diff
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
import { createHooksReader, hookId } from "./inventory/hooks.js";
import { isObject, list, readJson } from "./inventory/common.js";
import { createJsonEdit } from "./json-edit.js";
import { maskShell } from "./mask.js";
import type { Paths } from "./paths.js";
import type { DoctorLike, Finding, FixOptions, FixRegistry, HookEntry, HookGroup, HookItem, HookState, Scope, SettingsJson } from "./types.js";

const RULE = "hook-toggle";
export const SCOPES: Scope[] = ["user", "project", "local"];
export const APPLIES_NOTE = "Applies to sessions started after this.";

// [group index, hook index, group, hook] of the hook with this id under settings.hooks[event]; undefined when absent.
interface Located {
	gi: number;
	hi: number;
	group: HookGroup;
	hook: HookEntry;
}

const locate = (json: SettingsJson | undefined, event: string, id: string): Located | undefined => {
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

const describeHook = ({ event, matcher, hook }: { event: string; matcher?: string; hook?: HookEntry }): string => `${event} ${matcher || "*"} ${hook?.command === undefined ? `(${hook?.type ?? "hook"})` : maskShell(String(hook.command))}`;

/** A hook taken out of a settings file by `hook disable`; the raw entry is kept so `hook enable` can put it back. */
export interface ParkedHook {
	id: string;
	scope: string;
	file: string;
	event: string;
	matcher: string;
	hook: HookEntry;
	parkedAt: string;
}

export interface ParkedHooksStore {
	version: number;
	hooks: Record<string, ParkedHook>;
}

/** A parked hook shaped like an active row of `hook list`. */
export interface ParkedRow {
	id: string;
	event: string;
	matcher: string;
	type: string;
	command?: string;
	scope: string;
	source: string;
	state: HookState | "off";
	parkedAt: string;
	plugin?: undefined;
}

export type HookAction = "disable" | "enable" | "remove";

export interface HookArgs {
	selector: string;
	action: HookAction;
	scope?: string;
	path?: string;
}

/** What `inspect` found: a refusal (with exit code), an "already so" note, or the hook to act on (active and/or parked). */
export type Inspected =
	| { refusal: string; code: number; already?: undefined; cwd?: undefined; active?: undefined; parked?: undefined }
	| { already: string; refusal?: undefined; code?: undefined; cwd?: undefined; active?: undefined; parked?: undefined }
	| { cwd: string; active?: HookItem; parked?: ParkedHook; refusal?: undefined; code?: undefined; already?: undefined };

export const createHookToggle = (paths: Paths, { out = console.log, err = console.error, ...fixOptions }: FixOptions = {}) => {
	const reader = createHooksReader(paths);
	const tilde = (text: unknown): string => (paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text));

	const readParked = (): ParkedHooksStore => {
		try {
			const store = JSON.parse(readFileSync(paths.parkedHooks, "utf8")) as ParkedHooksStore | null;
			return isObject(store?.hooks) ? (store as ParkedHooksStore) : { version: 1, hooks: {} };
		} catch {
			return { version: 1, hooks: {} };
		}
	};
	const writeParked = (store: ParkedHooksStore): void => {
		mkdirSync(dirname(paths.parkedHooks), { recursive: true, mode: 0o700 });
		atomicWrite(paths.parkedHooks, `${JSON.stringify(store, null, "\t")}\n`, 0o600);
	};
	const keyOf = (scope: string, id: string): string => `${scope}:${id}`;

	// Parked hooks for display: masked, with the same fields as an active row.
	const listParked = (): ParkedRow[] =>
		Object.values(readParked().hooks)
			.filter((entry) => isObject(entry))
			.map((entry): ParkedRow => ({ id: entry.id, event: entry.event, matcher: entry.matcher || "*", type: entry.hook?.type ?? "command", command: typeof entry.hook?.command === "string" ? maskShell(entry.hook.command) : undefined, scope: entry.scope, source: entry.file, state: "off", parkedAt: entry.parkedAt }));

	// Prints the hooks (active, then parked) one per line, or as JSON.
	const runList = ({ path, json = false }: { path?: string; json?: boolean } = {}): number => {
		const cwd = resolve(path ?? process.cwd());
		const active = reader.read({ cwd }).hooks;
		const all = [...active, ...listParked()];
		if (json) {
			out(JSON.stringify(all, null, 2));
			return 0;
		}
		for (const hook of all) {
			out(`${hook.id}  ${hook.scope.padEnd(7)} ${hook.state.padEnd(8)} ${hook.event}  ${hook.matcher}  ${hook.command ?? `(${hook.type})`}${hook.plugin ? `  [${hook.plugin}]` : ""}`);
		}
		return 0;
	};

	// → { active?: item, parked?: entry } for the selector, or { refusal, code }.
	const inspect = ({ selector, action, scope, path }: HookArgs): Inspected => {
		const cwd = resolve(path ?? process.cwd());
		const refuse = (refusal: string, code = 1): Inspected => ({ refusal, code });
		if (scope !== undefined && !SCOPES.includes(scope as Scope)) {
			return refuse(`--scope must be one of ${SCOPES.join(", ")}`, 2);
		}
		if (!/^[0-9a-f]{4,8}$/.test(selector ?? "")) {
			return refuse("The selector is the id column of agentry hook list (4 to 8 hex characters).", 2);
		}
		const wanted = (item: { id: string; scope: string }): boolean => item.id.startsWith(selector) && (scope === undefined || item.scope === scope);
		const active = reader.read({ cwd }).hooks.filter(wanted);
		const parked = Object.values(readParked().hooks).filter((entry) => isObject(entry) && wanted({ id: String(entry.id), scope: entry.scope }));
		const own = active.filter((item) => item.scope !== "plugin");
		const plugin = active.filter((item) => item.scope === "plugin");
		const pool: HookItem[] = action === "enable" ? [] : own;
		const poolParked: ParkedHook[] = action === "disable" ? [] : parked;
		const ids = new Set([...pool, ...poolParked].map((item) => item.id));
		if (ids.size > 1) {
			return refuse(`"${selector}" matches several hooks (${[...ids].join(", ")}); use more characters.`, 2);
		}
		if (pool.length + poolParked.length === 0) {
			if (plugin.length > 0 && action !== "enable") {
				return refuse(`${selector} is a hook of plugin ${plugin[0].plugin}, which manages it; turn the plugin off with agentry plugin disable ${plugin[0].plugin}.`);
			}
			if (action === "disable" && parked.length > 0) {
				return { already: `${selector} is already off (${describeHook({ event: parked[0].event, matcher: parked[0].matcher, hook: parked[0].hook })}).` };
			}
			if (action === "enable" && own.length > 0) {
				return { already: `${selector} is already on (${own[0].scope} settings).` };
			}
			return refuse(`No ${action === "enable" ? "turned-off " : ""}hook "${selector}"${scope ? ` in ${scope} settings` : ""}. See agentry hook list.`);
		}
		const scopesFound = [...new Set([...pool.map((item) => item.scope), ...poolParked.map((entry) => entry.scope)])];
		if (scopesFound.length > 1) {
			return refuse(`${selector} exists in ${scopesFound.join(" and ")} settings; pick one with --scope.`, 2);
		}
		return { cwd, active: pool[0], parked: poolParked[0] };
	};

	const run = async ({ selector, action, scope, path, yes = false, dryRun = false }: HookArgs & { yes?: boolean; dryRun?: boolean }): Promise<number> => {
		const found = inspect({ selector, action, scope, path });
		if (found.refusal !== undefined) {
			err(`refused: ${found.refusal}`);
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
			out(`would delete the parked copy of ${describeHook(parked)} from ${tilde(paths.parkedHooks)}`);
			if (dryRun) {
				return 0;
			}
			if (!yes) {
				err("Add --yes to delete the parked copy.");
				return 1;
			}
			const store = readParked();
			delete store.hooks[keyOf(parked.scope, parked.id)];
			writeParked(store);
			out(`${selector}: parked copy deleted.`);
			return 0;
		}

		const id = (active ?? parked).id;
		const hookScope = (active ?? parked).scope;
		const file = active?.source ?? parked.file;
		const event = (active ?? parked).event;
		const raw = active ? locate(readJson<SettingsJson>(file, []), event, id) : { group: { matcher: parked.matcher || undefined }, hook: parked.hook };
		if (!raw) {
			err(`refused: ${selector} is not in ${tilde(file)} any more; run agentry hook list.`);
			return 1;
		}
		const matcherRaw = typeof raw.group.matcher === "string" ? raw.group.matcher : undefined;
		const label = describeHook({ event, matcher: matcherRaw, hook: raw.hook });
		const wantPresent = action === "enable";
		const present = () => locate(readJson<SettingsJson>(file, []), event, id) !== undefined;
		if (wantPresent && present()) {
			out(`${selector} is already in ${tilde(file)}; the saved copy stays (agentry hook remove ${selector} --scope ${hookScope} deletes it).`);
			return 0;
		}
		if (wantPresent && !existsSync(dirname(file))) {
			err(`refused: ${tilde(dirname(file))} does not exist, so the hook cannot be put back there.`);
			return 1;
		}

		const removeText = (text: string | undefined): string | undefined => {
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
		const insertText = (text: string | undefined): string => {
			const group = { ...(matcherRaw !== undefined && { matcher: matcherRaw }), hooks: [raw.hook] };
			if (text === undefined || text.trim() === "") {
				return `${JSON.stringify({ hooks: { [event]: [group] } }, null, "\t")}\n`;
			}
			const doc = createJsonEdit(text);
			const groups = doc.get(["hooks", event]);
			if (doc.get(["hooks"]) === undefined) {
				doc.set(["hooks"], { [event]: [group] });
			} else if (!Array.isArray(groups)) {
				doc.set(["hooks", event], [group]);
			} else {
				const gi = groups.findIndex((one) => isObject(one) && (typeof one.matcher === "string" ? one.matcher : undefined) === matcherRaw && Array.isArray(one.hooks));
				if (gi >= 0) {
					doc.set(["hooks", event, gi, "hooks"], [...groups[gi].hooks, raw.hook]);
				} else {
					doc.set(["hooks", event], [...groups, group]);
				}
			}
			return doc.text;
		};

		const verb = { disable: "Turn off", enable: "Turn on", remove: "Remove" }[action];
		const finding: Finding = { id: RULE, severity: "info", message: `hook ${selector} should be ${wantPresent ? "back in" : "out of"} ${hookScope} settings`, file };
		const doctor = (): DoctorLike => ({ collect: () => ({ project: { cwd, root: paths.projectRoot(cwd) }, findings: present() === wantPresent ? [] : [finding], errors: [] }) });
		const fixes: FixRegistry = { [RULE]: () => ({ ruleId: RULE, file, describe: () => `${verb} hook ${id}: ${label} (${hookScope} settings)`, apply: wantPresent ? insertText : removeText }) };
		const code = await createFix(paths, { out, err, doctor, fixes, ...fixOptions }).run({ path: cwd, yes, dryRun });
		if (code !== 0 || dryRun || present() !== wantPresent) {
			return code;
		}
		const now = (fixOptions.now?.() ?? new Date()).toISOString();
		try {
			const store = readParked();
			if (action === "disable") {
				store.hooks[keyOf(hookScope, id)] = { id, scope: hookScope, file, event, matcher: matcherRaw ?? "", hook: raw.hook, parkedAt: now };
				writeParked(store);
				out(`hook ${id} is off (saved in ${tilde(paths.parkedHooks)}, mode 0600). Switch it back with agentry hook enable ${id}. ${APPLIES_NOTE}`);
			} else if (action === "enable") {
				delete store.hooks[keyOf(hookScope, id)];
				writeParked(store);
				out(`hook ${id} is back in ${hookScope} settings; its saved copy is deleted. ${APPLIES_NOTE}`);
			} else {
				out(`hook ${id} is removed from ${hookScope} settings. ${APPLIES_NOTE}`);
			}
		} catch {
			err(`The settings file changed, but the saved copy could not be updated; agentry fix --undo restores the file.`);
			return 1;
		}
		return 0;
	};

	return { inspect, run, list: runList, listParked, readParked };
};
