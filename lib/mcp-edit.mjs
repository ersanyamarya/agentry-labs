// `agentry mcp add` and `agentry mcp set`: create an MCP server, or change the env and args of an existing user-scope one.
//
// add:  user scope (default) runs `claude mcp add-json <name> <json> --scope user`, project scope adds the entry to the
//       project's .mcp.json (created when missing) as a text edit. A server named <name> in that scope is refused (never
//       overwritten). Project servers still need Claude Code's own approval on first use.
// set:  user scope only; edits the `env` and `args` of the entry in ~/.claude.json as a text edit (lib/json-edit.mjs), so the
//       rest of the file stays byte for byte. --env K=V sets or replaces, --unset-env K removes, --arg replaces the whole args list.
//       Plugin, project, local and desktop servers are refused with who manages them.
//
// Both go through the fix engine (lib/fix.mjs): masked preview (env and header values, tokens in URLs and arguments never
// show), confirm or --yes, a backup of the file first, `agentry fix --undo`. `claude mcp add-json` takes the JSON as an
// argument, so for the moment it runs the secrets are visible in this machine's process list (same as lib/mcp-toggle.mjs).
// Exit codes: 0 done, previewed, declined or already so; 1 refused or failed; 2 usage.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createFix } from "./fix.mjs";
import { isObject, readJson } from "./inventory/common.mjs";
import { createMcpReader } from "./inventory/mcp.mjs";
import { createJsonEdit } from "./json-edit.mjs";
import { summarize } from "./mcp-toggle.mjs";

const RULE = "mcp-edit";
const PLACEHOLDER = "<new config>";
export const APPLIES_NOTE = "Applies to sessions started after this.";
const NAME = /^[A-Za-z0-9_.:-]+$/;

// "K=V" (env) or "K:V" (header) items → { map } or { error }. The first separator splits; the value may contain more.
export const parsePairs = (items, separator, what) => {
	const map = {};
	for (const item of items ?? []) {
		const at = String(item).indexOf(separator);
		const key = at > 0 ? String(item).slice(0, at).trim() : "";
		if (!key) {
			return { error: `${what} needs ${separator === "=" ? "KEY=VALUE" : "KEY:VALUE"}, got "${String(item).split(separator)[0]}"` };
		}
		map[key] = String(item).slice(at + 1).trim();
	}
	return { map };
};

const MANAGED_BY = { plugin: "managed by its plugin", project: "a project server (.mcp.json)", local: "a local-scope server", "desktop-config": "managed by Claude desktop", "desktop-extension": "managed by Claude desktop" };

