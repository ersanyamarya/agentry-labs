#!/usr/bin/env node
// PreToolUse hook: in a repo indexed by trail (a graft/ or .trail/ folder), deny grep/rg/find/cat/head/tail, Grep, Glob and a
// whole-file Read of source code, and point at the trail tool to use. A speed bump, not a wall:
//   - end a Bash command with `# no-trail: <why>` to run it anyway (the reason is logged to ~/.claude/trail-bypass.log);
//   - a whole-file Read is denied once per file per session, the retry goes through (Read with offset or limit always does);
//   - set PREFER_TRAIL=off to turn the hook off.
// Fails open: any error, a missing marker folder or an unknown payload lets the call run.

import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

const CODE = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|dart|rb|php|c|cc|cpp|h|hpp|cs|scala|sh)$/i;
const SEARCH = new Set(["grep", "egrep", "fgrep", "rg", "ag", "ack", "find", "fd", "cat", "head", "tail"]);
const SKIP_DIRS = ["node_modules", "dist", "build", ".git", "graft", ".trail"];

const TOOLS = {
	search: "trail_find_all (every occurrence) or trail_find_code (how/where)",
	read: "trail_file_api (a file's API) or trail_find_code (code inline)",
	glob: "trail_repo_map or trail_file_api",
};

export const repoRoot = (cwd) => {
	for (let dir = resolve(cwd), i = 0; i < 12; i++, dir = dirname(dir)) {
		if (existsSync(join(dir, "graft")) || existsSync(join(dir, ".trail"))) return dir;
		if (dirname(dir) === dir) break;
	}
	return null;
};

const inside = (root, path) => path === root || path.startsWith(root + sep);
const skipped = (root, path) => SKIP_DIRS.some((name) => inside(join(root, name), path));
const isDir = (path) => {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
};

// Source files and directories inside the repo are worth sending to trail; docs, configs, logs and other repos are not.
const indexed = (root, path) => inside(root, path) && !skipped(root, path) && (CODE.test(path) || isDir(path));

const commands = (text) => {
	// The command that starts each pipeline: `git log | grep fix` filters output and is fine, `grep fix src` is not.
	const found = [];
	for (const pipeline of text.split(/&&|\|\||;|\n/)) {
		const first = pipeline.split(/(?<!\|)\|(?!\|)/)[0].trim();
		const words = first.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
		while (words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]) || words[0] === "sudo" || words[0] === "command")) words.shift();
		if (words.length && SEARCH.has(words[0].replace(/^.*\//, ""))) found.push(words.map((w) => w.replace(/^["']|["']$/g, "")));
	}
	return found;
};

const targets = ([name, ...args], cwd) => {
	const rest = args.filter((a) => !a.startsWith("-"));
	if (/^(?:e?f?grep|rg|ag|ack|fd)$/.test(name)) rest.shift(); // the pattern
	return rest.map((a) => (isAbsolute(a) ? a : resolve(cwd, a)));
};

const hits = (root, cwd, command) =>
	commands(command).some((words) => {
		if (words[0] === "cat" && words.some((w) => w.startsWith("<<") || w.startsWith(">"))) return false;
		const paths = targets(words, cwd);
		return paths.length ? paths.some((p) => indexed(root, p)) : inside(root, resolve(cwd)) && !skipped(root, resolve(cwd));
	});

const deny = (reason) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });

const marker = (command) => command.match(/#\s*no-trail:\s*(.+)$/m)?.[1].trim();

const logBypass = (cwd, reason, command, home) => {
	try {
		appendFileSync(join(home, ".claude", "trail-bypass.log"), `${new Date().toISOString()}\t${cwd}\t${reason}\t${command.replace(/\s+/g, " ").slice(0, 200)}\n`);
	} catch {
		// logging is best effort
	}
};

// Whole-file Read: denied once per (session, file), then allowed.
const firstRead = (session, file) => {
	const store = join(tmpdir(), `prefer-trail-${String(session).replace(/[^\w-]/g, "_")}.json`);
	let seen = [];
	try {
		seen = JSON.parse(readFileSync(store, "utf8"));
	} catch {
		// first time
	}
	if (seen.includes(file)) return false;
	try {
		writeFileSync(store, JSON.stringify([...seen, file]));
	} catch {
		return false;
	}
	return true;
};

export const decide = (input, { home = homedir(), env = process.env } = {}) => {
	if (!input || env.PREFER_TRAIL === "off" || env.TRAIL_NO_HOOKS === "1") return null;
	const cwd = input.cwd || env.CLAUDE_PROJECT_DIR || process.cwd();
	const root = repoRoot(env.CLAUDE_PROJECT_DIR || cwd);
	if (!root) return null;
	const tool = input.tool_name;
	const args = input.tool_input ?? {};

	if (tool === "Bash" && typeof args.command === "string") {
		if (!hits(root, cwd, args.command)) return null;
		const why = marker(args.command);
		if (why) {
			logBypass(cwd, why, args.command, home);
			return null;
		}
		return deny(`This repo is indexed by trail. Use ${TOOLS.search} instead of grep/find/cat. If trail cannot answer (exact text, unindexed or generated file), rerun the same command ending in "# no-trail: <why>".`);
	}
	if (tool === "Grep" || tool === "Glob") {
		const path = args.path ? resolve(cwd, args.path) : resolve(cwd);
		if (!inside(root, path) || skipped(root, path)) return null;
		return deny(`This repo is indexed by trail. Use ${tool === "Grep" ? TOOLS.search : TOOLS.glob} instead of ${tool}. If trail cannot answer, use Bash with a trailing "# no-trail: <why>".`);
	}
	if (tool === "Read" && typeof args.file_path === "string") {
		const file = resolve(cwd, args.file_path);
		if (args.offset !== undefined || args.limit !== undefined || !CODE.test(file) || !indexed(root, file)) return null;
		if (!firstRead(input.session_id ?? "none", file)) return null;
		return deny(`This repo is indexed by trail. Use ${TOOLS.read} for ${file.slice(root.length + 1)}. If you are about to edit it, repeat the Read: the second whole-file Read goes through.`);
	}
	return null;
};

const main = () => {
	try {
		if (process.stdin.isTTY) return;
		const input = JSON.parse(readFileSync(0, "utf8"));
		const decision = decide(input);
		if (decision) process.stdout.write(JSON.stringify(decision));
	} catch {
		// fail open
	}
};

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) main();
