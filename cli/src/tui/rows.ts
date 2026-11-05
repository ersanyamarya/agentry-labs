// Turns lib data into list rows: { id, label, segments?, note?, details[], file?, header?, kind?, ... }. Pure, so tabs
// and tests share it. `segments` ([{ text, style }], see theme.mjs) is the coloured right-hand side of a row and `note`
// is the same text without colour. Everything shown here already passed through lib/mask.mjs (the inventory readers
// mask before returning).

import { formatAge, formatBytes } from "../lib/backups.js";
import type { CatalogEntry } from "../lib/catalog.js";
import type { SkillItem } from "../lib/types.js";

type Skill = SkillItem;
import { badgeText, costStyle, SCOPE_NAMES, scopeStyle, seg, SEVERITY, stateStyle } from "./theme.js";
import type { Cell, Data, KeyHint, Row, Seg, Style } from "./types.js";

const tokens = (count: number | null | undefined) => (count === null || count === undefined ? "-" : `~${count}`);

const DIM: Style = { dimColor: true };
const cost = (count: number | null | undefined) => seg(tokens(count), costStyle(count));
const badge = (text: string) => seg(badgeText(text), { ...stateStyle(text), bold: true });
const scopeBadge = (scope: string) => seg(SCOPE_NAMES[scope] ?? scope, scopeStyle(scope));
// A fixed-width column of a row: parts ([seg...]) padded to `width`, left or right aligned. See components/list.mjs.
const cell = (parts: Seg | Seg[], width: number, align: "left" | "right" = "left"): Cell => ({ parts: [parts].flat().filter(Boolean), width, align });
// A row's columns and their plain text (for tests and text captures).
const withCells = (cells: Cell[]) => ({ cells, note: cells.map((one) => one.parts.map((part) => part.text).join("")).join("  ").trim() });
// Skills tab: count, cost, then two state columns (P and G for shelf rows; scope and state for plugin skills).
const skillCells = (info: string | Seg, count: number | null | undefined, first?: Seg | Seg[], second?: Seg | Seg[]) => withCells([cell(typeof info === "string" ? (info ? seg(info, DIM) : []) : info, 9), cell(cost(count), 5, "right"), cell(first ?? [], 11), cell(second ?? [], 11)]);

// The footer keys of the selected Skills row: only what works on it. [key, text, short text].
export const skillKeys = (row: Row | undefined): KeyHint[] => {
	const both: KeyHint[] = [["space", "project on/off", "project"], ["g", "global on/off", "global"]];
	if (row?.kind === "group") {
		return [...both, ["enter", "expand"]];
	}
	if (row?.kind === "skill") {
		return [...both, ["u", "unshelve"], ["x", "remove"], ["X", "remove, no copy", "no copy"], ["e", "open file", "edit"]];
	}
	if (row?.plugin) {
		return [["space", "enable/disable plugin", "on/off"]];
	}
	if (row?.projectOnly) {
		return [["a", "move to all projects", "all projects"], ["x", "remove"], ["X", "remove, no copy", "no copy"], ["e", "open file", "edit"]];
	}
	if (row?.shelvable) {
		return [["s", "shelve"], ["o", "move to this project only", "this project"], ["x", "remove"], ["X", "remove, no copy", "no copy"], ["e", "open file", "edit"]];
	}
	return row?.file ? [["e", "open file", "edit"]] : [];
};

const itemState = (item: Record<string, unknown>, field: string) => (item[field] ? "on" : "off");

// on when every item is linked in that scope, partial for some, off for none.
const groupState = (group: { items: Record<string, unknown>[] }, field: string) => (group.items.length > 0 && group.items.every((item) => item[field]) ? "on" : group.items.some((item) => item[field]) ? "partial" : "off");

const skillDetails = (skill: Skill) => [
	`skill: ${skill.name}`,
	`scope: ${SCOPE_NAMES[skill.scope] ?? skill.scope}${skill.plugin ? ` (${skill.plugin})` : ""}`,
	`state: ${badgeText(skill.state)}`,
	`tokens: ${tokens(skill.tokens)} (description)`,
	`source: ${skill.source}`,
	...(skill.target ? [`links to: ${skill.target}`] : []),
];