export const createMcpEdit = (paths, { out = console.log, err = console.error, ...fixOptions } = {}) => {
	const reader = createMcpReader(paths, { platform: fixOptions.platform ?? process.platform });
	const tilde = (text) => (paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text));
	const userRaw = (name) => {
		const raw = readJson(paths.claudeJson, [])?.mcpServers?.[name];
		return isObject(raw) ? raw : undefined;
	};
	const spawn = fixOptions.runCommand ?? ((command, options) => {
		const result = spawnSync(command[0], command.slice(1), { cwd: options.cwd, encoding: "utf8" });
		return { status: result.error ? null : result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.code };
	});

	// → { raw } for the server config, or { error }; command servers take args and env, url servers headers.
	const build = ({ command, args = [], env = [], url, headers = [] }) => {
		if ((command === undefined) === (url === undefined)) {
			return { error: "Give exactly one of --command and --url." };
		}
		const [envPairs, headerPairs] = [parsePairs(env, "=", "--env"), parsePairs(headers, ":", "--header")];
		if (envPairs.error || headerPairs.error) {
			return { error: envPairs.error ?? headerPairs.error };
		}
		if (command !== undefined) {
			if (!command.trim() || headers.length > 0) {
				return { error: headers.length > 0 ? "--header goes with --url." : "--command is empty." };
			}
			return { raw: { type: "stdio", command, args: [...args], ...(Object.keys(envPairs.map).length > 0 && { env: envPairs.map }) } };
		}
		if (!/^https?:\/\/\S+$/.test(url) || args.length > 0 || env.length > 0) {
			return { error: args.length > 0 || env.length > 0 ? "--arg and --env go with --command." : "--url must be an http(s) URL." };
		}
		return { raw: { type: "http", url, ...(Object.keys(headerPairs.map).length > 0 && { headers: headerPairs.map }) } };
	};

	const add = async ({ name, scope = "user", path, yes = false, dryRun = false, ...config }) => {
		const cwd = resolve(path ?? process.cwd());
		if (!name || !NAME.test(name)) {
			err("Usage: agentry mcp add <name> (--command <cmd> [--arg A]... [--env K=V]... | --url <url> [--header K:V]...) [--scope user|project]");
			return 2;
		}
		if (scope !== "user" && scope !== "project") {
			err("--scope must be user or project");
			return 2;
		}
		const { raw, error } = build(config);
		if (error) {
			err(error);
			return 2;
		}
		const file = scope === "user" ? paths.claudeJson : join(paths.projectRoot(cwd), ".mcp.json");
		const exists = () => (scope === "user" ? Boolean(userRaw(name)) : isObject(readJson(file, [])?.mcpServers?.[name]));
		if (exists()) {
			err(`refused: a ${scope}-scope server named ${name} already exists; not overwriting it (agentry mcp remove ${name} first, or agentry mcp set to change env and args).`);
			return 1;
		}
		if (scope === "project" && !existsSync(dirname(file))) {
			err(`refused: ${tilde(dirname(file))} does not exist.`);
			return 1;
		}
		const finding = { id: RULE, severity: "info", message: `${name} should exist in ${scope} scope`, file };
		const doctor = () => ({ collect: () => ({ project: { cwd, root: paths.projectRoot(cwd) }, findings: exists() ? [] : [finding], errors: [] }) });
		const editText = (text) => {
			if (text === undefined || text.trim() === "") {
				return `${JSON.stringify({ mcpServers: { [name]: raw } }, null, "\t")}\n`;
			}
			const doc = createJsonEdit(text);
			doc.get(["mcpServers"]) === undefined ? doc.set(["mcpServers"], { [name]: raw }) : doc.set(["mcpServers", name], raw);
			return doc.text;
		};
		const fixes = {
			[RULE]: () => ({
				ruleId: RULE,
				file,
				describe: () => `Add ${scope} MCP server ${name} (${summarize(raw)})`,
				apply: scope === "user" ? () => ({ command: ["claude", "mcp", "add-json", name, PLACEHOLDER, "--scope", "user"], cwd: paths.home ?? cwd }) : editText,
			}),
		};
		// Runs at apply time only (after the preview and the confirm).
		const runCommand = (command, options) => spawn(command.map((part) => (part === PLACEHOLDER ? JSON.stringify(raw) : part)), options);
		const code = await createFix(paths, { out, err, doctor, fixes, ...fixOptions, runCommand }).run({ path: cwd, yes, dryRun });
		if (code === 0 && !dryRun && exists()) {
			out(`${name} is added to ${scope} scope.${scope === "project" ? " Claude Code asks you to approve a project server the first time it loads." : ""} ${APPLIES_NOTE}`);
		}
		return code;
	};

	// env: ["K=V"...] to set, unsetEnv: ["K"...], args: ["a"...] replaces the list (undefined keeps it).
	const set = async ({ name, env = [], unsetEnv = [], args, path, yes = false, dryRun = false }) => {
		const cwd = resolve(path ?? process.cwd());
		const { map: setEnv, error } = parsePairs(env, "=", "--env");
		if (!name || error || (env.length === 0 && unsetEnv.length === 0 && args === undefined)) {
			err(error ?? "Usage: agentry mcp set <name> [--env K=V]... [--unset-env K]... [--arg A]...");
			return 2;
		}
		const current = userRaw(name);
		if (!current) {
			const other = reader.read({ cwd }).servers.find((server) => server.name === name);
			err(`refused: ${other ? `${name} is ${MANAGED_BY[other.scope] ?? `a ${other.scope} server`}, which this tool does not edit` : `No user-scope MCP server "${name}"`}.`);
			return 1;
		}
		const stdio = typeof current.command === "string";
		if (!stdio && (env.length > 0 || unsetEnv.length > 0 || args !== undefined)) {
			err(`refused: ${name} is a url server; env and args only exist on command servers.`);
			return 1;
		}
		const nextEnv = (from) => {
			const merged = { ...(isObject(from) ? from : {}), ...setEnv };
			unsetEnv.forEach((key) => delete merged[key]);
			return merged;
		};
		const wanted = (raw) => JSON.stringify(nextEnv(raw.env)) === JSON.stringify(isObject(raw.env) ? raw.env : {}) && (args === undefined || JSON.stringify(args) === JSON.stringify(raw.args ?? []));
		if (wanted(current)) {
			out(`${name} already has that env and args; nothing to change.`);
			return 0;
		}
		const file = paths.claudeJson;
		const finding = { id: RULE, severity: "info", message: `${name} env/args should be changed`, file };
		const doctor = () => ({ collect: () => ({ project: { cwd, root: paths.projectRoot(cwd) }, findings: wanted(userRaw(name) ?? current) ? [] : [finding], errors: [] }) });
		const parts = [...(env.length > 0 ? [`set env ${Object.keys(setEnv).join(", ")}`] : []), ...(unsetEnv.length > 0 ? [`unset env ${unsetEnv.join(", ")}`] : []), ...(args !== undefined ? [`replace args (${args.length})`] : [])];
		const fixes = {
			[RULE]: () => ({
				ruleId: RULE,
				file,
				describe: () => `Edit user MCP server ${name}: ${parts.join("; ")}`,
				apply: (text) => {
					const doc = createJsonEdit(text);
					const now = doc.get(["mcpServers", name]);
					if (!isObject(now)) {
						return text;
					}
					const merged = nextEnv(now.env);
					if (JSON.stringify(merged) !== JSON.stringify(isObject(now.env) ? now.env : {})) {
						if (Object.keys(merged).length === 0) {
							doc.deleteKey(["mcpServers", name, "env"]);
						} else {
							doc.set(["mcpServers", name, "env"], merged);
						}
					}
					if (args !== undefined) {
						doc.set(["mcpServers", name, "args"], args);
					}
					return doc.text;
				},
			}),
		};
		const code = await createFix(paths, { out, err, doctor, fixes, ...fixOptions }).run({ path: cwd, yes, dryRun });
		if (code === 0 && !dryRun) {
			out(`${name} is updated. ${APPLIES_NOTE}`);
		}
		return code;
	};

	return { add, set, build };
};
