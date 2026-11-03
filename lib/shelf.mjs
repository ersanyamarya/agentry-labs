// Switches groups of rarely used skills (and their agents) on and off, so they are not listed in every session.
// Shelved skills live in <config dir>/skill-shelf/<group>/<skill>/ and a group's agents in <group>/agents/*.md;
// "on" symlinks them into .claude/skills and .claude/agents, "off" removes the links. Project links are added to
// .git/info/exclude so they never show up as untracked files.
// Without global the target is <git root of the current directory>/.claude, with it the config dir.

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const listEntries = (dir, keep) =>
	existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter((entry) => !entry.name.startsWith(".") && keep(entry))
				.map((entry) => entry.name)
		: [];

const listDirs = (dir) => listEntries(dir, (entry) => entry.isDirectory());

const linkTarget = (path) => {
	try {
		return lstatSync(path).isSymbolicLink() ? resolve(readlinkSync(path)) : undefined;
	} catch {
		return undefined;
	}
};

// Keeps project links out of `git status` without touching the tracked .gitignore.
const updateExclude = (root, items, add) => {
	const exclude = join(root, ".git/info/exclude");
	if (!existsSync(join(root, ".git"))) {
		return;
	}
	const entries = items.map(({ kind, name }) => `.claude/${kind}/${name}`);
	const lines = existsSync(exclude) ? readFileSync(exclude, "utf8").split("\n").filter(Boolean) : [];
	const kept = lines.filter((line) => !entries.includes(line));
	writeFileSync(exclude, `${[...kept, ...(add ? entries : [])].join("\n")}\n`);
};

// Each function returns the process exit code.
export const createShelf = (paths, { out = console.log, err = console.error, warn = console.warn } = {}) => {
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

	const linkedCount = (base, name) =>
		groupItems(name).filter(({ kind, name: item, source }) => linkTarget(join(base, kind, item)) === source).length;

	const list = () => {
		const projectBase = join(paths.projectRoot(), ".claude");
		for (const name of listDirs(shelfDir)) {
			const items = groupItems(name);
			const skills = items.filter(({ kind }) => kind === "skills");
			const agents = items.filter(({ kind }) => kind === "agents");
			const state = linkedCount(configDir, name) > 0 ? "on (global)" : linkedCount(projectBase, name) > 0 ? "on (this project)" : "off";
			const agentNote = agents.length > 0 ? `, ${agents.length} agent${agents.length > 1 ? "s" : ""}` : "";
			out(`${name.padEnd(16)} ${String(skills.length).padStart(3)} skills${agentNote}  ${state}`);
			out(`  ${items.map(({ name: item }) => item).join(", ")}`);
		}
		return 0;
	};

	const toggle = (command, group, { global = false } = {}) => {
		const items = groupItems(group);
		if (items.length === 0) {
			err(`No group "${group}" in ${shelfDir}. Groups: ${listDirs(shelfDir).join(", ") || "none"}`);
			return 1;
		}

		const root = global ? undefined : paths.projectRoot();
		const base = global ? configDir : join(root, ".claude");

		const changed = [];
		for (const item of items) {
			const dir = join(base, item.kind);
			const link = join(dir, item.name);
			const current = linkTarget(link);
			if (command === "on") {
				if (current === item.source) {
					continue;
				}
				if (existsSync(link) || current) {
					warn(`skip ${item.name}: ${link} already exists and is not a shelf link`);
					continue;
				}
				mkdirSync(dir, { recursive: true });
				symlinkSync(item.source, link, item.kind === "skills" ? "dir" : "file");
				changed.push(item);
			} else if (current === item.source) {
				rmSync(link);
				changed.push(item);
			}
		}

		if (root) {
			updateExclude(root, changed, command === "on");
		}
		out(`${group} ${command} in ${base}: ${changed.length} of ${items.length} changed.`);
		return 0;
	};

	return { list, on: (group, options) => toggle("on", group, options), off: (group, options) => toggle("off", group, options) };
};
