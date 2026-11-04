// Fixes for doctor findings, keyed by rule id; `agentry fix` (lib/fix.mjs) plans, previews, backs up and applies them.
// An entry is `(finding, ctx) => fix | fix[] | undefined`; the fix shape and `ctx` are documented at the top of lib/fix.mjs.
// A fix that cannot be made safe returns `{ ruleId, unfixable: "why" }` (or nothing), and the finding stays advice only.
// Rules without an entry here (missing-hook-file, plugin-not-installed, unset-placeholder, dup-skill-name)
// have no safe automatic edit.
//
// JSON files are edited as text through lib/json-edit.mjs, so untouched bytes stay identical. Findings carry little
// structure, so fixes read what they need from the finding's message (the doctor's own wording, lib/doctor-rules.mjs).

import { accessSync, constants, existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { extraPluginInstalls, renamePattern } from "./doctor-rules.mjs";
import { createJsonEdit } from "./json-edit.mjs";
import { createPluginsReader } from "./inventory/plugins.mjs";
import { maskShell } from "./mask.mjs";

const defaultRenames = () => JSON.parse(readFileSync(new URL("./renames.json", import.meta.url), "utf8"));

const isExecutable = (file) => {
	try {
		accessSync(file, constants.X_OK);
		return statSync(file).isFile();
	} catch {
		return false;
	}
};

const readJson = (file) => {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return undefined;
	}
};

const getPath = (json, path) => path.reduce((node, key) => (node !== null && typeof node === "object" ? node[key] : undefined), json);

// Where an MCP server entry lives in its file: local servers sit under the project's key in ~/.claude.json.
const serverPath = (ctx, scope, name) => (scope === "local" ? ["projects", ctx.paths.repoKey(ctx.cwd), "mcpServers", name] : ["mcpServers", name]);

const unfixable = (finding, reason) => ({ ruleId: finding.id, unfixable: reason });

// ---- MCP entries ----

const removeServer = (finding, ctx, { scope, name, describe }) => {
	const path = serverPath(ctx, scope, name);
	return {
		ruleId: finding.id,
		file: finding.file,
		describe: () => describe,
		apply: (text) => {
			const doc = createJsonEdit(text);
			if (doc.get(path) === undefined) {
				return text;
			}
			doc.deleteKey(path);
			return doc.text;
		},
	};
};

const REMOVABLE_SCOPES = new Set(["local", "project", "user", "desktop-config"]);

// The finding points at the entry that wins (the narrower scope); the broader copy is shared with other repos and stays.
// Removing the winner only changes nothing when both entries are the same, so differing entries are left to the user.
const dupMcpScope = (finding, ctx) => {
	const match = /^MCP server "(.*)" is defined in (\S+) scope \((.*)\) and also in (\S+) scope \((.*)\); the /.exec(finding.message);
	if (!match) {
		return undefined;
	}
	const [, name, winnerScope, winnerSource, shadowedScope, shadowedSource] = match;
	if (!REMOVABLE_SCOPES.has(winnerScope)) {
		return unfixable(finding, "the entry that loads is not in a file this tool edits");
	}
	const winner = getPath(readJson(winnerSource), serverPath(ctx, winnerScope, name));
	const shadowed = getPath(readJson(shadowedSource), serverPath(ctx, shadowedScope, name));
	if (winner === undefined || shadowed === undefined) {
		return unfixable(finding, "could not read both entries");
	}
	if (!isDeepStrictEqual(winner, shadowed)) {
		return unfixable(finding, `the ${winnerScope} and ${shadowedScope} entries differ, so choose which to keep yourself`);
	}
	return removeServer(finding, ctx, { scope: winnerScope, name, describe: `Remove "${name}" from the ${winnerScope} scope; the identical ${shadowedScope} entry stays` });
};

const dupMcpPlugin = (finding, ctx) => {
	const match = /^MCP server "(.*)" \((\S+)\) duplicates the server of enabled plugin (.+)$/.exec(finding.message);
	if (!match) {
		return undefined;
	}
	const [, name, scope, plugin] = match;
	if (!REMOVABLE_SCOPES.has(scope)) {
		return unfixable(finding, "the entry is not in a file this tool edits");
	}
	return removeServer(finding, ctx, { scope, name, describe: `Remove "${name}" from the ${scope} scope; plugin ${plugin} provides it` });
};

// The entry the reader found active: the local one in ~/.claude.json wins over the user one.
const missingMcpCommand = (finding, ctx) => {
	const match = /^MCP server "(.*)" runs ".*", which is not on PATH or does not exist$/.exec(finding.message);
	if (!match) {
		return undefined;
	}
	const name = match[1];
	const json = readJson(finding.file);
	if (json === undefined) {
		return unfixable(finding, "the file is not valid JSON, so it is left alone");
	}
	const scopes = finding.file === ctx.paths.claudeJson ? ["local", "user"] : finding.file.endsWith(".mcp.json") ? ["project"] : finding.file.endsWith("claude_desktop_config.json") ? ["desktop-config"] : [];
	const scope = scopes.find((item) => getPath(json, serverPath(ctx, item, name)) !== undefined);
	if (!scope) {
		return unfixable(finding, "the server comes from a plugin or extension, not a config file this tool edits");
	}
	return removeServer(finding, ctx, { scope, name, describe: `Remove the "${name}" entry (${scope} scope), whose command is missing` });
};

