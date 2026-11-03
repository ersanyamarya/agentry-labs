// Turns lib data into list rows: { id, label, note?, details[], file?, header?, kind?, ... }. Pure, so tabs and tests
// share it. Everything shown here already passed through lib/mask.mjs (the inventory readers mask before returning).

const tokens = (count) => (count === null || count === undefined ? "-" : `~${count}`);

export const SKILLS_HINT = "space toggle on/off  g switch project/global";

const itemState = (item) => (item.global ? "on (global)" : item.project ? "on (project)" : "off");

const skillDetails = (skill) => [
	`skill: ${skill.name}`,
	`scope: ${skill.scope}${skill.plugin ? ` (${skill.plugin})` : ""}`,
	`state: ${skill.state}`,
	`tokens: ${tokens(skill.tokens)} (description)`,
	`source: ${skill.source}`,
	...(skill.target ? [`links to: ${skill.target}`] : []),
];

// Shelf groups (expandable), then what loads from personal, project and plugin folders.
export const skillRows = (data, expanded = new Set()) => {
	const rows = [];
	rows.push({ id: "h:shelf", header: true, label: "Shelf (agentry shelf list)" });
	if (data.groups.length === 0) {
		rows.push({ id: "none:shelf", label: "  (no shelf groups)", details: ["Shelved skills live in <config dir>/skill-shelf/<group>/<skill>."] });
	}
	for (const group of data.groups) {
		const skills = group.items.filter((item) => item.kind === "skills");
		const agents = group.items.length - skills.length;
		const open = expanded.has(group.name);
		rows.push({
			id: `group:${group.name}`,
			kind: "group",
			group: group.name,
			target: group.name,
			label: `${open ? "▾" : "▸"} ${group.name}`,
			note: `${skills.length} skills${agents > 0 ? `, ${agents} agent${agents > 1 ? "s" : ""}` : ""}  ${tokens(group.tokens)} tokens  ${group.state}`,
			projectOn: group.items.some((item) => item.project),
			globalOn: group.items.some((item) => item.global),
			details: [`shelf group: ${group.name}`, `state: ${group.state}`, `cost when on: ${tokens(group.tokens)} tokens`, "enter expands, space toggles the whole group"],
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
					note: `${tokens(item.tokens)}  ${itemState(item)}`,
					projectOn: item.project,
					globalOn: item.global,
					details: [`${isSkill ? "skill" : "agent"}: ${item.name}`, `group: ${group.name}`, `state: ${itemState(item)}`, `tokens: ${tokens(item.tokens)}`, `source: ${item.source}`, ...(isSkill ? [] : ["agents switch with their group"])],
					file: isSkill ? `${item.source}/SKILL.md` : item.source,
				});
			}
		}
	}

	const loaded = data.status.skills.items.filter((skill) => !skill.shelfGroup);
	const section = (title, list, label) => {
		if (list.length > 0) {
			rows.push({ id: `h:${title}`, header: true, label: title });
			rows.push(...list.map(label));
		}
	};
	const own = (scope) => loaded.filter((skill) => skill.scope === scope);
	const skillRow = (skill) => ({ id: `skill:${skill.scope}:${skill.source}`, kind: "loaded", label: `  ${skill.name}`, note: `${tokens(skill.tokens)}${skill.state === "active" ? "" : `  ${skill.state}`}`, details: skillDetails(skill), file: skill.kind === "broken" ? undefined : `${skill.source}/SKILL.md` });
	section("Personal skills", own("user"), skillRow);
	section("Project skills", own("project"), skillRow);
	const plugins = data.status.plugins.items.filter((plugin) => loaded.some((skill) => skill.plugin === plugin.id));
	section("Plugin skills", plugins, (plugin) => {
		const mine = loaded.filter((skill) => skill.plugin === plugin.id);
		return { id: `plugin-skills:${plugin.id}`, kind: "loaded", label: `  ${plugin.name}:*`, note: `${mine.length} skills  ${tokens(plugin.skillTokens)}  ${plugin.state}`, details: [`plugin: ${plugin.id}`, `skills: ${mine.map((skill) => skill.name.split(":").pop()).join(", ")}`, `tokens: ${tokens(plugin.skillTokens)}`, `source: ${plugin.installPath}`] };
	});
	return rows;
};

