// Turns lib data into list rows: { id, label, segments?, note?, details[], file?, header?, kind?, ... }. Pure, so tabs
// and tests share it. `segments` ([{ text, style }], see theme.mjs) is the coloured right-hand side of a row and `note`
// is the same text without colour. Everything shown here already passed through lib/mask.mjs (the inventory readers
// mask before returning).

import { formatAge, formatBytes } from "../lib/backups.mjs";
import { badgeText, costStyle, plain, SCOPE_NAMES, scopeStyle, seg, SEVERITY, stateStyle } from "./theme.mjs";

const tokens = (count) => (count === null || count === undefined ? "-" : `~${count}`);

const DIM = { dimColor: true };
const cost = (count) => seg(tokens(count), costStyle(count));
const badge = (text) => seg(badgeText(text), { ...stateStyle(text), bold: true });
const scopeBadge = (scope) => seg(SCOPE_NAMES[scope] ?? scope, scopeStyle(scope));
// A fixed-width column of a row: parts ([seg...]) padded to `width`, left or right aligned. See components/list.mjs.
const cell = (parts, width, align = "left") => ({ parts: [parts].flat().filter(Boolean), width, align });
const blank = (width) => cell([], width);
// A row's columns and their plain text (for tests and text captures).
const withCells = (cells) => ({ cells, note: cells.map((one) => one.parts.map((part) => part.text).join("")).join("  ").trim() });
// Skills tab: count, cost, then two state columns (P and G for shelf rows; scope and state for plugin skills).
const skillCells = (info, count, first, second) => withCells([cell(typeof info === "string" ? (info ? seg(info, DIM) : []) : info, 9), cell(cost(count), 5, "right"), cell(first ?? [], 11), cell(second ?? [], 11)]);

// The footer keys of the selected Skills row: only what works on it. [key, text, short text].
export const skillKeys = (row) => {
	const both = [["space", "project on/off", "project"], ["g", "global on/off", "global"]];
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
		return [["x", "remove"], ["X", "remove, no copy", "no copy"], ["e", "open file", "edit"]];
	}
	if (row?.shelvable) {
		return [["s", "shelve"], ["x", "remove"], ["X", "remove, no copy", "no copy"], ["e", "open file", "edit"]];
	}
	return row?.file ? [["e", "open file", "edit"]] : [];
};

const itemState = (item, field) => (item[field] ? "on" : "off");

// on when every item is linked in that scope, partial for some, off for none.
const groupState = (group, field) => (group.items.length > 0 && group.items.every((item) => item[field]) ? "on" : group.items.some((item) => item[field]) ? "partial" : "off");

const skillDetails = (skill) => [
	`skill: ${skill.name}`,
	`scope: ${SCOPE_NAMES[skill.scope] ?? skill.scope}${skill.plugin ? ` (${skill.plugin})` : ""}`,
	`state: ${badgeText(skill.state)}`,
	`tokens: ${tokens(skill.tokens)} (description)`,
	`source: ${skill.source}`,
	...(skill.target ? [`links to: ${skill.target}`] : []),
];

// Why a loaded (non-shelf) skill row cannot be toggled, shown in the status line and the details.
const whyFixed = (skill) => {
	if (skill.scope === "project") {
		return "project skill (this repo's .claude/skills): edit it in the repo, e opens it";
	}
	if (skill.kind === "file") {
		return "global skill (~/.claude/skills, every project): s moves it to the shelf, where it can be turned on per project";
	}
	return skill.kind === "broken" ? "broken skill: see the Doctor tab" : "global skill is a symlink, not a folder: shelve moves folders only";
};

const header = (id, label, extra = {}) => ({ id, header: true, label, ...extra });
// A blank, unselectable row between sections.
const spacer = (id) => ({ id: `sp:${id}`, header: true, blank: true, label: "" });

