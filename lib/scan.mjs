// `agentry scan [roots...]`: runs the status and doctor collectors over every git repo and worktree under the roots and
// prints one row per repo. Findings in user-level files are reported once in a "global" block, not per repo. Read-only;
// per-repo results are cached (lib/scan-cache.mjs) until a file they read changes.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { createDiscover } from "./discover.mjs";
import { createDoctor, defaultLaunchctlGetenv } from "./doctor.mjs";
import { createScanCache } from "./scan-cache.mjs";
import { createStatus } from "./status.mjs";

const SEVERITIES = ["error", "warning", "info"];

const here = new URL(".", import.meta.url).pathname;

// Cache version: package version plus the newest mtime of the CLI's own code, so a changed rule never serves old results.
const codeVersion = () => {
	let newest = 0;
	const visit = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const file = join(dir, entry.name);
			if (entry.isDirectory()) {
				visit(file);
			} else {
				newest = Math.max(newest, statSync(file).mtimeMs);
			}
		}
	};
	try {
		visit(here);
		return `${JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version}:${newest}`;
	} catch {
		return "";
	}
};

const summarize = (findings) => Object.fromEntries(SEVERITIES.map((severity) => [severity, findings.filter((item) => item.severity === severity).length]));

export const createScan = (paths, { out = console.log, err = console.error, platform = process.platform, env = process.env, status, doctor, discover = createDiscover() } = {}) => {
	const statusCollector = status ?? createStatus(paths, { platform });
	const launchctlAnswers = new Map();
	const launchctlGetenv = (name) => {
		if (!launchctlAnswers.has(name)) {
			launchctlAnswers.set(name, defaultLaunchctlGetenv(name));
		}
		return launchctlAnswers.get(name);
	};
	const doctorCollector = doctor ?? createDoctor(paths, { platform, env, launchctlGetenv });
	const under = (file, dir) => file === dir || file.startsWith(dir + sep);

	// A finding is global when it lives in a user-level file. A local-scope server entry also lives in ~/.claude.json
	// but belongs to one repo, so `dup-mcp-scope` (which points at the winning, narrower entry) stays with the repo.
	const isGlobal = (item) => {
		const userDirs = [paths.configDir, paths.desktopDir, paths.pluginsDir];
		return userDirs.some((dir) => under(item.file, dir)) || (item.file === paths.claudeJson && item.id !== "dup-mcp-scope");
	};

	// Every file a repo's result depends on: the places the readers look (so a new file is noticed) plus every source
	// the result names. Folders are included so an added or removed entry changes the stamp.
	const touchedFiles = (repo, data, findings) => {
		const files = [
			join(paths.configDir, "settings.json"),
			join(paths.configDir, "skills"),
			join(paths.configDir, "skill-shelf"),
			join(paths.pluginsDir, "installed_plugins.json"),
			join(paths.pluginsDir, "known_marketplaces.json"),
			paths.claudeJson,
			join(paths.desktopDir, "claude_desktop_config.json"),
			join(paths.desktopDir, "Claude Extensions"),
			join(paths.desktopDir, "Claude Extensions Settings"),
			join(repo, ".git"),
		];
		for (const dir of new Set([repo, data.project.root])) {
			files.push(join(dir, ".claude", "settings.json"), join(dir, ".claude", "settings.local.json"), join(dir, ".claude", "skills"), join(dir, "bundles.tsv"));
		}
		for (let dir = repo; ; dir = dirname(dir)) {
			files.push(join(dir, ".mcp.json"));
			if (dirname(dir) === dir) {
				break;
			}
		}
		for (const skill of data.skills.items) {
			files.push(skill.source, join(skill.source, "SKILL.md"));
		}
		for (const server of data.mcp.servers) {
			files.push(server.source);
		}
		for (const hook of data.hooks.items) {
			files.push(hook.source);
		}
		for (const plugin of data.plugins.items) {
			files.push(plugin.installPath, plugin.enabledBy?.source);
		}
		files.push(...data.errors.map((error) => error.source), ...findings.map((item) => item.file));
		return files.filter((file) => typeof file === "string" && file.startsWith("/"));
	};

	const loading = (item) => item.state === "active";

	const scanRepo = (repo) => {
		const data = statusCollector.collect(repo.path);
		const diagnosis = doctorCollector.collect(repo.path);
		const userScope = (item) => item.scope === "user" || item.scope === "desktop-config" || item.scope === "desktop-extension";
		const countOf = (filter) => ({
			skills: data.skills.items.filter((item) => loading(item) && filter(item)).length,
			mcp: data.mcp.servers.filter((item) => loading(item) && filter(item)).length,
			hooks: data.hooks.items.filter((item) => loading(item) && filter(item)).length,
			plugins: data.plugins.items.filter((item) => loading(item) && filter(item)).length,
		});
		const result = {
			path: repo.path,
			kind: repo.kind,
			root: data.project.root,
			counts: countOf(() => true),
			userCounts: countOf(userScope),
			tokens: data.tokens.measured,
			userTokens: data.skills.items.filter((item) => loading(item) && item.scope === "user").reduce((total, item) => total + (item.tokens ?? 0), 0),
			findings: diagnosis.findings,
			errors: [...data.errors, ...diagnosis.errors].filter((error, at, all) => all.findIndex((other) => other.source === error.source && other.message === error.message) === at),
		};
		return { result, files: touchedFiles(repo.path, data, diagnosis.findings) };
	};

	const collect = (roots, { depth = 4, cache = true } = {}) => {
		const store = createScanCache(paths, { enabled: cache, version: codeVersion() });
		const repos = discover.find(roots, { depth });
		let hits = 0;
		const results = repos.map((repo) => {
			const cached = store.get(repo.path);
			if (cached) {
				hits++;
				return cached;
			}
			const { result, files } = scanRepo(repo);
			store.set(repo.path, files, result);
			return result;
		});

		const globalFindings = new Map();
		const rows = results.map((result) => {
			const mine = [];
			for (const item of result.findings) {
				if (isGlobal(item)) {
					globalFindings.set(JSON.stringify([item.id, item.file, item.line, item.message]), item);
				} else {
					mine.push(item);
				}
			}
			const { findings: _all, userCounts: _u, userTokens: _t, errors, ...rest } = result;
			return { ...rest, findings: mine, summary: summarize(mine), errors: errors.filter((error) => !under(error.source, paths.configDir) && error.source !== paths.claudeJson) };
		});
		rows.sort((a, b) => b.summary.error - a.summary.error || b.summary.warning - a.summary.warning || b.summary.info - a.summary.info || a.path.localeCompare(b.path));

		const first = results[0];
		const globalList = [...globalFindings.values()].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.id.localeCompare(b.id) || a.file.localeCompare(b.file));
		const globalErrors = results.flatMap((result) => result.errors).filter((error, at, all) => (under(error.source, paths.configDir) || error.source === paths.claudeJson) && all.findIndex((other) => other.source === error.source && other.message === error.message) === at);
		const total = summarize([...globalList, ...rows.flatMap((row) => row.findings)]);
		return {
			version: 1,
			roots: roots.map((root) => resolve(root)),
			depth,
			global: { counts: first?.userCounts ?? { skills: 0, mcp: 0, hooks: 0, plugins: 0 }, tokens: first?.userTokens ?? 0, findings: globalList, summary: summarize(globalList), errors: globalErrors },
			repos: rows,
			totals: { repos: rows.length, ...total },
			cache: { enabled: cache, hits, misses: rows.length - hits },
		};
	};

	const printHuman = (data, { onlyProblems }) => {
		const tilde = (text) => (paths.home ? text.replaceAll(`${paths.home}/`, "~/") : text);
		const shown = onlyProblems ? data.repos.filter((row) => row.findings.length > 0) : data.repos;
		const label = (row) => `${tilde(row.path)}${row.kind === "worktree" ? " (worktree)" : ""}`;
		const problems = (summary) => (summary.error + summary.warning + summary.info === 0 ? "-" : `${summary.error}E ${summary.warning}W${summary.info ? ` ${summary.info}I` : ""}`);

		const g = data.global;
		out(`Global (user-level): ${g.counts.skills} skills (~${g.tokens} tokens), ${g.counts.mcp} MCP, ${g.counts.hooks} hooks, ${g.counts.plugins} plugins; ${problems(g.summary) === "-" ? "no findings" : problems(g.summary)}`);
		for (const item of g.findings) {
			out(`  ${item.severity}  [${item.id}]  ${tilde(item.message)}`);
			out(`    ${tilde(item.file)}${item.line ? `:${item.line}` : ""}`);
		}
		for (const error of g.errors) {
			out(`  warning: ${tilde(error.source)}: ${error.message}`);
		}

		out("");
		const header = ["repo", "skills", "mcp", "hooks", "plugins", "~tokens", "findings"];
		const body = shown.map((row) => [label(row), row.counts.skills, row.counts.mcp, row.counts.hooks, row.counts.plugins, row.tokens, problems(row.summary)].map(String));
		const widths = header.map((title, at) => Math.max(title.length, ...body.map((cells) => cells[at].length)));
		const line = (cells) => cells.map((cell, at) => (at === 0 || at === 6 ? cell.padEnd(widths[at]) : cell.padStart(widths[at]))).join("  ").trimEnd();
		if (shown.length === 0) {
			out(onlyProblems ? "No repos with findings." : "No git repos found.");
		} else {
			out(line(header));
			for (const cells of body) {
				out(line(cells));
			}
		}
		for (const row of shown.filter((entry) => entry.findings.length > 0)) {
			out(`\n${label(row)}`);
			for (const item of row.findings) {
				out(`  ${item.severity}  [${item.id}]  ${tilde(item.message)}\n    ${tilde(item.file)}${item.line ? `:${item.line}` : ""}`);
			}
		}
		const { totals } = data;
		out(`\n${totals.repos} repo${totals.repos === 1 ? "" : "s"} scanned: ${totals.error} error${totals.error === 1 ? "" : "s"}, ${totals.warning} warning${totals.warning === 1 ? "" : "s"}${totals.info ? `, ${totals.info} info` : ""}. Counts include user-level items every session loads.`);
	};

	// Returns the exit code: 1 when any error-severity finding exists, 2 for a missing root.
	const run = ({ roots = [], depth = 4, json = false, onlyProblems = false, cache = true } = {}) => {
		const list = roots.length > 0 ? roots : [process.cwd()];
		for (const root of list) {
			try {
				if (!statSync(root).isDirectory()) {
					throw new Error("not a folder");
				}
			} catch {
				err(`Not a folder: ${resolve(root)}`);
				return 2;
			}
		}
		const data = collect(list, { depth, cache });
		if (json) {
			out(JSON.stringify(onlyProblems ? { ...data, repos: data.repos.filter((row) => row.findings.length > 0) } : data, null, 2));
		} else {
			printHuman(data, { onlyProblems });
		}
		return data.totals.error > 0 ? 1 : 0;
	};

	return { collect, run };
};