// Why a loaded (non-shelf) skill row cannot be toggled, shown in the status line and the details.
const whyFixed = (skill: Skill) => {
	if (skill.scope === "project") {
		return "project skill (this repo's .claude/skills): e opens it, a moves it to ~/.claude/skills (all projects)";
	}
	if (skill.kind === "file") {
		return "global skill (~/.claude/skills, every project): s moves it to the shelf (on per project), o moves it into this project only";
	}
	return skill.kind === "broken" ? "broken skill: see the Doctor tab" : "global skill is a symlink, not a folder: shelve moves folders only";
};

// What the loaded skill descriptions cost, per place they come from. Shelf skills count under the scope they are linked in.
export const tokenBreakdown = (data: Data) => {
	const loaded = data.status.skills.items.filter((skill) => skill.state === "active");
	const sum = (keep: (skill: Skill) => boolean) => loaded.filter(keep).reduce((total, skill) => total + (skill.tokens ?? 0), 0);
	const parts = { global: sum((skill) => skill.scope === "user"), project: sum((skill) => skill.scope === "project"), plugins: sum((skill) => skill.scope === "plugin") };
	return { ...parts, total: parts.global + parts.project + parts.plugins };
};

const header = (id: string, label: string, extra: Partial<Row> = {}): Row => ({ id, header: true, label, ...extra });
// A blank, unselectable row between sections.
const spacer = (id: string): Row => ({ id: `sp:${id}`, header: true, blank: true, label: "" });

