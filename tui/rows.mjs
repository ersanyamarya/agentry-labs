// Turns lib data into list rows: { id, label, segments?, note?, details[], file?, header?, kind?, ... }. Pure, so tabs
// and tests share it. `segments` ([{ text, style }], see theme.mjs) is the coloured right-hand side of a row and `note`
// is the same text without colour. Everything shown here already passed through lib/mask.mjs (the inventory readers
// mask before returning).

import { costStyle, plain, scopeStyle, seg, SEVERITY, stateStyle } from "./theme.mjs";

const tokens = (count) => (count === null || count === undefined ? "-" : `~${count}`);

const DIM = { dimColor: true };
const gap = seg("  ");
const cost = (count, suffix = "") => seg(`${tokens(count)}${suffix}`, costStyle(count));
const badge = (text) => seg(text, stateStyle(text));
const scopeBadge = (scope) => seg(scope, scopeStyle(scope));
// A row's right-hand side from segments, separated by two spaces; `note` is its plain text.
const withNote = (parts) => {
	const segments = parts.flatMap((part, index) => (index === 0 ? [part] : [gap, part]));
	return { segments, note: plain(segments) };
};

export const SKILLS_KEYS = [["space", "toggle on/off or plugin"], ["s", "shelve"], ["u", "unshelve"], ["g", "project/global"], ["enter", "expand"]];

const itemState = (item) => (item.global ? "on (global)" : item.project ? "on (project)" : "off");

// "on (global)" when every item is linked globally, "on (project)" likewise, "partial" for a mix, else "off".
const groupState = (group) => {
	const all = (field) => group.items.length > 0 && group.items.every((item) => item[field]);
	return all("global") ? "on (global)" : all("project") ? "on (project)" : group.items.some((item) => item.project || item.global) ? "partial" : "off";
};

const skillDetails = (skill) => [
	`skill: ${skill.name}`,
	`scope: ${skill.scope}${skill.plugin ? ` (${skill.plugin})` : ""}`,
	`state: ${skill.state}`,
	`tokens: ${tokens(skill.tokens)} (description)`,
	`source: ${skill.source}`,
	...(skill.target ? [`links to: ${skill.target}`] : []),
];

// Why a loaded (non-shelf) skill row cannot be toggled, shown in the status line and the details.
const whyFixed = (skill) => {
	if (skill.scope === "project") {
		return "project skill: files live in the repo, so there is no toggle here";
	}
	if (skill.kind === "file") {
		return "personal skill: press s to move it onto the shelf, then it can be toggled";
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
		const state = groupState(group);
		rows.push({
			id: `group:${group.name}`,
			kind: "group",
			group: group.name,
			target: group.name,
			label: `${open ? "▾" : "▸"} ${group.name}`,
			...withNote([seg(`${skills.length} skills${agents > 0 ? `, ${agents} agent${agents > 1 ? "s" : ""}` : ""}`, DIM), cost(group.tokens, " tokens"), badge(state)]),
			projectOn: group.items.some((item) => item.project),
			globalOn: group.items.some((item) => item.global),
			details: [`shelf group: ${group.name}`, `state: ${state}`, `cost when on: ${tokens(group.tokens)} tokens`, "toggle: space switches the whole group; enter expands it"],
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
					...withNote([...(isSkill ? [scopeBadge("shelf")] : []), cost(item.tokens), badge(itemState(item))]),
					projectOn: item.project,
					globalOn: item.global,
					shelved: isSkill,
					skill: item.name,
					details: [`${isSkill ? "skill" : "agent"}: ${item.name}`, `group: ${group.name}`, `state: ${itemState(item)}`, `tokens: ${tokens(item.tokens)}`, `source: ${item.source}`, isSkill ? "toggle: space; u moves it back to ~/.claude/skills" : "toggle: agents switch with their group"],
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
			details: [`plugin: ${plugin.id}`, `state: ${plugin.state}`, `skills: ${mine.map((skill) => skill.name.split(":").pop()).join(", ")}`, `tokens: ${tokens(plugin.skillTokens)}`, `source: ${plugin.installPath}`, "toggle: space enables or disables the plugin", `note: ${PLUGIN_NOTE}`],
		};
	});
	return rows;
};

export const PLUGIN_NOTE = "applies to new sessions";

export const MCP_KEYS = [["e", "open source file in $EDITOR"]];

export const mcpRows = (data) =>
	data.status.mcp.servers.map((server) => {
		const target = server.url ?? [server.command, ...(server.args ?? [])].join(" ");
		const env = Object.entries(server.env ?? {}).map(([key, value]) => `env ${key}=${value}`);
		const headers = Object.entries(server.headers ?? {}).map(([key, value]) => `header ${key}: ${value}`);
		return {
			id: `mcp:${server.scope}:${server.name}:${server.source}`,
			label: server.name,
			...withNote([scopeBadge(server.scope), badge(server.state), seg(server.transport, DIM)]),
			file: server.source,
			details: [`server: ${server.name}`, `scope: ${server.scope}`, `state: ${server.state}`, `transport: ${server.transport}`, `${server.url ? "url" : "command"}: ${target}`, ...env, ...headers, `tokens: not measured (tool lists)`, `source: ${server.source}`],
		};
	});

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
		...withNote([seg(plugin.version ?? "", DIM), badge(plugin.state)]),
		file: plugin.enabledBy?.source,
		details: [
			`plugin: ${plugin.id}`,
			`version: ${plugin.version ?? "unknown"}`,
			`state: ${plugin.state}`,
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