export const MCP_HINT = "e open source file in $EDITOR";

export const mcpRows = (data) =>
	data.status.mcp.servers.map((server) => {
		const target = server.url ?? [server.command, ...(server.args ?? [])].join(" ");
		const env = Object.entries(server.env ?? {}).map(([key, value]) => `env ${key}=${value}`);
		const headers = Object.entries(server.headers ?? {}).map(([key, value]) => `header ${key}: ${value}`);
		return {
			id: `mcp:${server.scope}:${server.name}:${server.source}`,
			label: server.name,
			note: `${server.scope}, ${server.state}  ${server.transport}`,
			file: server.source,
			details: [`server: ${server.name}`, `scope: ${server.scope}`, `state: ${server.state}`, `transport: ${server.transport}`, `${server.url ? "url" : "command"}: ${target}`, ...env, ...headers, `tokens: not measured (tool lists)`, `source: ${server.source}`],
		};
	});

export const hookRows = (data) =>
	data.status.hooks.items.map((hook, index) => ({
		id: `hook:${index}:${hook.source}`,
		label: `${hook.event}  ${hook.matcher}`,
		note: `${hook.scope}${hook.plugin ? `: ${hook.plugin}` : ""}, ${hook.state}`,
		file: hook.source,
		details: [`event: ${hook.event}`, `matcher: ${hook.matcher}`, `type: ${hook.type}`, `command: ${hook.command ?? `(${hook.type})`}`, `scope: ${hook.scope}${hook.plugin ? ` (${hook.plugin})` : ""}`, `state: ${hook.state}`, `output: not measured`, `source: ${hook.source}`],
	}));

export const pluginRows = (data) =>
	data.status.plugins.items.map((plugin) => ({
		id: `plugin:${plugin.id}`,
		label: plugin.id,
		note: `${plugin.version ?? ""}  ${plugin.state}`,
		file: plugin.enabledBy?.source,
		details: [
			`plugin: ${plugin.id}`,
			`version: ${plugin.version ?? "unknown"}`,
			`state: ${plugin.state}`,
			`skill tokens: ${tokens(plugin.skillTokens)}`,
			...plugin.installs.map((install) => `install: ${install.scope}${install.projectPath ? ` ${install.projectPath}` : ""}${install.appliesHere ? "" : " (other project)"}`),
			`enabled by: ${plugin.enabledBy?.source ?? "-"}`,
			`path: ${plugin.installPath ?? "not installed"}`,
		],
	}));

export const DOCTOR_HINT = "enter preview fix  u undo last fix set";

export const doctorRows = (data) => {
	const rows = [];
	for (const severity of ["error", "warning", "info"]) {
		const mine = data.doctor.findings.filter((finding) => finding.severity === severity);
		if (mine.length === 0) {
			continue;
		}
		rows.push({ id: `h:${severity}`, header: true, label: `${{ error: "Errors", warning: "Warnings", info: "Info" }[severity]} (${mine.length})`, severity });
		mine.forEach((finding, index) => {
			rows.push({
				id: `finding:${finding.id}:${finding.file}:${index}`,
				kind: "finding",
				severity,
				finding,
				label: `  [${finding.id}] ${finding.message}`,
				file: finding.file,
				details: [`${severity}: [${finding.id}]`, finding.message, `file: ${finding.file}${finding.line ? `:${finding.line}` : ""}`, ...(finding.fix ? [`advice: ${finding.fix}`] : ["advice: none from doctor"])],
			});
		});
	}
	return rows;
};
