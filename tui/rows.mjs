// Turns lib data into list rows: { id, label, segments?, note?, details[], file?, header?, kind?, ... }. Pure, so tabs
// and tests share it. `segments` ([{ text, style }], see theme.mjs) is the coloured right-hand side of a row and `note`
// is the same text without colour. Everything shown here already passed through lib/mask.mjs (the inventory readers
// mask before returning).

import { badgeText, costStyle, plain, SCOPE_NAMES, scopeStyle, seg, SEVERITY, stateStyle } from "./theme.mjs";

const tokens = (count) => (count === null || count === undefined ? "-" : `~${count}`);

const DIM = { dimColor: true };
const gap = seg("  ");
const cost = (count, suffix = "") => seg(`${tokens(count)}${suffix}`, costStyle(count));
const badge = (text) => seg(badgeText(text), { ...stateStyle(text), bold: true });
const scopeBadge = (scope) => seg(SCOPE_NAMES[scope] ?? scope, scopeStyle(scope));
// "P ● on" / "G ○ off": the state of a shelf row in this project and globally.
const where = (letter, state) => [seg(`${letter} `, DIM), badge(state)];
// A row's right-hand side from segments, separated by two spaces; `note` is its plain text.
// A part may be an array of segments that stay together (no gap inside).
const withNote = (parts) => {
	const segments = parts.flatMap((part, index) => (index === 0 ? [part].flat() : [gap, ...[part].flat()]));
	return { segments, note: plain(segments) };
};

export const SKILLS_KEYS = [["space", "toggle P (project)"], ["G", "toggle global"], ["s", "shelve"], ["u", "unshelve"], ["enter", "expand"]];

const itemState = (item, field) => (item[field] ? "on" : "off");

// on when every item is linked in that scope, partial for some, off for none.
const groupState = (group, field) => (group.items.length > 0 && group.items.every((item) => item[field]) ? "on" : group.items.some((item) => item[field]) ? "partial" : "off");

const skillDetails = (skill) => [
	`skill: ${skill.name}`,
	`scope: ${skill.scope}${skill.plugin ? ` (${skill.plugin})` : ""}`,
	`state: ${badgeText(skill.state)}`,
	`tokens: ${tokens(skill.tokens)} (description)`,
	`source: ${skill.source}`,
	...(skill.target ? [`links to: ${skill.target}`] : []),
];

// Why a loaded (non-shelf) skill row cannot be toggled, shown in the status line and the details.
const whyFixed = (skill) => {
	if (skill.scope === "project") {
		return "project skill (this repo's .claude/skills): edit it in the repo";
	}
	if (skill.kind === "file") {
		return "personal skill (~/.claude/skills, every project): s moves it to the shelf";
	}
	return skill.kind === "broken" ? "broken skill: see the Doctor tab" : "personal skill is a symlink, not a folder: shelve moves folders only";
};

const header = (id, label, extra = {}) => ({ id, header: true, label, ...extra });
// A blank, unselectable row between sections.
const spacer = (id) => ({ id: `sp:${id}`, header: true, blank: true, label: "" });