// Shelf groups (expandable), then what loads from global, project and plugin folders.
export const skillRows = (data: Data, expanded: Set<string> = new Set()) => {
	const rows: Row[] = [header("h:shelf", "Shelf", withCells([cell(seg("Skills", DIM), 9), cell(seg("Cost", DIM), 5, "right"), cell(seg("Project", DIM), 11), cell(seg("Global", DIM), 11)]))];
	if (data.groups.length === 0) {
		rows.push({ id: "none:shelf", label: "  (no shelf groups)", details: ["Shelved skills live in <config dir>/skill-shelf/<group>/<skill>."] });
	}
	for (const group of data.groups) {
		const skills = group.items.filter((item) => item.kind === "skills");
		const agents = group.items.length - skills.length;
		const open = expanded.has(group.name);
		const [pState, gState] = [groupState(group, "project"), groupState(group, "global")];
		rows.push({
			id: `group:${group.name}`,
			kind: "group",
			group: group.name,
			target: group.name,
			label: `${open ? "▾" : "▸"} ${group.name}`,
			...skillCells(`${skills.length} skills`, group.tokens, badge(pState), badge(gState)),
			projectOn: group.items.some((item) => item.project),
			globalOn: group.items.some((item) => item.global),
			details: [`shelf group: ${group.name} (opt-in)`, `this project: ${badgeText(pState)}`, `global: ${badgeText(gState)}`, `contains: ${skills.length} skills${agents > 0 ? `, ${agents} agent${agents > 1 ? "s" : ""}` : ""}`, `cost when on: ${tokens(group.tokens)} tokens`, "toggle: space = this project, g = global; enter expands"],
		});
		if (open) {
			for (const item of group.items) {
				const isSkill = item.kind === "skills";
				rows.push({
					id: `item:${group.name}/${item.kind}/${item.name}`,
					kind: isSkill ? "skill" : "agent",
					group: group.name,
					target: isSkill ? `${group.name}/${item.name}` : undefined,
					label: `    ${item.name}${isSkill ? "" : " (agent)"}`,
					...skillCells(isSkill ? scopeBadge("shelf") : seg("agent", DIM), item.tokens, badge(itemState(item, "project")), badge(itemState(item, "global"))),
					projectOn: item.project,
					globalOn: item.global,
					shelved: isSkill,
					skill: item.name,
					details: [`${isSkill ? "skill" : "agent"}: ${item.name}`, `group: ${group.name}`, `this project: ${badgeText(itemState(item, "project"))}`, `global: ${badgeText(itemState(item, "global"))}`, `tokens: ${tokens(item.tokens)}`, `source: ${item.source}`, isSkill ? "toggle: shelf skill (opt-in): space = this project, g = global; u unshelves" : "toggle: agents switch with their group"],
					file: isSkill ? `${item.source}/SKILL.md` : item.source,
				});
			}
		}
	}

	const loaded = data.status.skills.items.filter((skill) => !skill.shelfGroup);
	const section = <T,>(title: string, list: T[], label: (item: T) => Row) => {
		if (list.length > 0) {
			rows.push(spacer(title), header(`h:${title}`, title));
			rows.push(...list.map(label));
		}
	};
	const own = (scope: string) => loaded.filter((skill) => skill.scope === scope);
	const skillRow = (skill: Skill): Row => ({
		id: `skill:${skill.scope}:${skill.source}`,
		kind: skill.scope === "user" ? "global" : "loaded",
		shelvable: skill.kind === "file" && skill.scope === "user",
		projectOnly: skill.kind === "file" && skill.scope === "project",
		skill: skill.source.split("/").at(-1),
		why: whyFixed(skill),
		label: `  ${skill.name}`,
		...withCells([cell([], 9), cell(cost(skill.tokens), 5, "right"), cell(skill.scope === "project" ? badge(skill.state) : [], 11), cell(skill.scope === "project" ? [] : badge(skill.state), 11)]),
		details: [...skillDetails(skill), `toggle: ${whyFixed(skill)}`],
		file: skill.kind === "broken" ? undefined : `${skill.source}/SKILL.md`,
	});
	section("Global skills", own("user"), skillRow);
	section("This project only", own("project"), skillRow);
	const plugins = data.status.plugins.items.filter((plugin) => loaded.some((skill) => skill.plugin === plugin.id));
	section("Plugin skills", plugins, (plugin) => {
		const mine = loaded.filter((skill) => skill.plugin === plugin.id);
		return {
			id: `plugin-skills:${plugin.id}`,
			kind: "loaded",
			plugin: plugin.id,
			enabled: plugin.state === "active",
			label: `  ${plugin.name}:*`,
			...skillCells(`${mine.length} skills`, plugin.skillTokens, scopeBadge("plugin"), badge(plugin.state)),
			details: [`plugin: ${plugin.id}`, `state: ${badgeText(plugin.state)}`, `skills: ${mine.map((skill) => skill.name.split(":").pop()).join(", ")}`, `tokens: ${tokens(plugin.skillTokens)}`, `source: ${plugin.installPath}`, "toggle: plugin skill (comes with a plugin): space toggles the plugin", `note: ${PLUGIN_NOTE}`],
		};
	});
	const sum = tokenBreakdown(data);
	rows.push(spacer("totals"), header("h:totals", "Totals"), {
		id: "total:tokens",
		kind: "total",
		label: "  Token total (every session)",
		...skillCells("", sum.total, [], []),
		details: [`total: ~${sum.total} tokens of skill descriptions loaded in every session`, `in global: ~${sum.global}`, `in this project: ~${sum.project}`, `from plugins: ~${sum.plugins}`, "note: counts skills that are on (shelf skills under the scope they are linked in); off skills, MCP, hooks and rule files cost 0 here (rule files: Rules tab)."],
	});
	return rows;
};

// Agents and MCP servers also install to this project (o); an outdated skill, agent or rule can be updated (u).
export const catalogKeys = (row: Row | undefined): KeyHint[] => {
	if (row?.kind !== "catalog") {
		return [["f", "fetch catalog", "fetch"]];
	}
	const where = row.itemKind === "agent" || row.itemKind === "mcp";
	return [
		["i", row.itemKind === "skill" ? "add to shelf" : where ? "add (all projects)" : "add", "add"],
		...(where ? [(["o", "add to this project", "project"] as KeyHint)] : []),
		...(row.outdated ? [["u", "update"] as KeyHint] : []),
		...((row.itemKind === "skill" || row.itemKind === "agent" || row.itemKind === "rule") && row.installed ? ([["x", "remove"], ["X", "remove, no copy", "no copy"]] as KeyHint[]) : []),
		["f", "update catalog", "fetch"],
	];
};

