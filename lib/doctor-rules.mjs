// Doctor rules. A rule is `{ id, run(ctx) }`; `run` returns findings `{ id, severity, message, file, line?, fix? }`.
// `ctx` is built by lib/doctor.mjs from the inventory readers (`skills`, `mcp`, `hooks`, `plugins`, all masked already)
// plus `layers` (settings files), `which(command)`, `launchctlGetenv(name)`, `line(file, needle)` and `renames`.
// Rules only describe fixes (text or a suggested command); nothing here writes. Values are never printed: only names.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { list } from "./inventory/common.mjs";
import { maskShell } from "./mask.mjs";

const finding = (id, severity, message, file, extra = {}) => ({ id, severity, message, file, ...extra });

// Servers that actually start: shadowed, disabled and unapproved entries are not run.
const running = (server) => server.state === "active";

// ---- duplicates ----

const dupPluginScope = {
	id: "dup-plugin-scope",
	run: ({ plugins, paths }) =>
		plugins.items.flatMap((plugin) => {
			const here = plugin.installs.filter((install) => install.appliesHere);
			if (here.length < 2) {
				return [];
			}
			const scopes = here.map((install) => install.scope);
			const extra = here.filter((install) => install.scope !== "user");
			const fix = (extra.length > 0 ? extra : here.slice(1)).map((install) => `${install.projectPath ? `cd ${install.projectPath} && ` : ""}claude plugin uninstall ${plugin.id} --scope ${install.scope}`).join("\n");
			return [finding("dup-plugin-scope", "warning", `${plugin.id} is installed at ${scopes.length} scopes that apply here (${scopes.join(", ")}); one install is enough`, join(paths.pluginsDir, "installed_plugins.json"), { fix: `Keep one install and remove the other:\n${fix}` })];
		}),
};

const dupSkillName = {
	id: "dup-skill-name",
	run: ({ skills }) => {
		const byName = new Map();
		for (const skill of skills.items.filter((item) => item.state === "active" && item.scope !== "plugin")) {
			byName.set(skill.name, [...(byName.get(skill.name) ?? []), skill]);
		}
		return [...byName].flatMap(([name, copies]) => {
			if (copies.length < 2) {
				return [];
			}
			// Personal beats project, so the project copy is the dead one.
			const ordered = [...copies].sort((a, b) => (a.scope === "user" ? 0 : 1) - (b.scope === "user" ? 0 : 1));
			const loser = ordered.at(-1);
			return [finding("dup-skill-name", "warning", `Skill "${name}" exists ${copies.length} times in places a session loads: ${copies.map((copy) => `${copy.scope} ${copy.source}`).join("; ")}`, loser.source, { fix: `Delete or unlink the copy you don't want: rm -r "${loser.source}" (a symlink: rm "${loser.source}")` })];
		});
	},
};

// The winner is always the same or a narrower scope than the shadowed copy (local > project > user), and it is the
// repo's own entry, so the fix targets the winner: the broader copy is shared with other repos and stays.
const dupMcpName = {
	id: "dup-mcp-scope",
	run: ({ mcp, line }) =>
		mcp.servers
			.filter((server) => server.state === "shadowed" && server.scope !== "plugin" && server.shadowedBy?.name === server.name)
			.map((server) => {
				const winner = server.shadowedBy;
				const flag = ["project", "local"].includes(winner.scope) ? ` (claude mcp remove ${server.name} -s ${winner.scope})` : "";
				return finding("dup-mcp-scope", "warning", `MCP server "${server.name}" is defined in ${winner.scope} scope (${winner.source}) and also in ${server.scope} scope (${server.source}); the ${winner.scope} entry is the one that loads`, winner.source, {
					line: line(winner.source, `"${server.name}"`),
					fix: `If both entries do the same thing, remove the "${server.name}" entry from ${winner.source}${flag} and keep the ${server.scope} one that other repos share; otherwise keep the ${winner.scope} entry on purpose and ignore this.`,
				});
			}),
};

