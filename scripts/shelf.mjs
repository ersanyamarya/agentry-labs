#!/usr/bin/env node
// Switches groups of rarely used skills on and off, so they are not listed in every session.
// Shelved skills live in ~/.claude/skill-shelf/<group>/<skill>/; "on" symlinks a group into a skills folder, "off" removes
// the links. Project links are added to .git/info/exclude so they never show up as untracked files.
//
// Usage: node scripts/shelf.mjs list
//        node scripts/shelf.mjs on|off <group> [--global]
// Without --global the target is <git root of the current directory>/.claude/skills. Claude Code watches skill folders, so a running session picks the change up.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const shelf = join(homedir(), ".claude/skill-shelf");
const globalSkills = join(homedir(), ".claude/skills");

const [command, group, ...rest] = process.argv.slice(2);
const isGlobal = rest.includes("--global");

const fail = (message) => {
	console.error(message);
	process.exit(1);
};

const listDirs = (dir) =>
	existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
				.map((entry) => entry.name)
		: [];

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
const updateExclude = (root, names, add) => {
	const exclude = join(root, ".git/info/exclude");
	if (!existsSync(join(root, ".git"))) {
		return;
	}
	const entries = names.map((name) => `.claude/skills/${name}`);
	const lines = existsSync(exclude) ? readFileSync(exclude, "utf8").split("\n").filter(Boolean) : [];
	const kept = lines.filter((line) => !entries.includes(line));
	writeFileSync(exclude, `${[...kept, ...(add ? entries : [])].join("\n")}\n`);
};

const enabledIn = (skillsDir, name) => {
	const skills = listDirs(join(shelf, name));
	const linked = skills.filter((skill) => linkTarget(join(skillsDir, skill)) === join(shelf, name, skill));
	return { linked: linked.length, total: skills.length };
};

if (command === "list") {
	const projectSkills = join(projectRoot(), ".claude/skills");
	for (const name of listDirs(shelf)) {
		const here = enabledIn(projectSkills, name);
		const everywhere = enabledIn(globalSkills, name);
		const state = everywhere.linked > 0 ? "on (global)" : here.linked > 0 ? "on (this project)" : "off";
		console.log(`${name.padEnd(16)} ${String(here.total).padStart(3)} skills  ${state}`);
		console.log(`  ${listDirs(join(shelf, name)).join(", ")}`);
	}
	process.exit(0);
}

if (!(["on", "off"].includes(command) && group)) {
	fail("Usage: node scripts/shelf.mjs list | on <group> [--global] | off <group> [--global]");
}
const groupDir = join(shelf, group);
const skills = listDirs(groupDir);
if (skills.length === 0) {
	fail(`No group "${group}" in ${shelf}. Groups: ${listDirs(shelf).join(", ") || "none"}`);
}

const root = isGlobal ? undefined : projectRoot();
const skillsDir = isGlobal ? globalSkills : join(root, ".claude/skills");
mkdirSync(skillsDir, { recursive: true });

const changed = [];
for (const skill of skills) {
	const link = join(skillsDir, skill);
	const source = join(groupDir, skill);
	const current = linkTarget(link);
	if (command === "on") {
		if (current === source) {
			continue;
		}
		if (existsSync(link) || current) {
			console.warn(`skip ${skill}: ${link} already exists and is not a shelf link`);
			continue;
		}
		symlinkSync(source, link, "dir");
		changed.push(skill);
	} else if (current === source) {
		rmSync(link);
		changed.push(skill);
	}
}

if (root) {
	updateExclude(root, changed, command === "on");
}
console.log(`${group} ${command} in ${skillsDir}: ${changed.length} of ${skills.length} changed.`);