// Shelf groups (expandable), then what loads from personal, project and plugin folders.
export const skillRows = (data, expanded = new Set()) => {
	const rows = [header("h:shelf", "Shelf")];
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
			...withNote([seg(`${skills.length} skills${agents > 0 ? `, ${agents} agent${agents > 1 ? "s" : ""}` : ""}`, DIM), cost(group.tokens), where("P", pState), where("G", gState)]),
			projectOn: group.items.some((item) => item.project),
			globalOn: group.items.some((item) => item.global),
			details: [`shelf group: ${group.name} (opt-in)`, `this project: ${badgeText(pState)}`, `global: ${badgeText(gState)}`, `cost when on: ${tokens(group.tokens)} tokens`, "toggle: space = this project, G = global; enter expands"],
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
					...withNote([...(isSkill ? [scopeBadge("shelf")] : []), cost(item.tokens), where("P", itemState(item, "project")), where("G", itemState(item, "global"))]),
					projectOn: item.project,
					globalOn: item.global,
					shelved: isSkill,
					skill: item.name,
					details: [`${isSkill ? "skill" : "agent"}: ${item.name}`, `group: ${group.name}`, `this project: ${badgeText(itemState(item, "project"))}`, `global: ${badgeText(itemState(item, "global"))}`, `tokens: ${tokens(item.tokens)}`, `source: ${item.source}`, isSkill ? "toggle: shelf skill (opt-in): space = this project, G = global; u unshelves" : "toggle: agents switch with their group"],
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
		kind: skill.scope === "user" ? "personal" : "loaded",
		shelvable: skill.kind === "file",
		skill: skill.source.split("/").at(-1),
		why: whyFixed(skill),
		label: `  ${skill.name}`,
		...withNote([scopeBadge(skill.scope), cost(skill.tokens), ...(skill.state === "active" ? [] : [badge(skill.state)])]),
		details: [...skillDetails(skill), `toggle: ${whyFixed(skill)}`],
		file: skill.kind === "broken" ? undefined : `${skill.source}/SKILL.md`,
	});
	section("Personal skills", own("user"), skillRow);
	section("Project skills", own("project"), skillRow);
	const plugins = data.status.plugins.items.filter((plugin) => loaded.some((skill) => skill.plugin === plugin.id));
	section("Plugin skills", plugins, (plugin) => {
		const mine = loaded.filter((skill) => skill.plugin === plugin.id);
		return {
			id: `plugin-skills:${plugin.id}`,
			kind: "loaded",
			plugin: plugin.id,
			enabled: plugin.state === "active",
			label: `  ${plugin.name}:*`,
			...withNote([seg(`${mine.length} skills`, DIM), cost(plugin.skillTokens), badge(plugin.state)]),
			details: [`plugin: ${plugin.id}`, `state: ${badgeText(plugin.state)}`, `skills: ${mine.map((skill) => skill.name.split(":").pop()).join(", ")}`, `tokens: ${tokens(plugin.skillTokens)}`, `source: ${plugin.installPath}`, "toggle: plugin skill (comes with a plugin): space toggles the plugin", `note: ${PLUGIN_NOTE}`],
		};
	});
	return rows;
};

export const PLUGIN_NOTE = "applies to new sessions";

export const MCP_KEYS = [["space", "park / add back (user scope)"], ["e", "open source file in $EDITOR"]];

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
		const mine = server.scope === "user";
		return {
			id: `mcp:${server.scope}:${server.name}:${server.source}`,
			label: server.name,
			...(mine ? { mcp: server.name, mcpEnable: false } : { why: MCP_WHY[server.scope] }),
			...withNote([scopeBadge(server.scope), badge(server.state), seg(server.transport, DIM)]),
			file: server.source,
			details: [`server: ${server.name}`, `scope: ${server.scope}`, `state: ${badgeText(server.state)}`, `transport: ${server.transport}`, `${server.url ? "url" : "command"}: ${target}`, ...env, ...headers, `tokens: not measured (tool lists)`, `source: ${server.source}`, `toggle: ${mine ? "space parks it (removes it from user scope, config saved); undo with agentry fix --undo" : MCP_WHY[server.scope] ?? "not managed here"}`],
		};
	}),
	...(Array.isArray(data.parked) ? data.parked : []).map((entry) => ({
		id: `parked:${entry.name}`,
		label: entry.name,
		mcp: entry.name,
		mcpEnable: true,
		...withNote([scopeBadge("user"), badge("parked"), seg("not loaded", DIM)]),
		details: [`server: ${entry.name}`, "scope: user", `state: ${badgeText("parked")}`, `config: ${entry.summary}`, `parked: ${entry.parkedAt ?? "-"}`, "toggle: space adds it back to user scope (claude mcp add-json from the saved copy)"],
	})),
];

export const hookRows = (data) =>
	data.status.hooks.items.map((hook, index) => ({
		id: `hook:${index}:${hook.source}`,
		label: `${hook.event}  ${hook.matcher}`,
		...withNote([scopeBadge(hook.scope), ...(hook.plugin ? [seg(hook.plugin, DIM)] : []), badge(hook.state)]),
		file: hook.source,
		details: [`event: ${hook.event}`, `matcher: ${hook.matcher}`, `type: ${hook.type}`, `command: ${hook.command ?? `(${hook.type})`}`, `scope: ${hook.scope}${hook.plugin ? ` (${hook.plugin})` : ""}`, `state: ${hook.state}`, `output: not measured`, `source: ${hook.source}`],
	}));

export const PLUGINS_KEYS = [["space", "enable/disable"], ["e", "open source file in $EDITOR"]];

export const pluginRows = (data) =>
	data.status.plugins.items.map((plugin) => ({
		id: `plugin:${plugin.id}`,
		plugin: plugin.id,
		enabled: plugin.state === "active",
		label: plugin.id,
		...withNote([...(plugin.installScope ? [scopeBadge(plugin.installScope)] : []), seg(plugin.version ?? "", DIM), badge(plugin.state)]),
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

export const DOCTOR_KEYS = [["enter", "preview fix"], ["u", "undo last fix set"], ["e", "open file"]];

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
