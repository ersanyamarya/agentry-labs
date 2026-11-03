// `agentry doctor`: runs the rules in lib/doctor-rules.mjs over what the inventory readers find and reports findings
// `{ id, severity, message, file, line?, fix? }`. Read-only: `fix` is advice, never applied here. Exit code 1 only on errors.

import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { settingsLayers, uniqueErrors } from "./inventory/common.mjs";
import { createHooksReader } from "./inventory/hooks.mjs";
import { createMcpReader } from "./inventory/mcp.mjs";
import { createPluginsReader } from "./inventory/plugins.mjs";
import { createSkillsReader } from "./inventory/skills.mjs";
import { rules as defaultRules } from "./doctor-rules.mjs";

const SEVERITIES = ["error", "warning", "info"];

const defaultRenames = () => JSON.parse(readFileSync(new URL("./renames.json", import.meta.url), "utf8"));

// Only whether the variable is set matters; the value is never read into output.
export const defaultLaunchctlGetenv = (name) => {
	try {
		return execFileSync("launchctl", ["getenv", name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return "";
	}
};

export const createDoctor = (paths, { out = console.log, err = console.error, platform = process.platform, env = process.env, rules = defaultRules, renames = defaultRenames(), launchctlGetenv = defaultLaunchctlGetenv } = {}) => {
	const skillsReader = createSkillsReader(paths);
	const mcpReader = createMcpReader(paths, { platform });
	const hooksReader = createHooksReader(paths);
	const pluginsReader = createPluginsReader(paths);

	const executable = (file) => {
		try {
			accessSync(file, constants.X_OK);
			return statSync(file).isFile();
		} catch {
			return false;
		}
	};
	const which = (command) => {
		const expanded = command.replace(/^~(?=\/|$)/, paths.home);
		if (expanded.includes("/")) {
			return executable(expanded);
		}
		return (env.PATH ?? "").split(delimiter).some((dir) => dir && executable(join(dir, expanded)));
	};

	// The (skip+1)th line (1-based) of `file` that contains `needle`; best effort, undefined when not found.
	const lineCache = new Map();
	const line = (file, needle, skip = 0) => {
		if (!lineCache.has(file)) {
			try {
				lineCache.set(file, readFileSync(file, "utf8").split("\n"));
			} catch {
				lineCache.set(file, []);
			}
		}
		const lines = lineCache.get(file);
		let index = -1;
		for (let seen = 0; seen <= skip; seen++) {
			index = lines.findIndex((text, at) => at > index && text.includes(needle));
			if (index === -1) {
				return undefined;
			}
		}
		return index + 1;
	};

	const collect = (cwd = process.cwd()) => {
		const start = resolve(cwd);
		const readErrors = [];
		const skills = skillsReader.read({ cwd: start });
		const mcp = mcpReader.read({ cwd: start });
		const hookResult = hooksReader.read({ cwd: start });
		const pluginResult = pluginsReader.read({ cwd: start });
		const layers = settingsLayers(paths, start, readErrors);
		const project = { cwd: start, root: paths.projectRoot(start) };
		const ctx = {
			cwd: start,
			paths,
			platform,
			project,
			skills: { items: skills.skills },
			mcp: { servers: mcp.servers },
			hooks: { items: hookResult.hooks },
			plugins: { items: pluginResult.plugins },
			layers,
			renames,
			which,
			launchctlGetenv,
			line,
		};

		const findings = [];
		const ruleErrors = [];
		for (const rule of rules) {
			try {
				findings.push(...rule.run(ctx));
			} catch (error) {
				ruleErrors.push({ source: `rule ${rule.id}`, message: `failed (${error.code ?? error.name})` });
			}
		}
		findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.id.localeCompare(b.id) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
		const summary = Object.fromEntries(SEVERITIES.map((severity) => [severity, findings.filter((item) => item.severity === severity).length]));
		return { version: 1, project, findings, summary, errors: uniqueErrors([...skills.errors, ...mcp.errors, ...hookResult.errors, ...pluginResult.errors, ...readErrors, ...ruleErrors]) };
	};

	const printHuman = (data) => {
		const tilde = (text) => (paths.home ? text.replaceAll(`${paths.home}/`, "~/") : text);
		if (data.findings.length === 0) {
			out("No problems found.");
		}
		for (const item of data.findings) {
			out(`${item.severity}  [${item.id}]  ${tilde(item.message)}`);
			out(`  ${tilde(item.file)}${item.line ? `:${item.line}` : ""}`);
			if (item.fix) {
				out(`  fix: ${tilde(item.fix).replaceAll("\n", "\n       ")}`);
			}
		}
		const { error, warning, info } = data.summary;
		if (data.findings.length > 0) {
			out(`\n${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"}${info ? `, ${info} info` : ""}`);
		}
		for (const item of data.errors) {
			out(`warning: ${tilde(item.source)}: ${item.message}`);
		}
	};

	// Returns the exit code: 1 only when an error-severity finding exists, 2 for a bad folder.
	const run = ({ path, json = false } = {}) => {
		const cwd = resolve(path ?? process.cwd());
		if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
			err(`Not a folder: ${cwd}`);
			return 2;
		}
		const data = collect(cwd);
		if (json) {
			out(JSON.stringify(data, null, 2));
		} else {
			printHuman(data);
		}
		return data.summary.error > 0 ? 1 : 0;
	};

	return { collect, run };
};
