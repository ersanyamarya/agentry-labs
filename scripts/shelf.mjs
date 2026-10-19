#!/usr/bin/env node
// Switches groups of rarely used skills (and their agents) on and off, so they are not listed in every session.
// Shelved skills live in ~/.claude/skill-shelf/<group>/<skill>/ and a group's agents in ~/.claude/skill-shelf/<group>/agents/*.md;
// "on" symlinks them into .claude/skills and .claude/agents, "off" removes the links. Project links are added to
// .git/info/exclude so they never show up as untracked files.
//
// Usage: node scripts/shelf.mjs list
//        node scripts/shelf.mjs on|off <group> [--global]
// Without --global the target is <git root of the current directory>/.claude, with it ~/.claude. Claude Code watches skill
// folders, so a running session picks skills up; start a new session if a linked agent doesn't show.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const shelf = join(homedir(), ".claude/skill-shelf");
const globalBase = join(homedir(), ".claude");

const [command, group, ...rest] = process.argv.slice(2);
const isGlobal = rest.includes("--global");

const fail = (message) => {
	console.error(message);
	process.exit(1);
};

const listEntries = (dir, keep) =>
	existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter((entry) => !entry.name.startsWith(".") && keep(entry))
				.map((entry) => entry.name)
		: [];

const listDirs = (dir) => listEntries(dir, (entry) => entry.isDirectory());

// A group's skills are its folders (except agents/); its agents are the .md files in agents/.
const groupItems = (name) => [
	...listDirs(join(shelf, name))
		.filter((skill) => skill !== "agents")
		.map((skill) => ({ kind: "skills", name: skill, source: join(shelf, name, skill) })),
	...listEntries(join(shelf, name, "agents"), (entry) => entry.isFile() && entry.name.endsWith(".md")).map((agent) => ({
		kind: "agents",
		name: agent,
		source: join(shelf, name, "agents", agent),
	})),
];

const projectRoot = () => {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return process.cwd();
	}
};

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

const linkedCount = (base, name) =>
	groupItems(name).filter(({ kind, name: item, source }) => linkTarget(join(base, kind, item)) === source).length;

if (command === "list") {
	const projectBase = join(projectRoot(), ".claude");
	for (const name of listDirs(shelf)) {
		const items = groupItems(name);
		const skills = items.filter(({ kind }) => kind === "skills");
		const agents = items.filter(({ kind }) => kind === "agents");
		const state = linkedCount(globalBase, name) > 0 ? "on (global)" : linkedCount(projectBase, name) > 0 ? "on (this project)" : "off";
		const agentNote = agents.length > 0 ? `, ${agents.length} agent${agents.length > 1 ? "s" : ""}` : "";
		console.log(`${name.padEnd(16)} ${String(skills.length).padStart(3)} skills${agentNote}  ${state}`);
		console.log(`  ${items.map(({ name: item }) => item).join(", ")}`);
	}
	process.exit(0);
}

if (!(["on", "off"].includes(command) && group)) {
	fail("Usage: node scripts/shelf.mjs list | on <group> [--global] | off <group> [--global]");
}
const items = groupItems(group);
if (items.length === 0) {
	fail(`No group "${group}" in ${shelf}. Groups: ${listDirs(shelf).join(", ") || "none"}`);
}

const root = isGlobal ? undefined : projectRoot();
const base = isGlobal ? globalBase : join(root, ".claude");

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
			console.warn(`skip ${item.name}: ${link} already exists and is not a shelf link`);
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
console.log(`${group} ${command} in ${base}: ${changed.length} of ${items.length} changed.`);