const ITEM_SECTIONS: [string, string][] = [["agent", "Agents"], ["rule", "Rules"], ["claude-md", "CLAUDE.md files"], ["mcp", "MCP servers"]];

const catalogToggle = (item: CatalogEntry) =>
	({
		skill: item.installed ? "x removes it (a copy is kept in the backups)" : "i copies it onto the shelf, off; turn it on from the Skills tab",
		agent: "i copies it to ~/.claude/agents (every project), o to this project's .claude/agents; never overwrites",
		rule: "i copies it to ~/.claude/rules; never overwrites",
		"claude-md": "i copies it to this project as CLAUDE.md, only when the project has none",
		mcp: "i adds it to your user config (claude mcp add-json), o to this project's .mcp.json; the preview masks secrets",
	})[item.kind] + (item.installed && (item.kind === "agent" || item.kind === "rule") ? "; x removes it (a copy is kept in the backups)" : "") + (item.outdated ? (item.kind === "mcp" ? "; u sets the catalog's args and any env key you lack (masked preview, backed up, undoable)" : "; u overwrites the installed copy with the catalog's (previewed, the old copy is saved first)") : "");

const catalogRow = (item: CatalogEntry): Row => {
	const installed = item.installed;
	return {
		id: `catalog:${item.id}`,
		kind: "catalog",
		item: item.id,
		itemKind: item.kind,
		installed,
		outdated: item.outdated,
		target: item.shelf ? `${item.shelf}/${item.name}` : item.name,
		installs: item.installs,
		label: `  ${item.name}`,
		...withCells([cell(cost(item.tokens), 5, "right"), cell(installed ? [seg(`● ${installed}`, { color: "green", bold: true }), ...(item.outdated ? [seg(" outdated", { color: "yellow", bold: true })] : [])] : seg("not installed", DIM), 24)]),
		details: [`item: ${item.id}`, `bundle: ${item.bundle}`, `installed: ${installed ?? "no"}`, ...(item.outdated ? ["status: outdated (a file differs from the catalog copy)"] : []), `tokens: ${item.tokens === null ? "-" : `${tokens(item.tokens)} (${item.kind === "skill" || item.kind === "agent" ? "description" : "whole file"})`}`, `note: ${item.description || "(no description)"}`, `toggle: ${catalogToggle(item)}`],
	};
};

// The skills by bundle, then agents, rules, CLAUDE.md files and MCP servers; installed ones show where they are.
export const catalogRows = (data: Data): Row[] => {
	const { fetched, entries } = data.catalog;
	if (!fetched) {
		return [{ id: "none:catalog", label: "  (catalog not fetched)", details: ["The agentry-labs catalog is not on this machine yet.", "toggle: press f to fetch it (a shallow git clone of github.com/ersanyamarya/agentry-labs, cached; needs network)."] }];
	}
	const rows: Row[] = [];
	let bundle: string | undefined;
	for (const skill of entries.filter((entry) => entry.kind === "skill")) {
		if (skill.bundle !== bundle) {
			bundle = skill.bundle;
			rows.push(...(rows.length > 0 ? [spacer(bundle)] : []), header(`h:${bundle}`, `${bundle} bundle`));
		}
		rows.push(catalogRow(skill));
	}
	for (const [kind, title] of ITEM_SECTIONS) {
		const list = entries.filter((entry) => entry.kind === kind);
		if (list.length > 0) {
			rows.push(...(rows.length > 0 ? [spacer(kind)] : []), header(`h:${kind}`, title), ...list.map(catalogRow));
		}
	}
	return rows;
};

export const ruleKeys = (row: Row | undefined): KeyHint[] => (row?.ruleFile ? [["x", "remove"], ["X", "remove, no copy", "no copy"], ["e", "open file", "edit"]] : []);