const dupMcpPlugin = {
	id: "dup-mcp-plugin",
	run: ({ mcp, plugins, line }) => {
		const out = [];
		const seen = new Set();
		const standalone = mcp.servers.filter((server) => server.scope !== "plugin" && !["disabled", "rejected"].includes(server.state));
		for (const pluginServer of mcp.servers.filter((server) => server.scope === "plugin")) {
			const plugin = plugins.items.find((item) => item.id === pluginServer.plugin);
			if (plugin?.state !== "active") {
				continue;
			}
			const [, pluginName, ...rest] = pluginServer.name.split(":");
			const inner = rest.join(":");
			// A standalone entry named like the plugin or its server, or one the reader found at the plugin server's endpoint.
			const matches = standalone.filter((server) => server.name === inner || server.name === pluginName || (pluginServer.state === "shadowed" && pluginServer.shadowedBy?.name === server.name));
			for (const server of matches) {
				const key = `${server.source}\0${server.name}\0${plugin.id}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				out.push(
					finding("dup-mcp-plugin", "warning", `MCP server "${server.name}" (${server.scope}) duplicates the server of enabled plugin ${plugin.id}`, server.source, {
						line: line(server.source, `"${server.name}"`),
						fix: `Remove the "${server.name}" entry from ${server.source}; the plugin already provides it`,
					}),
				);
			}
		}
		return out;
	},
};

// ---- broken references ----

const missingMcpCommand = {
	id: "missing-mcp-command",
	run: ({ mcp, which, line }) =>
		mcp.servers
			.filter((server) => running(server) && server.command !== undefined && !server.command.includes("${") && !which(server.command))
			.map((server) =>
				finding("missing-mcp-command", "error", `MCP server "${server.name}" runs "${server.command}", which is not on PATH or does not exist`, server.source, {
					line: line(server.source, `"${server.name}"`),
					fix: `Install "${server.command}" or remove the server: ${server.scope === "project" || server.scope === "user" || server.scope === "local" ? `claude mcp remove ${server.name} -s ${server.scope}` : `delete the "${server.name}" entry in ${server.source}`}`,
				}),
			),
};

const INTERPRETERS = new Set(["node", "bash", "sh", "zsh", "python", "python3", "bun", "deno", "tsx", "ruby", "perl"]);

// The file a hook command runs: its first word, or the first non-flag argument after an interpreter. Undefined when not path-like.
const hookFile = (command, { home, projectRoot }) => {
	const words = command.split(/\s+/).filter(Boolean);
	while (words.length > 0 && /^[A-Za-z_]\w*=/.test(words[0])) {
		words.shift();
	}
	let word = words[0];
	if (word && INTERPRETERS.has(word.replace(/^.*\//, ""))) {
		word = words.slice(1).find((item) => !item.startsWith("-"));
	}
	word = word?.replace(/^["'`]+|["'`]+$/g, "");
	if (!word || word.includes("<masked>") || !/^(~|\.{1,2}\/|\/|\$)/.test(word)) {
		return undefined;
	}
	const expanded = word
		.replace(/^~(?=\/|$)/, home)
		.replace(/^\$\{?HOME\}?/, home)
		.replace(/^\$\{?CLAUDE_PROJECT_DIR\}?/, projectRoot);
	return expanded.includes("$") ? undefined : { written: word, path: resolve(projectRoot, expanded) };
};

const missingHookFile = {
	id: "missing-hook-file",
	run: ({ hooks, paths, project, line }) =>
		hooks.items.flatMap((hook) => {
			if (hook.state === "disabled" || !hook.command) {
				return [];
			}
			const file = hookFile(hook.command, { home: paths.home, projectRoot: project.root });
			if (!file || existsSync(file.path)) {
				return [];
			}
			return [
				finding("missing-hook-file", "error", `${hook.event} hook runs ${file.path}, which does not exist`, hook.source, {
					line: line(hook.source, file.written),
					fix: hook.plugin ? `Reinstall or update plugin ${hook.plugin}, or disable it` : `Restore ${file.path} or remove the hook from ${hook.source}`,
				}),
			];
		}),
};

const brokenSkillLink = {
	id: "broken-skill-link",
	run: ({ skills }) =>
		skills.items
			.filter((skill) => skill.kind === "broken" && skill.target !== undefined)
			.map((skill) => {
				const missing = !existsSync(skill.target);
				return finding("broken-skill-link", "warning", missing ? `Skill link "${skill.name}" points at ${skill.target}, which does not exist` : `Skill link "${skill.name}" points at ${skill.target}, which has no SKILL.md`, skill.source, {
					fix: `Remove the link: rm "${skill.source}"`,
				});
			}),
};

const pluginNotInstalled = {
	id: "plugin-not-installed",
	run: ({ plugins, line }) =>
		plugins.items
			.filter((plugin) => plugin.state === "not-installed" && plugin.enabledBy.value)
			.map((plugin) =>
				finding("plugin-not-installed", "warning", `enabledPlugins turns on ${plugin.id}, but it is not installed`, plugin.enabledBy.source, {
					line: line(plugin.enabledBy.source, `"${plugin.id}"`),
					fix: `claude plugin install ${plugin.id}, or remove the entry from ${plugin.enabledBy.source}`,
				}),
			),
};

// ---- placeholders ----

const REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*)?\}/g;
const PROVIDED = new Set(["HOME", "CLAUDE_PLUGIN_ROOT", "CLAUDE_PROJECT_DIR"]);

const unsetPlaceholder = {
	id: "unset-placeholder",
	run: ({ mcp, platform, launchctlGetenv, line }) => {
		// Apps launched from the Dock or Spotlight get launchd's environment, not the shell profile's.
		if (platform !== "darwin") {
			return [];
		}
		return mcp.servers
			.filter((server) => server.state !== "shadowed" && server.state !== "disabled" && server.state !== "rejected")
			.flatMap((server) => {
				const texts = [...Object.values(server.env ?? {}), ...Object.values(server.headers ?? {})];
				const names = new Set();
				for (const text of texts) {
					for (const [, name, fallback] of String(text).matchAll(REF)) {
						if (!fallback && !PROVIDED.has(name) && !launchctlGetenv(name)) {
							names.add(name);
						}
					}
				}
				if (names.size === 0) {
					return [];
				}
				const vars = [...names];
				return [
					finding("unset-placeholder", "warning", `MCP server "${server.name}" uses ${vars.map((name) => `\${${name}}`).join(", ")} in env or headers; GUI-launched apps on macOS don't inherit your shell profile, so it expands to nothing there`, server.source, {
						line: line(server.source, `"${server.name}"`),
						fix: `Either set it for GUI apps, then quit and reopen the app: launchctl setenv ${vars[0]} "<value>" (lost at reboot unless a LaunchAgent sets it);\nor write the literal value into the entry in ${server.source} (plaintext on disk: keep the file out of git).`,
					}),
				];
			});
	},
};

// ---- stale names ----

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const staleName = {
	id: "stale-name",
	run: ({ layers, mcp, hooks, renames, line }) => {
		const rules = Object.entries(renames).map(([from, to]) => ({ from, to, pattern: new RegExp(`(?<![A-Za-z0-9/.@-])${escape(from)}(?![A-Za-z0-9/.@-])`) }));
		const out = [];
		const check = (what, text, file) => {
			for (const { from, to, pattern } of rules) {
				if (pattern.test(text)) {
					out.push(finding("stale-name", "warning", `${what} still uses the old name "${from}" (now "${to}")`, file, { line: line(file, from), fix: `Replace "${from}" with "${to}" in ${file}` }));
				}
			}
		};
		for (const { source, json } of layers) {
			for (const kind of ["allow", "deny", "ask"]) {
				for (const entry of list(json.permissions?.[kind]).filter((item) => typeof item === "string")) {
					check(`Permission ${kind} entry "${maskShell(entry)}"`, entry, source);
				}
			}
		}
		for (const server of mcp.servers.filter((item) => item.scope !== "plugin")) {
			check(`MCP server "${server.name}"`, [server.name, server.command, ...(server.args ?? [])].filter((item) => typeof item === "string").join(" "), server.source);
		}
		for (const hook of hooks.items.filter((item) => item.scope !== "plugin" && item.command)) {
			check(`${hook.event} hook`, hook.command, hook.source);
		}
		return out;
	},
};

// Order here is the registry order; a new rule is one more entry.
export const rules = [dupPluginScope, dupSkillName, dupMcpName, dupMcpPlugin, missingMcpCommand, missingHookFile, brokenSkillLink, pluginNotInstalled, unsetPlaceholder, staleName];
