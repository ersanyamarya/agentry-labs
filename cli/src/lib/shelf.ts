// @ts-nocheck
// Switches groups of rarely used skills (and their agents) on and off, so they are not listed in every session.
// Shelved skills live in <config dir>/skill-shelf/<group>/<skill>/ and a group's agents in <group>/agents/*.md;
// "on" symlinks them into .claude/skills and .claude/agents, "off" removes the links. Project links are added to
// .git/info/exclude so they never show up as untracked files.
// Without global the target is <git root of the current directory>/.claude, with it the config dir.
// promote/demote move a real skill folder between this project and ~/.claude/skills.
// Every write command takes dryRun: it prints the links and exclude lines it would change and writes nothing.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { removedCopyPath, saveRemovedCopy } from "./backups.js";
import { descriptionTokens } from "./tokens.js";

const listEntries = (dir, keep) =>
	existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter((entry) => !entry.name.startsWith(".") && keep(entry))
				.map((entry) => entry.name)
		: [];

const listDirs = (dir) => listEntries(dir, (entry) => entry.isDirectory());

const linkTarget = (path) => {
	try {
		return lstatSync(path).isSymbolicLink() ? resolve(dirname(path), readlinkSync(path)) : undefined;
	} catch {
		return undefined;
	}
};

// Rename; a move across devices (EXDEV) falls back to copy then delete.
const moveFolder = (from, to) => {
	mkdirSync(dirname(to), { recursive: true });
	try {
		renameSync(from, to);
	} catch (error) {
		if (error.code !== "EXDEV") {
			throw error;
		}
		cpSync(from, to, { recursive: true });
		rmSync(from, { recursive: true });
	}
};

const excludeEntry = ({ kind, name }) => `.claude/${kind}/${name}`;

// Keeps project links out of `git status` without touching the tracked .gitignore.
const updateExclude = (exclude, entries, add) => {
	if (!exclude) {
		return;
	}
	const lines = existsSync(exclude) ? readFileSync(exclude, "utf8").split("\n").filter(Boolean) : [];
	const kept = lines.filter((line) => !entries.includes(line));
	mkdirSync(dirname(exclude), { recursive: true });
	writeFileSync(exclude, `${[...kept, ...(add ? entries : [])].join("\n")}\n`);
};