// ---- stale names ----

const PATH_LIKE = /^(~|\.{1,2}\/|\/|\$\{?HOME\}?|\$\{?CLAUDE_PROJECT_DIR\}?)/;

// Whether `changed` (a command string whose old name was just swapped) still points at things that exist: every word
// the swap touched must be a path that exists or, as the command itself, a program found on PATH. Anything else
// (a bare argument, a package name, an unexpanded variable) cannot be checked, so it is not safe. → reason | undefined
const unsafeWord = (before, changed, { commandPosition, ctx, onPath }) => {
	const words = changed.split(/(\s+)/);
	const old = before.split(/(\s+)/);
	let first = true;
	for (const [index, word] of words.entries()) {
		if (/^\s*$/.test(word)) {
			continue;
		}
		const isCommand = commandPosition && first && !/^[A-Za-z_]\w*=/.test(word);
		first &&= /^[A-Za-z_]\w*=/.test(word);
		if (word === old[index]) {
			continue;
		}
		const bare = word.replace(/^["'`]+|["'`]+$/g, "");
		if (PATH_LIKE.test(bare)) {
			const expanded = bare
				.replace(/^~(?=\/|$)/, ctx.paths.home)
				.replace(/^\$\{?HOME\}?/, ctx.paths.home)
				.replace(/^\$\{?CLAUDE_PROJECT_DIR\}?/, ctx.project.root);
			if (expanded.includes("$")) {
				return "the new path contains a variable that cannot be checked";
			}
			const target = resolve(ctx.project.root, expanded);
			if (!existsSync(target)) {
				return `the new path ${maskShell(target).replace(`${ctx.paths.home}/`, "~/")} does not exist`;
			}
		} else if (!(isCommand && onPath(bare, ctx))) {
			return isCommand ? "the new command is not on PATH" : "a renamed argument cannot be checked";
		}
	}
	return undefined;
};

const STALE_MESSAGE = /^(.*) still uses the old name "([^"]*)" \(now "([^"]*)"\)$/s;

// Which strings of a settings or MCP file a stale-name finding covers, from the doctor's wording. → { label, match(path), kind }
const staleScope = (what, json) => {
	let found;
	if ((found = /^Permission (allow|deny|ask) entry "(.*)"$/s.exec(what))) {
		const [, list, entry] = found;
		return { label: `permission ${list} entry`, kind: "plain", match: (path, value) => path[0] === "permissions" && path[1] === list && typeof path[2] === "number" && path.length === 3 && maskShell(value) === entry };
	}
	if ((found = /^MCP server "(.*)"$/s.exec(what))) {
		const name = found[1];
		return {
			label: `MCP server "${name}"`,
			kind: "command",
			match: (path) => {
				const at = path.indexOf("mcpServers");
				return at !== -1 && path[at + 1] === name && ((path.length === at + 3 && path[at + 2] === "command") || (path.length === at + 4 && path[at + 2] === "args"));
			},
			isCommand: (path) => path.at(-1) === "command",
			keyHolds: (pattern) => serverMaps(json).some((map) => name in map && pattern.test(name)),
		};
	}
	if ((found = /^(\S+) command$/.exec(what))) {
		return { label: `${found[1]} command`, kind: "command", isCommand: () => true, match: (path) => path.length === 2 && path[0] === found[1] && path[1] === "command" };
	}
	if ((found = /^(\S+) hook matcher$/.exec(what))) {
		return { label: `${found[1]} hook matcher`, kind: "plain", dedupe: true, match: (path) => path[0] === "hooks" && path[1] === found[1] && path.at(-1) === "matcher" };
	}
	if ((found = /^(\S+) hook$/.exec(what))) {
		return { label: `${found[1]} hook command`, kind: "command", isCommand: () => true, match: (path) => path[0] === "hooks" && path[1] === found[1] && path.at(-1) === "command" };
	}
	return undefined;
};

const serverMaps = (json) => [json?.mcpServers, ...Object.values(json?.projects ?? {}).map((project) => project?.mcpServers)].filter((map) => map && typeof map === "object");

const staleName = (finding, ctx, { renames, onPath }) => {
	const found = STALE_MESSAGE.exec(finding.message);
	if (!found || !(found[2] in renames)) {
		return undefined;
	}
	const [, what, from, to] = found;
	let json;
	try {
		json = JSON.parse(readFileSync(finding.file, "utf8"));
	} catch {
		return unfixable(finding, "the file is not valid JSON, so it is left alone");
	}
	const scope = staleScope(what, json);
	if (!scope) {
		return undefined;
	}
	const pattern = renamePattern(from);
	const global = new RegExp(pattern.source, "g");
	// Pure over the text: the swapped text plus the first reason a swap was unsafe.
	const swap = (text) => {
		const doc = createJsonEdit(text);
		let blocked;
		const count = doc.renameInStrings((value, path) => {
			if (!scope.match(path, value) || !pattern.test(value)) {
				return undefined;
			}
			const swapped = value.replace(global, to);
			// A matcher that already lists the new name would list it twice.
			const next = scope.dedupe ? [...new Set(swapped.split("|"))].join("|") : swapped;
			if (scope.kind === "command") {
				blocked ??= unsafeWord(value, next, { commandPosition: scope.isCommand(path), ctx, onPath });
			}
			return next;
		});
		if (scope.keyHolds?.(pattern)) {
			blocked ??= "the server's name is a key in the file; rename it with claude mcp remove and add";
		}
		return { text: doc.text, count, blocked };
	};
	let planned;
	try {
		planned = swap(readFileSync(finding.file, "utf8"));
	} catch (error) {
		return unfixable(finding, `could not edit the file (${error.code ?? error.name})`);
	}
	if (planned.blocked) {
		return unfixable(finding, `swapping "${from}" for "${to}" in the ${scope.label} would break it: ${planned.blocked}`);
	}
	if (planned.count === 0) {
		return undefined;
	}
	return {
		ruleId: finding.id,
		file: finding.file,
		describe: () => `Replace "${from}" with "${to}" in the ${scope.label}`,
		apply: (text) => {
			const result = swap(text);
			return result.blocked ? text : result.text;
		},
	};
};

// ---- links, skills, plugins ----

const brokenSkillLink = (finding) => {
	const name = /^Skill link "(.*)" points at /.exec(finding.message)?.[1] ?? "skill";
	try {
		if (!lstatSync(finding.file).isSymbolicLink()) {
			return unfixable(finding, "it is not a symlink");
		}
	} catch {
		return undefined;
	}
	return { ruleId: finding.id, file: finding.file, describe: () => `Remove the broken skill link "${name}"`, apply: () => ({ command: ["rm", "--", finding.file], cwd: dirname(finding.file) }) };
};

// The shelf keeps an identical copy, so removing the global one loses nothing; the skill loads again with `agentry shelf on`.
// (`agentry shelf shelve` cannot be used: it refuses to overwrite the existing shelf copy.)
const shelfDuplicate = (finding) => {
	const found = /^Global skill "(.*)" is identical to the shelved copy ([^,;]+)/.exec(finding.message);
	if (!found) {
		return undefined;
	}
	try {
		if (!lstatSync(finding.file).isDirectory()) {
			return unfixable(finding, "it is a link, not a folder");
		}
	} catch {
		return undefined;
	}
	const [, name, copy] = found;
	return {
		ruleId: finding.id,
		file: finding.file,
		describe: () => `Remove the global copy of skill "${name}"; the shelf keeps ${copy} (agentry shelf on ${copy} loads it again)`,
		apply: () => ({ command: ["rm", "-r", "--", finding.file], cwd: dirname(finding.file) }),
	};
};

// One `claude plugin uninstall` per extra install, run from the install's project folder.
const dupPluginScope = (finding, ctx) => {
	const id = /^(\S+) is installed at /.exec(finding.message)?.[1];
	const plugin = createPluginsReader(ctx.paths).read({ cwd: ctx.cwd }).plugins.find((item) => item.id === id);
	if (!plugin) {
		return unfixable(finding, "could not find the plugin's installs");
	}
	return extraPluginInstalls(plugin).map((install) => {
		const cwd = install.projectPath ?? ctx.cwd;
		return {
			ruleId: finding.id,
			file: finding.file,
			describe: () => `Uninstall ${id} from ${install.scope} scope${install.projectPath ? ` (project ${install.projectPath})` : ""}`,
			apply: () => (existsSync(cwd) ? { command: ["claude", "plugin", "uninstall", id, "--scope", install.scope], cwd } : undefined),
		};
	});
};

export const createFixes = ({ renames = defaultRenames(), env = process.env } = {}) => {
	// A bare command found on PATH (or ~-prefixed path) that is executable.
	const onPath = (command) => (env.PATH ?? "").split(delimiter).some((dir) => dir && isExecutable(join(dir, command)));
	return {
		"dup-mcp-scope": dupMcpScope,
		"dup-mcp-plugin": dupMcpPlugin,
		"missing-mcp-command": missingMcpCommand,
		"stale-name": (finding, ctx) => staleName(finding, ctx, { renames, onPath }),
		"broken-skill-link": brokenSkillLink,
		"shelf-duplicate": shelfDuplicate,
		"dup-plugin-scope": dupPluginScope,
	};
};

export const fixes = createFixes();