// Shelf groups (expandable), then what loads from global, project and plugin folders.
export const skillRows = (data, expanded = new Set()) => {
	const rows = [header("h:shelf", "Shelf", withCells([cell(seg("Skills", DIM), 9), cell(seg("Cost", DIM), 5, "right"), cell(seg("Project", DIM), 11), cell(seg("Global", DIM), 11)]))];
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
	const section = (title, list, label) => {
		if (list.length > 0) {
			rows.push(spacer(title), header(`h:${title}`, title));
			rows.push(...list.map(label));
		}
	};
	const own = (scope) => loaded.filter((skill) => skill.scope === scope);
	const skillRow = (skill) => ({
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
	return rows;
};

export const catalogKeys = (row) => {
	if (row?.kind !== "catalog") {
		return [["f", "fetch catalog", "fetch"]];
	}
	return [...(row.installed ? [["x", "remove"], ["X", "remove, no copy", "no copy"]] : [["i", "add to shelf", "add"]]), ["f", "update catalog", "fetch"]];
};

// The agentry-labs skills by bundle; installed ones show where they are.
export const catalogRows = (data) => {
	const { fetched, entries } = data.catalog;
	if (!fetched) {
		return [{ id: "none:catalog", label: "  (catalog not fetched)", details: ["The agentry-labs skill catalog is not on this machine yet.", "toggle: press f to fetch it (a shallow git clone of github.com/ersanyamarya/agentry-labs, cached; needs network)."] }];
	}
	const rows = [];
	let bundle;
	for (const skill of entries) {
		if (skill.bundle !== bundle) {
			bundle = skill.bundle;
			rows.push(...(rows.length > 0 ? [spacer(bundle)] : []), header(`h:${bundle}`, `${bundle} bundle`));
		}
		const where = skill.shelf ? `shelf/${skill.shelf}` : skill.global ? "global" : undefined;
		rows.push({
			id: `catalog:${skill.name}`,
			kind: "catalog",
			skill: skill.name,
			installed: where,
			target: skill.shelf ? `${skill.shelf}/${skill.name}` : skill.name,
			label: `  ${skill.name}`,
			...withCells([cell(cost(skill.tokens), 5, "right"), cell(where ? seg(`● ${where}`, { color: "green", bold: true }) : seg("not installed", DIM), 20)]),
			details: [`skill: ${skill.name}`, `bundle: ${skill.bundle}`, `installed: ${where ?? "no"}`, `tokens: ${tokens(skill.tokens)} (description)`, `note: ${skill.description || "(no description)"}`, `toggle: ${where ? "x removes it (a copy is kept in the backups)" : "i copies it onto the shelf, off; turn it on from the Skills tab"}`],
		});
	}
	return rows;
};

export const BACKUPS_KEYS = [["d", "delete 30+ days old", "prune"]];

export const backupKeys = (row) => [...(row?.backup ? [...(row.restorable ? [["u", "restore"]] : []), ["x", "delete"]] : []), ...BACKUPS_KEYS];

// Fix sets and removed-skill copies, newest first.
export const backupRows = (data) =>
	data.backups.length === 0
		? [{ id: "none:backups", label: "  (no backups)", details: ["Nothing is kept under ~/.claude/backups/agentry yet.", "note: fixes (agentry fix) and skill removals leave a copy here; this tab restores or deletes them."] }]
		: data.backups.map((entry) => ({
				id: `backup:${entry.id}`,
				backup: entry.id,
				restorable: entry.kind === "removed" && Boolean(entry.from),
				label: `  ${entry.name}`,
				...withCells([cell(seg(entry.kind === "fix" ? "fix set" : "removed", DIM), 8), cell(seg(formatBytes(entry.bytes), DIM), 9, "right"), cell(seg(formatAge(entry.days), DIM), 6, "right")]),
				details: [`backup: ${entry.id}`, `kind: ${entry.kind === "fix" ? "fix set" : "removed skill"}`, `made: ${entry.date}`, `size: ${formatBytes(entry.bytes)}`, `path: ${entry.path}`, ...(entry.from ? [`from: ${entry.from}`] : []), `note: ${entry.detail}`, entry.kind === "fix" ? "toggle: x deletes it for good" + (entry.undone ? "" : " (fix --undo can then no longer restore it)") : `toggle: ${entry.from ? "u moves it back (never overwrites), " : ""}x deletes it for good`],
			}));

export const PLUGIN_NOTE = "applies to new sessions";

export const mcpKeys = (row) => [["a", "add server", "add"], ...(row?.mcp ? [...(row.mcpUser ? [["s", "edit env/args", "edit"]] : []), ["x", "remove"], ["space", row.mcpEnable ? (row.mcpProject ? "turn on here" : "add back") : row.mcpProject ? "turn off here" : "turn off (saved)", row.mcpEnable ? "on" : "off"]] : []), ...(row?.file ? [["e", "open file", "edit"]] : [])];

// Hooks: settings hooks switch off/on and can be removed; plugin hooks only open their file.
export const hookKeys = (row) => [...(row?.hook ? [["space", row.hookOff ? "turn on" : "turn off (saved)", row.hookOff ? "on" : "off"], ["x", "remove"]] : []), ...(row?.file ? [["e", "open file", "edit"]] : [])];

const MCP_WHY = {
	plugin: "plugin server: managed by the plugin, switch the plugin instead",
	project: "project server (.mcp.json): managed by the repo, approval is in Claude Code",
	local: "local-scope server: this tool only handles user scope",
	"desktop-config": "desktop server: managed by Claude desktop",
	"desktop-extension": "desktop extension: managed by Claude desktop",
};

export const mcpRows = (data) => [
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

export const hookRows = (data) => [
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

export const PLUGINS_KEYS = [["space", "enable/disable", "on/off"], ["e", "open file", "edit"]];

export const pluginRows = (data) =>
	data.status.plugins.items.map((plugin) => ({
		id: `plugin:${plugin.id}`,
		plugin: plugin.id,
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
			`toggle: space ${plugin.state === "active" ? "disables" : "enables"} it`,
			`note: ${PLUGIN_NOTE}`,
		],
	}));

export const DOCTOR_KEYS = [["enter", "preview fix", "fix"], ["u", "undo last fix set", "undo"], ["e", "open file", "edit"]];

export const doctorRows = (data) => {
	const rows = [];
	for (const severity of ["error", "warning", "info"]) {
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