// Each function returns the process exit code.
export const createShelf = (paths, { out = console.log, err = console.error, warn = console.warn, now = () => new Date() } = {}) => {
	const { shelfDir, configDir } = paths;

	// A group's skills are its folders (except agents/); its agents are the .md files in agents/.
	const groupItems = (name) => [
		...listDirs(join(shelfDir, name))
			.filter((skill) => skill !== "agents")
			.map((skill) => ({ kind: "skills", name: skill, source: join(shelfDir, name, skill) })),
		...listEntries(join(shelfDir, name, "agents"), (entry) => entry.isFile() && entry.name.endsWith(".md")).map((agent) => ({
			kind: "agents",
			name: agent,
			source: join(shelfDir, name, "agents", agent),
		})),
	];

	// Description tokens a group adds to every session once it is on.
	const itemTokens = ({ kind, source }) => descriptionTokens(kind === "skills" ? join(source, "SKILL.md") : source);
	const groupCost = (name) => groupItems(name).reduce((total, item) => total + itemTokens(item), 0);

	const linkedCount = (base, name) =>
		groupItems(name).filter(({ kind, name: item, source }) => linkTarget(join(base, kind, item)) === source).length;

	const groupState = (name, projectBase) =>
		linkedCount(configDir, name) > 0 ? "on (global)" : linkedCount(projectBase, name) > 0 ? "on (this project)" : "off";

	const list = () => {
		const projectBase = join(paths.projectRoot(), ".claude");
		for (const name of listDirs(shelfDir)) {
			const items = groupItems(name);
			const skills = items.filter(({ kind }) => kind === "skills");
			const agents = items.filter(({ kind }) => kind === "agents");
			const agentNote = agents.length > 0 ? `, ${agents.length} agent${agents.length > 1 ? "s" : ""}` : "";
			out(
				`${name.padEnd(16)} ${String(skills.length).padStart(3)} skills${agentNote}  ~${groupCost(name)} tokens  ${groupState(name, projectBase)}`,
			);
			out(`  ${items.map(({ name: item }) => item).join(", ")}`);
		}
		return 0;
	};

	// What `list` prints, as data (for the UI): every group with its cost, state and items, and where each item is linked.
	const groups = () => {
		const projectBase = join(paths.projectRoot(), ".claude");
		const linked = (base, { kind, name, source }) => linkTarget(join(base, kind, name)) === source;
		return listDirs(shelfDir).map((name) => ({
			name,
			tokens: groupCost(name),
			state: groupState(name, projectBase),
			items: groupItems(name).map((item) => ({ ...item, tokens: itemTokens(item), project: linked(projectBase, item), global: linked(configDir, item) })),
		}));
	};

	const skillGroups = (skill) => listDirs(shelfDir).filter((group) => skill !== "agents" && listDirs(join(shelfDir, group)).includes(skill));

	// A target is a group, "group/skill", or a skill name unique across groups.
	// Returns { items, label } or { error, code }.
	const resolveTarget = (target) => {
		const noGroup = { error: `No group "${target}" in ${shelfDir}. Groups: ${listDirs(shelfDir).join(", ") || "none"}`, code: 1 };
		if (listDirs(shelfDir).includes(target)) {
			const items = groupItems(target);
			return items.length > 0 ? { items, label: target } : noGroup;
		}
		const slash = target.indexOf("/");
		const [group, skill] = slash === -1 ? [undefined, target] : [target.slice(0, slash), target.slice(slash + 1)];
		const groups = group === undefined ? skillGroups(skill) : skillGroups(skill).filter((name) => name === group);
		if (groups.length === 0) {
			return group === undefined ? noGroup : { error: `No skill "${skill}" in group "${group}" of ${shelfDir}`, code: 1 };
		}
		if (groups.length > 1) {
			return { error: `"${skill}" is in several groups: ${groups.map((name) => `${name}/${skill}`).join(", ")}. Use group/skill.`, code: 2 };
		}
		return { items: [{ kind: "skills", name: skill, source: join(shelfDir, groups[0], skill) }], label: `${groups[0]}/${skill}`, group: groups[0], skill };
	};

	// The links `command` would change for these items in `base`; warns about names that are taken by real files.
	const planChanges = (command, items, base) =>
		items.flatMap((item) => {
			const link = join(base, item.kind, item.name);
			const current = linkTarget(link);
			if (command === "off") {
				return current === item.source ? [{ item, link }] : [];
			}
			if (current === item.source) {
				return [];
			}
			if (existsSync(link) || current) {
				warn(`skip ${item.name}: ${link} already exists and is not a shelf link`);
				return [];
			}
			return [{ item, link }];
		});

	const applyChanges = (command, changes) => {
		for (const { item, link } of changes) {
			if (command === "on") {
				mkdirSync(dirname(link), { recursive: true });
				symlinkSync(item.source, link, item.kind === "skills" ? "dir" : "file");
			} else {
				rmSync(link);
			}
		}
	};

	// Prints the links and exclude lines a dry run would change.
	const describeChanges = (command, changes, exclude) => {
		for (const { item, link } of changes) {
			out(`  ${command === "on" ? `link ${link} -> ${item.source}` : `unlink ${link}`}`);
		}
		if (exclude && changes.length > 0) {
			for (const { item } of changes) {
				out(`  exclude ${command === "on" ? "+" : "-"} ${excludeEntry(item)}`);
			}
		}
	};

	// Applies one command to items in one scope and keeps the exclude file in step. A dry run writes nothing.
	const change = (command, items, base, { exclude, dryRun }) => {
		const changes = planChanges(command, items, base);
		if (!dryRun) {
			applyChanges(command, changes);
			if (changes.length > 0) {
				updateExclude(exclude, changes.map(({ item }) => excludeEntry(item)), command === "on");
			}
		}
		return changes;
	};

	const toggle = (command, targets, { global = false, dryRun = false } = {}) => {
		const resolved = targets.map(resolveTarget);
		const failed = resolved.filter(({ error }) => error);
		if (failed.length > 0) {
			failed.forEach(({ error }) => err(error));
			return Math.max(...failed.map(({ code }) => code));
		}

		const root = global ? undefined : paths.projectRoot();
		const base = global ? configDir : join(root, ".claude");
		const exclude = root && paths.excludeFile(root);

		for (const { items, label } of resolved) {
			const changes = change(command, items, base, { exclude, dryRun });
			out(`${label} ${command} in ${base}: ${changes.length} of ${items.length} ${dryRun ? "would change" : "changed"}.`);
			if (dryRun) {
				describeChanges(command, changes, exclude);
			}
		}
		return 0;
	};

	const offAll = ({ global = false, dryRun = false } = {}) => {
		const root = global ? undefined : paths.projectRoot();
		const base = global ? configDir : join(root, ".claude");
		const exclude = root && paths.excludeFile(root);
		const { links, broken } = scopeLinks(base);
		const items = [...links, ...broken].map(({ kind, name, link }) => ({ kind, name, source: linkTarget(link) }));

		const changes = change("off", items, base, { exclude, dryRun });
		out(`all off in ${base}: ${changes.length} of ${items.length} ${dryRun ? "would change" : "changed"}.`);
		if (dryRun) {
			describeChanges("off", changes, exclude);
		}
		return 0;
	};

	// Shelf links found in one .claude folder; a link into the shelf whose target is gone is broken.
	const scopeLinks = (base) => {
		const links = [];
		const broken = [];
		for (const kind of ["skills", "agents"]) {
			const dir = join(base, kind);
			for (const name of listEntries(dir, (entry) => entry.isSymbolicLink())) {
				const link = join(dir, name);
				const target = linkTarget(link);
				if (!target?.startsWith(shelfDir + sep)) {
					continue;
				}
				if (existsSync(target)) {
					links.push({ group: relative(shelfDir, target).split(sep)[0], kind, name, link });
				} else {
					broken.push({ kind, name, link, target });
				}
			}
		}
		return { base, links, broken };
	};

	const getStatus = () => {
		const projectBase = join(paths.projectRoot(), ".claude");
		return {
			shelf: shelfDir,
			groups: listDirs(shelfDir).map((name) => ({ name, state: groupState(name, projectBase) })),
			project: scopeLinks(projectBase),
			global: scopeLinks(configDir),
		};
	};

	const status = ({ json = false } = {}) => {
		const result = getStatus();
		if (json) {
			out(JSON.stringify(result, null, 2));
			return 0;
		}
		for (const { name, state } of result.groups) {
			out(`${name.padEnd(16)} ${state}`);
		}
		for (const scope of ["project", "global"]) {
			const { base, links, broken } = result[scope];
			out(`\n${scope} (${base})`);
			if (links.length === 0 && broken.length === 0) {
				out("  nothing from the shelf");
			}
			for (const { group, kind, name } of links) {
				out(`  ${group}/${name}${kind === "agents" ? " (agent)" : ""}`);
			}
			for (const { kind, name, target } of broken) {
				out(`  BROKEN ${kind}/${name} -> ${target} (missing)`);
			}
		}
		return 0;
	};

	// Links (working or broken) from any scope status shows that point at this shelved skill.
	const linksTo = (group, skill) => {
		const { project, global } = getStatus();
		const source = join(shelfDir, group, skill);
		return [project, global].flatMap(({ links, broken }) => [
			...links.filter(({ kind, link }) => kind === "skills" && linkTarget(link) === source),
			...broken.filter(({ kind, target }) => kind === "skills" && target === source),
		]);
	};

	const shelve = (skill, group, { dryRun = false } = {}) => {
		const from = join(configDir, "skills", skill);
		const to = join(shelfDir, group, skill);
		if (!listDirs(join(configDir, "skills")).includes(skill)) {
			err(`${from} is not a skill folder (symlinks are not moved)`);
			return 1;
		}
		if (skill === "agents" || group.includes("/") || group.startsWith(".")) {
			err(`Cannot shelve "${skill}" into "${group}"`);
			return 1;
		}
		if (existsSync(to)) {
			err(`${to} already exists; not overwriting`);
			return 1;
		}
		const { project, global } = getStatus();
		const links = [project, global].flatMap(({ links: ok, broken }) => [...ok, ...broken]).filter(({ kind, name }) => kind === "skills" && name === skill);
		if (links.length > 0) {
			err(`A shelf link named ${skill} exists: ${links.map(({ link }) => link).join(", ")}. Turn it off first.`);
			return 1;
		}
		if (dryRun) {
			out(`would shelve ${skill} into ${group}: ${from} -> ${to}`);
			return 0;
		}
		mkdirSync(dirname(to), { recursive: true });
		renameSync(from, to);
		out(`shelved ${skill} into ${group}`);
		return 0;
	};

	const unshelve = (target, { dryRun = false } = {}) => {
		const resolved = resolveTarget(target);
		if (resolved.error) {
			err(resolved.error);
			return resolved.code;
		}
		if (!resolved.skill) {
			err(`"${target}" is a group; unshelve takes a skill name or group/skill`);
			return 2;
		}
		const to = join(configDir, "skills", resolved.skill);
		if (existsSync(to) || linkTarget(to)) {
			err(`${to} already exists; not overwriting`);
			return 1;
		}
		const links = linksTo(resolved.group, resolved.skill);
		if (links.length > 0) {
			err(`${resolved.label} is still linked: ${links.map(({ link }) => link).join(", ")}. Turn it off first.`);
			return 1;
		}
		if (dryRun) {
			out(`would unshelve ${resolved.label} into ${dirname(to)}: ${join(shelfDir, resolved.group, resolved.skill)} -> ${to}`);
			return 0;
		}
		mkdirSync(dirname(to), { recursive: true });
		renameSync(join(shelfDir, resolved.group, resolved.skill), to);
		out(`unshelved ${resolved.label} into ${dirname(to)}`);
		return 0;
	};

	// promote: <project>/.claude/skills/<skill> → ~/.claude/skills (every project); demote: the reverse. Real folders only
	// (a link belongs to the shelf), never overwrites, no copy kept: it is a move.
	const scopeMove = (direction, skill, { dryRun = false } = {}) => {
		const promote = direction === "promote";
		const projectDir = join(paths.projectRoot(), ".claude", "skills");
		const globalDir = join(configDir, "skills");
		const [fromDir, toDir] = promote ? [projectDir, globalDir] : [globalDir, projectDir];
		const [from, to] = [join(fromDir, skill), join(toDir, skill)];
		const [fromName, toName] = promote ? ["project", "global"] : ["global", "project"];
		if (!skill || skill.includes("/") || skill.startsWith(".") || skill === "agents") {
			err(`Not a usable skill name: "${skill}"`);
			return 2;
		}
		if (resolve(projectDir) === resolve(globalDir)) {
			err(`This folder's .claude is the global config folder (${dirname(globalDir)}), so there is no separate project scope to move between.`);
			return 1;
		}
		if (linkTarget(from)) {
			err(`${from} is a link, not a ${fromName} skill folder (links belong to the shelf; turn it off instead)`);
			return 1;
		}
		if (!listDirs(fromDir).includes(skill)) {
			err(`No ${fromName} skill folder "${skill}" in ${fromDir}`);
			return 1;
		}
		if (existsSync(to) || linkTarget(to)) {
			err(`${to} already exists; not overwriting`);
			return 1;
		}
		if (dryRun) {
			out(`would ${direction} ${skill}: ${from} -> ${to} (a move, no copy kept)`);
			return 0;
		}
		moveFolder(from, to);
		out(`${direction}d ${skill} to ${toName} scope: ${to}`);
		return 0;
	};

	// Deletes a shelved skill (group/skill or a unique name) or a real skill folder in ~/.claude/skills, after copying it to
	// <backups>/removed/<time>/. Refuses while a shelf link still points at it. Restore by moving the copy back.
	// With project: deletes the real folder <project>/.claude/skills/<skill> instead (a link there belongs to the shelf; turn it off).
	// With backup false no copy is kept. meta.json next to the copy records the original folder for `agentry backups restore`.
	const remove = (target, { dryRun = false, project = false, backup = true } = {}) => {
		const resolved = project ? { error: "" } : resolveTarget(target);
		const globalFolder = join(configDir, "skills", target);
		const projectFolder = join(paths.projectRoot(), ".claude", "skills", target);
		let from;
		let label;
		if (project) {
			if (!existsSync(projectFolder) || target.includes("/")) {
				err(`No skill folder "${target}" in ${dirname(projectFolder)}`);
				return 1;
			}
			if (lstatSync(projectFolder).isSymbolicLink()) {
				err(`${target} is a link into the shelf, not a project skill folder. Turn it off instead.`);
				return 1;
			}
			from = projectFolder;
			label = `${target} (project)`;
		} else if (!resolved.error && resolved.skill) {
			const links = linksTo(resolved.group, resolved.skill);
			if (links.length > 0) {
				err(`${resolved.label} is still linked: ${links.map(({ link }) => link).join(", ")}. Turn it off first.`);
				return 1;
			}
			from = join(shelfDir, resolved.group, resolved.skill);
			label = resolved.label;
		} else if (!resolved.error) {
			err(`"${target}" is a group; remove takes a skill name or group/skill`);
			return 2;
		} else if (target !== "agents" && listDirs(join(configDir, "skills")).includes(target)) {
			from = globalFolder;
			label = `${target} (global)`;
		} else {
			err(resolved.error);
			return resolved.code;
		}
		const to = removedCopyPath(paths, now, label);
		if (dryRun) {
			out(`would remove ${label}: ${from} (${backup ? `copy kept in ${to}` : "no copy kept"})`);
			return 0;
		}
		if (backup) {
			saveRemovedCopy({ from, to, label, now });
		}
		rmSync(from, { recursive: true });
		const groupDir = dirname(from);
		if (dirname(groupDir) === shelfDir && readdirSync(groupDir).length === 0) {
			rmSync(groupDir, { recursive: true });
		}
		out(`removed ${label}; ${backup ? `a copy is in ${to}` : "no copy kept"}`);
		return 0;
	};

	return {
		list,
		groups,
		remove,
		status,
		shelve,
		unshelve,
		promote: (skill, options) => scopeMove("promote", skill, options),
		demote: (skill, options) => scopeMove("demote", skill, options),
		on: (targets, options) => toggle("on", targets, options),
		off: (targets, options) => toggle("off", targets, options),
		offAll,
	};
};
