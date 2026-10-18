#!/usr/bin/env node
// Compares every skill across repos after normalising project names, so only real differences show.
//
// Usage: node scripts/skill-drift.mjs [--json] [--root <dir>]...
// Default roots: this repo, the global ~/.claude, and the sibling projects under ~/ws.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const ws = join(homedir(), "ws");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const customRoots = args.flatMap((arg, i) => (arg === "--root" ? [resolve(args[i + 1])] : []));

const defaultRoots = [
	repoRoot,
	homedir(),
	join(ws, "aryantriki/gentlemans-stack"),
	join(ws, "aryantriki/DeskMate"),
	join(ws, "mqtizer/mqtizer5/mqtizermqtt_client"),
	join(ws, "wemoveapp"),
	join(ws, "arya-folio"),
];
const roots = customRoots.length > 0 ? customRoots : defaultRoots;

const labelFor = (root) => (root === repoRoot ? "labs" : root === homedir() ? "global" : basename(root));

const skillDirsFor = (root) => {
	const dirs = root === repoRoot ? [join(root, "skills")] : [join(root, ".claude/skills")];
	return dirs.filter((dir) => existsSync(dir));
};

const PROJECT_NAMES = /gentlemans-stack|mqtizermqtt_client|mqtizer|wemove|deskmate|desk_mate/gi;
const normalise = (text) => text.replace(PROJECT_NAMES, "PROJECT").replace(/\r\n/g, "\n");

const filesIn = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name === ".DS_Store" || entry.name === "node_modules") return [];
		const path = join(dir, entry.name);
		return entry.isDirectory() ? filesIn(path) : [path];
	});

// Copying a skill between repos resets file mtimes, so prefer the date of the last commit that touched it.
const lastCommitMs = (dir) => {
	try {
		const out = execFileSync("git", ["log", "-1", "--format=%ct", "--", "."], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
		return out ? Number(out) * 1000 : 0;
	} catch {
		return 0;
	}
};

const readSkill = (dir) => {
	const files = filesIn(dir).sort();
	const lines = [];
	const committed = lastCommitMs(dir);
	let newest = committed;
	for (const file of files) {
		if (committed === 0) newest = Math.max(newest, statSync(file).mtimeMs);
		let text;
		try {
			text = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		if (text.includes("\0")) continue;
		for (const line of normalise(text).split("\n")) lines.push(`${relative(dir, file)}: ${line}`);
	}
	return { files: files.length, lines, newest };
};

// Added plus removed lines between two line lists, ignoring order.
const lineDiff = (a, b) => {
	const counts = new Map();
	for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1);
	for (const line of b) counts.set(line, (counts.get(line) ?? 0) - 1);
	let total = 0;
	for (const value of counts.values()) total += Math.abs(value);
	return total;
};

const skills = new Map();
for (const root of roots) {
	const label = labelFor(root);
	for (const skillsDir of skillDirsFor(root)) {
		for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name === "synced") continue;
			const dir = join(skillsDir, entry.name);
			if (!existsSync(join(dir, "SKILL.md"))) continue;
			const copies = skills.get(entry.name) ?? [];
			copies.push({ label, ...readSkill(dir) });
			skills.set(entry.name, copies);
		}
	}
}

const rows = [...skills.entries()]
	.map(([name, copies]) => {
		const newest = [...copies].sort((a, b) => b.newest - a.newest)[0];
		const diffs = copies.map((copy) => ({
			date: new Date(copy.newest).toISOString().slice(0, 10),
			diff: copy === newest ? 0 : lineDiff(copy.lines, newest.lines),
			label: copy.label,
		}));
		const state = copies.length === 1 ? "single" : diffs.every((d) => d.diff === 0) ? "identical" : "diverged";
		return { copies: diffs, name, newest: newest.label, state };
	})
	.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));

if (asJson) {
	console.log(JSON.stringify(rows, null, 2));
} else {
	for (const state of ["diverged", "identical", "single"]) {
		const group = rows.filter((row) => row.state === state);
		console.log(`\n## ${state} (${group.length})`);
		for (const row of group) {
			const detail = row.copies.map((c) => `${c.label}${c.diff ? `:${c.diff}` : ""}@${c.date.slice(5)}`).join(" ");
			console.log(`${row.name.padEnd(36)} newest=${row.newest.padEnd(18)} ${detail}`);
		}
	}
	console.log("\nNumbers after a repo name are changed lines versus the newest copy.");
}