// CLAUDE.md and rule files Claude Code loads every session (lib/rules.mjs), user then project, with their whole-file cost.
export const ruleRows = (data: Data): Row[] => {
	if (data.rules.length === 0) {
		return [{ id: "none:rules", label: "  (no CLAUDE.md or rule files)", details: ["No ~/.claude/CLAUDE.md, ~/.claude/rules/*.md, CLAUDE.md or .claude/rules/*.md was found.", "note: the Catalog tab can add a rule (~/.claude/rules) or a CLAUDE.md file."] }];
	}
	const rows = [header("h:rules", "Files", withCells([cell(seg("Cost", DIM), 5, "right"), cell(seg("Kind", DIM), 9)]))];
	for (const [scope, title] of [["user", "User"], ["project", "This project"]]) {
		const list = data.rules.filter((entry) => entry.scope === scope);
		if (list.length > 0) {
			rows.push(spacer(scope), header(`h:${scope}`, title));
			rows.push(
				...list.map((entry) => ({
					id: `rule:${entry.id}`,
					ruleFile: entry.path,
					ruleTitle: entry.title,
					label: `  ${entry.label}`,
					...withCells([cell(cost(entry.tokens), 5, "right"), cell(seg(entry.kind === "rule" ? "rule" : "CLAUDE.md", DIM), 9)]),
					details: [`file: ${entry.label}`, `scope: ${title}`, `kind: ${entry.kind === "rule" ? "rule" : "CLAUDE.md"}`, `tokens: ${tokens(entry.tokens)} (whole file)`, `path: ${entry.path}`, "note: loaded into every session of this scope; a rule with a paths: header loads only for matching files, which this estimate does not account for.", "toggle: x removes it (a copy is kept in the backups)"],
					file: entry.path,
				})),
			);
		}
	}
	return rows;
};

export const BACKUPS_KEYS: KeyHint[] = [["d", "delete 30+ days old", "prune"]];

export const backupKeys = (row: Row | undefined): KeyHint[] => [...(row?.backup ? [...(row.restorable ? [["u", "restore"] as KeyHint] : []), ["x", "delete"] as KeyHint] : []), ...BACKUPS_KEYS];

// Fix sets and removed-skill copies, newest first.
export const backupRows = (data: Data): Row[] =>
	data.backups.length === 0
		? [{ id: "none:backups", label: "  (no backups)", details: ["Nothing is kept under ~/.claude/backups/agentry yet.", "note: fixes (agentry fix) and skill removals leave a copy here; this tab restores or deletes them."] }]
		: data.backups.map((entry) => ({
				id: `backup:${entry.id}`,
				backup: entry.id,
				restorable: entry.kind === "removed" && Boolean(entry.from),
				label: `  ${entry.name}`,
				...withCells([cell(seg(entry.kind === "fix" ? "fix set" : "removed", DIM), 8), cell(seg(formatBytes(entry.bytes), DIM), 9, "right"), cell(seg(formatAge(entry.days), DIM), 6, "right")]),
				details: [`backup: ${entry.id}`, `kind: ${entry.kind === "fix" ? "fix set" : entry.detail.replace(/,.*/, "")}`, `made: ${entry.date}`, `size: ${formatBytes(entry.bytes)}`, `path: ${entry.path}`, ...(entry.from ? [`from: ${entry.from}`] : []), `note: ${entry.detail}`, entry.kind === "fix" ? "toggle: x deletes it for good" + (entry.undone ? "" : " (fix --undo can then no longer restore it)") : `toggle: ${entry.from ? "u moves it back (never overwrites), " : ""}x deletes it for good`],
			}));

export const PLUGIN_NOTE = "applies to new sessions";

export const mcpKeys = (row: Row | undefined): KeyHint[] => [["a", "add server", "add"], ...(row?.mcp ? [...(row.mcpUser ? [["s", "edit env/args", "edit"] as KeyHint] : []), ["x", "remove"] as KeyHint, ["space", row.mcpEnable ? (row.mcpProject ? "turn on here" : "add back") : row.mcpProject ? "turn off here" : "turn off (saved)", row.mcpEnable ? "on" : "off"] as KeyHint] : []), ...(row?.file ? [["e", "open file", "edit"] as KeyHint] : [])];

// Hooks: settings hooks switch off/on and can be removed; plugin hooks only open their file.
export const hookKeys = (row: Row | undefined): KeyHint[] => [...(row?.hook ? ([["space", row.hookOff ? "turn on" : "turn off (saved)", row.hookOff ? "on" : "off"], ["x", "remove"]] as KeyHint[]) : []), ...(row?.file ? [["e", "open file", "edit"] as KeyHint] : [])];

const MCP_WHY: Record<string, string> = {
	plugin: "plugin server: managed by the plugin, switch the plugin instead",
	project: "project server (.mcp.json): managed by the repo, approval is in Claude Code",
	local: "local-scope server: this tool only handles user scope",
	"desktop-config": "desktop server: managed by Claude desktop",
	"desktop-extension": "desktop extension: managed by Claude desktop",
};

export const mcpRows = (data: Data): Row[] => [
	...data.status.mcp.servers.map((server) => {
		const target = server.url ?? [server.command, ...(server.args ?? [])].join(" ");
		const env = Object.entries(server.env ?? {}).map(([key, value]) => `env ${key}=${value}`);
		const headers = Object.entries(server.headers ?? {}).map(([key, value]) => `header ${key}: ${value}`);
		const mine = server.scope === "user" || ["plugin", "project", "local"].includes(server.scope);
		return {
			id: `mcp:${server.scope}:${server.name}:${server.source}`,
			label: server.name,
			...(mine ? { mcp: server.name, mcpUser: server.scope === "user", mcpEnable: server.scope !== "user" && server.state === "disabled", mcpProject: server.scope !== "user" } : { why: MCP_WHY[server.scope] }),
			...withCells([cell(scopeBadge(server.scope), 8), cell(badge(server.state), 16), cell(seg(server.transport, DIM), 5)]),
			file: server.source,
			details: [`server: ${server.name}`, `scope: ${server.scope}`, `state: ${badgeText(server.state)}`, `transport: ${server.transport}`, `${server.url ? "url" : "command"}: ${target}`, ...env, ...headers, `tokens: not measured (tool lists)`, `source: ${server.source}`, `toggle: ${mine ? (server.scope === "user" ? "space turns it off (removes it from user scope, config saved), s edits env and args; undo with agentry fix --undo" : "space turns it off for this project only (disabledMcpServers in ~/.claude.json); space again turns it on") : MCP_WHY[server.scope] ?? "not managed here"}`],
		};
	}),
	...(Array.isArray(data.parked) ? data.parked : []).map((entry) => ({
		id: `parked:${entry.name}`,
		label: entry.name,
		mcp: entry.name,
		mcpEnable: true,
		...withCells([cell(scopeBadge("user"), 8), cell(badge("off"), 16), cell(seg("-", DIM), 5)]),
		details: [`server: ${entry.name}`, "scope: user", `state: ${badgeText("off")} (config saved)`, `config: ${entry.summary}`, `turned off: ${entry.parkedAt ?? "-"}`, "toggle: space adds it back to user scope (claude mcp add-json from the saved copy)"],
	})),
];

const HOOK_WHY = "plugin hook: the plugin manages it; turn the plugin off in the Plugins tab";

export const hookRows = (data: Data): Row[] => [
	...data.status.hooks.items.map((hook, index) => {
		const mine = hook.scope !== "plugin" && hook.id;
		return {
			id: `hook:${index}:${hook.source}`,
			label: `${hook.event}  ${hook.matcher}`,
			...(mine ? { hook: hook.id, hookScope: hook.scope, hookOff: false } : { why: HOOK_WHY }),
			...withCells([cell(scopeBadge(hook.scope), 8), cell(badge(hook.state), 10)]),
			file: hook.source,
			details: [`id: ${hook.id ?? "-"}`, `event: ${hook.event}`, `matcher: ${hook.matcher}`, `type: ${hook.type}`, `command: ${hook.command ?? `(${hook.type})`}`, `scope: ${hook.scope}${hook.plugin ? ` (${hook.plugin})` : ""}`, `state: ${hook.state}`, `output: not measured`, `source: ${hook.source}`, `toggle: ${mine ? "space turns it off (moved to ~/.claude/agentry/parked-hooks.json), x removes it; undo with agentry fix --undo" : HOOK_WHY}`],
		};
	}),
	...(Array.isArray(data.parkedHooks) ? data.parkedHooks : []).map((hook) => ({
		id: `parked-hook:${hook.scope}:${hook.id}`,
		label: `${hook.event}  ${hook.matcher}`,
		hook: hook.id,
		hookScope: hook.scope,
		hookOff: true,
		...withCells([cell(scopeBadge(hook.scope), 8), cell(badge("off"), 10)]),
		file: hook.source,
		details: [`id: ${hook.id}`, `event: ${hook.event}`, `matcher: ${hook.matcher}`, `command: ${hook.command ?? `(${hook.type})`}`, `scope: ${hook.scope}`, `state: ${badgeText("off")} (saved copy)`, `turned off: ${hook.parkedAt ?? "-"}`, `was in: ${hook.source}`, "toggle: space puts it back in that settings file, x deletes the saved copy"],
	})),
];

export const pluginKeys = (row: Row | undefined): KeyHint[] => [["space", "enable/disable", "on/off"], ["i", "install a plugin", "install"], ...((row?.pluginScopes?.length ?? 0) > 0 ? [["x", "uninstall"] as KeyHint] : []), ["e", "open file", "edit"]];

export const pluginRows = (data: Data): Row[] =>
	data.status.plugins.items.map((plugin) => ({
		id: `plugin:${plugin.id}`,
		plugin: plugin.id,
		pluginScopes: plugin.installs.filter((install) => install.appliesHere).map((install) => install.scope),
		enabled: plugin.state === "active",
		label: plugin.id,
		...withCells([cell(plugin.installScope ? scopeBadge(plugin.installScope) : [], 8), cell(seg(plugin.version ?? "", DIM), 8), cell(badge(plugin.state), 10)]),
		file: plugin.enabledBy?.source,
		details: [
			`plugin: ${plugin.id}`,
			`version: ${plugin.version ?? "unknown"}`,
			`state: ${badgeText(plugin.state)}`,
			`skill tokens: ${tokens(plugin.skillTokens)}`,
			...plugin.installs.map((install) => `install: ${install.scope}${install.projectPath ? ` ${install.projectPath}` : ""}${install.appliesHere ? "" : " (other project)"}`),
			`enabled by: ${plugin.enabledBy?.source ?? "-"}`,
			`path: ${plugin.installPath ?? "not installed"}`,
			`toggle: space ${plugin.state === "active" ? "disables" : "enables"} it; x uninstalls it, i installs another`,
			`note: ${PLUGIN_NOTE}`,
		],
	}));

export const DOCTOR_KEYS: KeyHint[] = [["enter", "preview fix", "fix"], ["u", "undo last fix set", "undo"], ["e", "open file", "edit"]];

export const doctorRows = (data: Data): Row[] => {
	const rows: Row[] = [];
	for (const severity of ["error", "warning", "info"] as const) {
		const mine = data.doctor.findings.filter((finding) => finding.severity === severity);
		if (mine.length === 0) {
			continue;
		}
		const { icon, style, heading } = SEVERITY[severity];
		rows.push(...(rows.length > 0 ? [spacer(severity)] : []), header(`h:${severity}`, `${icon} ${heading} (${mine.length})`, { severity, labelStyle: style }));
		mine.forEach((finding, index) => {
			rows.push({
				id: `finding:${finding.id}:${finding.file}:${index}`,
				kind: "finding",
				severity,
				finding,
				label: `  ${icon} [${finding.id}] ${finding.message}`,
				labelStyle: style,
				file: finding.file,
				details: [`${severity}: [${finding.id}]`, finding.message, `file: ${finding.file}${finding.line ? `:${finding.line}` : ""}`, ...(finding.fix ? [`advice: ${finding.fix}`] : ["advice: none from doctor"])],
			});
		});
	}
	return rows;
};
