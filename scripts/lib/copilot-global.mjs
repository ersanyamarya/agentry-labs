// The Copilot target of scripts/apply-global.mjs. <ch> is the Copilot home (COPILOT_HOME, else <home>/.copilot).
// Apply: adds settings.fragment.json keys to <ch>/settings.json and servers to <ch>/mcp-config.json when absent (an
// unedited old local context7 entry is replaced by the http one), copies global/copilot/hooks/*.json to <ch>/hooks/ and
// writes each rules/*.md as <ch>/instructions/<name>.instructions.md. Existing values and files that differ are left
// as is with a warning. With --trust-file, appends folders to trustedFolders in <ch>/config.json (scripts/lib/jsonc-edit.mjs). Remove: undoes the copilot part of the install manifest, keeping anything edited since.
// The spec is cli/docs/copilot-config-sources.md ("Setup assumptions").

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { loadManifestPart, readJson, sha256, stable, writeBackupSet } from "./global-common.mjs";
import { addToArray, removeFromArray } from "./jsonc-edit.mjs";

// trustedFolders lives in <ch>/config.json (JSONC, rewritten by Copilot itself), so it is edited as text. Setup never
// sets COPILOT_ALLOW_ALL: it trusts every folder and approves every tool.
const TRUST_KEY = "trustedFolders";
const RUNNING_WARNING = "quit Copilot first: a copilot process is running and may rewrite config.json";
const copilotRunning = () => spawnSync("pgrep", ["-x", "copilot"], { stdio: "ignore" }).status === 0;

// Same-folder temp file with the original mode, then rename, so a reader never sees half a file.
function writeAtomic(path, text) {
	const tmp = `${path}.agentry-${process.pid}.tmp`;
	writeFileSync(tmp, text, { mode: statSync(path).mode & 0o777 });
	renameSync(tmp, path);
}

export const copilotDirFor = (home, homeGiven) => (!homeGiven && process.env.COPILOT_HOME ? resolve(process.env.COPILOT_HOME) : join(home, ".copilot"));

const toText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Strict JSON object, or the fallback when the file is absent. Throws a message (never the content) otherwise.
function readStrict(path, fallback) {
	if (!existsSync(path)) return fallback;
	let value;
	try {
		value = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`${path} is not valid JSON; fix it first. Nothing was written.`);
	}
	if (!isObject(value)) throw new Error(`${path} does not hold a JSON object. Nothing was written.`);
	if ("mcpServers" in value && !isObject(value.mcpServers)) throw new Error(`${path}: mcpServers is not an object. Nothing was written.`);
	return value;
}

function sources(root) {
	const dir = join(root, "global/copilot");
	return { fragment: readJson(join(dir, "settings.fragment.json"), {}), servers: readJson(join(dir, "mcp-config.json"), {}).mcpServers ?? {}, hooksDir: join(dir, "hooks") };
}

// The context7 entry older setups wrote: a local npx/bunx run of @upstash/context7-mcp with nothing edited.
function isOldContext7(entry) {
	if (!isObject(entry)) return false;
	if (!Object.keys(entry).every((k) => ["type", "command", "args", "tools", "env"].includes(k))) return false;
	if (entry.type !== "local" || !["npx", "bunx"].includes(entry.command)) return false;
	if (!Array.isArray(entry.args) || !entry.args.every((a) => typeof a === "string")) return false;
	const pkg = entry.args.filter((a) => /^@upstash\/context7-mcp(@[A-Za-z0-9.-]+)?$/.test(a));
	if (pkg.length !== 1 || !entry.args.every((a) => pkg.includes(a) || ["-y", "--yes", "--bun"].includes(a))) return false;
	if ("env" in entry && !(isObject(entry.env) && Object.keys(entry.env).length === 0)) return false;
	if ("tools" in entry && stable(entry.tools) !== stable(["*"])) return false;
	return true;
}

// A key written as a value instead of a ${VAR} reference, in headers, env or a --api-key style arg.
function hasLiteralSecret(entry) {
	if (/ctx7sk-|sk-[A-Za-z0-9]/.test(JSON.stringify(entry ?? null))) return true;
	const named = [...Object.entries(isObject(entry?.headers) ? entry.headers : {}), ...Object.entries(isObject(entry?.env) ? entry.env : {})];
	const args = Array.isArray(entry?.args) ? entry.args.map(String) : [];
	args.forEach((a, i) => {
		const inline = /^--?([A-Za-z-]*(?:key|token|secret)[A-Za-z-]*)=(.*)$/i.exec(a);
		if (inline) named.push([inline[1], inline[2]]);
		else if (i > 0 && /^--?[A-Za-z-]*(?:key|token|secret)[A-Za-z-]*$/i.test(args[i - 1])) named.push([args[i - 1], a]);
	});
	return named.some(([name, value]) => {
		if (typeof value !== "string" || value === "" || value.includes("${")) return false;
		const bare = value.replace(/^(Bearer|Basic|Token)\s+/i, "");
		return /key|token|secret|auth|pass/i.test(name) || /^[A-Za-z0-9_\-.]{20,}$/.test(bare);
	});
}

const unquote = (s) => (/^(["']).*\1$/.test(s) ? s.slice(1, -1) : s);

// Short description: the first heading, else the first sentence, cut at a word under 120 characters.
function summarize(body) {
	const line = body.split(/\r?\n/).find((l) => l.trim() !== "")?.trim() ?? "";
	const heading = /^#{1,6}\s+(.+)$/.exec(line);
	let text = heading ? heading[1].trim() : (/^(.+?[.!?])(\s|$)/.exec(line)?.[1] ?? line);
	if (text.length > 120) text = `${text.slice(0, 117).replace(/\s+\S*$/, "")}...`;
	return text;
}

// A Claude rule as a Copilot instructions file: applyTo from `paths:` (else "**"), description kept or derived.
export function toInstructions(text) {
	let body = text;
	let applyTo = "**";
	let description;
	const fm = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
	if (fm) {
		body = text.slice(fm[0].length);
		const lines = fm[1].split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			const m = /^(paths|description):\s*(.*)$/.exec(lines[i]);
			if (!m) continue;
			const value = m[2].trim();
			if (m[1] === "description") {
				if (value) description = unquote(value);
			} else if (value === "") {
				const list = [];
				while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) list.push(unquote(lines[++i].replace(/^\s*-\s+/, "").trim()));
				if (list.length > 0) applyTo = list;
			} else if (value.startsWith("[") && value.endsWith("]")) {
				const list = value.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean);
				if (list.length > 0) applyTo = list;
			} else applyTo = unquote(value);
		}
	}
	body = body.replace(/^(\s*\r?\n)+/, "");
	description ??= summarize(body);
	const applyLine = Array.isArray(applyTo) ? `[${applyTo.map((p) => JSON.stringify(p)).join(", ")}]` : JSON.stringify(applyTo);
	return `---\napplyTo: ${applyLine}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`;
}

export function applyCopilot({ write, home, copilotDir, root, reportPath, trustFolders }) {
	const saveReport = (value) => {
		if (!reportPath) return;
		mkdirSync(dirname(reportPath), { recursive: true });
		writeFileSync(reportPath, toText(value));
	};
	if (!existsSync(copilotDir)) {
		console.log("Copilot not found");
		saveReport({ copilotDir: null, settings: [], mcp: [], files: [], trustedFolders: [] });
		return 0;
	}
	const { fragment, servers, hooksDir } = sources(root);
	const settingsPath = join(copilotDir, "settings.json");
	const mcpPath = join(copilotDir, "mcp-config.json");
	let settings;
	let mcpConfig;
	try {
		settings = readStrict(settingsPath, {});
		mcpConfig = readStrict(mcpPath, {});
	} catch (error) {
		console.error(`apply-global: ${error.message}`);
		return 1;
	}
	const actions = [];
	const warnings = [];
	const report = { copilotDir, settings: [], mcp: [], files: [], trustedFolders: [] };

	// Planned before anything is written, so a config.json that can't be edited refuses the whole run.
	const configPath = join(copilotDir, "config.json");
	let trust;
	if (trustFolders) {
		if (!existsSync(configPath)) warnings.push("config.json not found; start Copilot once, then re-run with --trust-file");
		else {
			try {
				const text = readFileSync(configPath, "utf8");
				trust = { text, ...addToArray(text, TRUST_KEY, trustFolders) };
			} catch (error) {
				console.error(`apply-global: cannot edit ${configPath}: ${error.message}. Nothing was written.`);
				return 1;
			}
			for (const folder of trust.added) actions.push(`config.json: trust ${folder}`);
			report.trustedFolders.push(...trust.added);
			if (copilotRunning()) warnings.push(RUNNING_WARNING);
		}
	}

	for (const [key, value] of Object.entries(fragment)) {
		if (!(key in settings)) {
			settings[key] = value;
			actions.push(`settings.json: add ${key}`);
			report.settings.push({ key, value });
		} else if (stable(settings[key]) !== stable(value)) warnings.push(`settings.json: ${key} left as is`);
	}

	for (const [name, server] of Object.entries(servers)) {
		const current = mcpConfig.mcpServers?.[name];
		if (current === undefined) {
			mcpConfig.mcpServers ??= {};
			mcpConfig.mcpServers[name] = server;
			actions.push(`mcp-config.json: add MCP server ${name}`);
			report.mcp.push(name);
		} else if (stable(current) === stable(server)) continue;
		else if (name === "context7" && isOldContext7(current)) {
			mcpConfig.mcpServers[name] = server;
			actions.push(`mcp-config.json: replace MCP server ${name} (old local entry) with the http entry (backup kept)`);
			report.mcp.push(name);
		} else {
			const literal = hasLiteralSecret(current) ? " (contains a literal key; switch to a ${VAR} reference)" : "";
			warnings.push(`mcp-config.json: MCP server ${name} differs from global/copilot/mcp-config.json${literal}; left as is`);
		}
	}

	// New files only: an identical one is skipped silently, a different one is left with a warning.
	const newFiles = [];
	const planFile = (label, target, content) => {
		if (existsSync(target)) {
			if (!statSync(target).isFile() || !readFileSync(target).equals(content)) warnings.push(`${label}: differs from the setup copy; left as is`);
			return;
		}
		newFiles.push({ target, content });
		actions.push(`${label}: add`);
		report.files.push({ path: target, sha256: sha256(content) });
	};
	if (existsSync(hooksDir)) {
		for (const name of readdirSync(hooksDir).sort()) {
			const source = join(hooksDir, name);
			if (name.endsWith(".json") && statSync(source).isFile()) planFile(`hooks/${name}`, join(copilotDir, "hooks", name), readFileSync(source));
		}
	}
	const rulesDir = join(root, "rules");
	for (const name of readdirSync(rulesDir).sort()) {
		const source = join(rulesDir, name);
		if (!name.endsWith(".md") || name === "README.md" || !statSync(source).isFile()) continue;
		const target = `${name.slice(0, -3)}.instructions.md`;
		planFile(`instructions/${target}`, join(copilotDir, "instructions", target), Buffer.from(toInstructions(readFileSync(source, "utf8"))));
	}

	console.log(`Target home: ${home}`);
	console.log(`Copilot dir: ${copilotDir}`);
	for (const line of [...actions, ...warnings]) console.log(`- ${line}`);
	if (actions.length === 0) console.log("Nothing to add.");

	if (write && actions.length > 0) {
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		// config.json first: re-read right before writing, and redo the edit if Copilot changed it meanwhile.
		if (trust && trust.added.length > 0) {
			const now = readFileSync(configPath, "utf8");
			let next = trust;
			if (now !== trust.text) {
				try {
					next = addToArray(now, TRUST_KEY, trustFolders);
				} catch (error) {
					console.error(`apply-global: cannot edit ${configPath}: ${error.message}. Nothing was written.`);
					return 1;
				}
				report.trustedFolders = next.added;
			}
			if (next.added.length > 0) {
				copyFileSync(configPath, `${configPath}.bak-${stamp}`);
				writeAtomic(configPath, next.text);
			}
		}
		const saveJson = (path, value) => {
			if (existsSync(path)) copyFileSync(path, `${path}.bak-${stamp}`);
			writeFileSync(path, toText(value));
		};
		if (report.settings.length > 0) saveJson(settingsPath, settings);
		if (report.mcp.length > 0) saveJson(mcpPath, mcpConfig);
		for (const { target, content } of newFiles) {
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, content, { flag: "wx" });
		}
		console.log("Written. Backups saved next to each file.");
	} else if (!write && actions.length > 0) {
		console.log("Dry run. Re-run with --write to apply.");
	}

	saveReport(write ? report : { ...report, settings: [], mcp: [], files: [], trustedFolders: [], dryRun: true });
	return 0;
}

export function removeCopilot({ write, home, copilotDir, configDir, root, manifestFile }) {
	const part = loadManifestPart(manifestFile, "copilot", "usage: node scripts/apply-global.mjs --remove <manifest> --part copilot [--write] [--home <dir>]");
	if (!existsSync(copilotDir)) {
		console.log("Copilot not found");
		return 0;
	}
	const { servers } = sources(root);
	const settingsPath = join(copilotDir, "settings.json");
	const mcpPath = join(copilotDir, "mcp-config.json");
	let settings;
	let mcpConfig;
	try {
		settings = readStrict(settingsPath, {});
		mcpConfig = readStrict(mcpPath, {});
	} catch (error) {
		console.error(`apply-global: ${error.message}`);
		return 1;
	}
	const removed = [];
	const kept = [];
	const gone = [];
	let settingsChanged = false;
	let mcpChanged = false;
	const filesToDelete = [];

	// Settings keys are top-level in the Copilot fragment. Removed only when the value still equals a recorded one.
	const recorded = new Map();
	for (const { key, value } of part.settings ?? []) recorded.set(key, [...(recorded.get(key) ?? []), stable(value)]);
	for (const [key, values] of recorded) {
		if (!(key in settings)) gone.push(key);
		else if (!values.includes(stable(settings[key]))) kept.push(`${key} changed since install`);
		else {
			delete settings[key];
			settingsChanged = true;
			removed.push(`settings.json: remove ${key}`);
		}
	}

	// MCP servers: removed only when still equal to the entry in global/copilot/mcp-config.json.
	for (const name of new Set(part.mcp ?? [])) {
		const current = mcpConfig.mcpServers?.[name];
		const source = servers[name];
		if (current === undefined) gone.push(`MCP server ${name}`);
		else if (!source || stable(current) !== stable(source)) kept.push(`MCP server ${name} changed since install`);
		else {
			delete mcpConfig.mcpServers[name];
			mcpChanged = true;
			removed.push(`mcp-config.json: remove MCP server ${name}`);
		}
	}
	if (mcpChanged && Object.keys(mcpConfig.mcpServers).length === 0) delete mcpConfig.mcpServers;

	// Files: removed only inside <ch> and when the content still matches a recorded sha256. Never a .bak-* file.
	const shas = new Map();
	for (const { path, sha256: sum } of part.files ?? []) if (path) shas.set(path, [...(shas.get(path) ?? []), sum]);
	for (const [path, sums] of shas) {
		if (/\.bak-/.test(path)) kept.push(`${path} is a backup file`);
		else if (!resolve(path).startsWith(copilotDir + sep)) kept.push(`${path} is outside ${copilotDir}`);
		else if (!existsSync(path)) gone.push(path);
		else if (!statSync(path).isFile()) kept.push(`${path} is not a file`);
		else if (!sums.includes(sha256(readFileSync(path)))) kept.push(`${path} was edited`);
		else {
			filesToDelete.push(path);
			removed.push(`remove ${path}`);
		}
	}

	// trustedFolders: only the recorded folders still listed come out, as a text edit. A missing or unreadable
	// config.json is kept as is. An emptied list stays as [].
	const configPath = join(copilotDir, "config.json");
	const trustRecorded = [...new Set(part.trustedFolders ?? [])];
	let trust;
	if (trustRecorded.length > 0) {
		if (!existsSync(configPath)) kept.push("trustedFolders: config.json not found");
		else {
			try {
				const text = readFileSync(configPath, "utf8");
				trust = { text, ...removeFromArray(text, TRUST_KEY, trustRecorded) };
				for (const folder of trustRecorded) {
					if (trust.removed.includes(folder)) removed.push(`config.json: untrust ${folder}`);
					else gone.push(`trusted folder ${folder}`);
				}
				if (trust.removed.length === 0) trust = undefined;
				else if (copilotRunning()) console.log(`- warning: ${RUNNING_WARNING}`);
			} catch (error) {
				kept.push(`trustedFolders: cannot edit ${configPath} (${error.message})`);
			}
		}
	}

	console.log(`Target home: ${home}`);
	console.log(`Copilot dir: ${copilotDir}`);
	for (const line of removed) console.log(`- ${line}`);
	for (const line of kept) console.log(`- kept: ${line}`);
	for (const line of gone) console.log(`- already gone: ${line}`);
	if (removed.length === 0) {
		console.log("Nothing to remove.");
		return 0;
	}
	if (!write) {
		console.log("Dry run. Re-run with --write to apply.");
		return 0;
	}

	const backupDir = writeBackupSet(configDir, [...(trust ? [configPath] : []), ...(settingsChanged ? [settingsPath] : []), ...(mcpChanged ? [mcpPath] : []), ...filesToDelete]);
	if (trust) {
		// Re-read right before writing; redo the edit if Copilot changed the file since the plan.
		const now = readFileSync(configPath, "utf8");
		try {
			const next = now === trust.text ? trust : removeFromArray(now, TRUST_KEY, trustRecorded);
			if (next.removed.length > 0) writeAtomic(configPath, next.text);
		} catch (error) {
			console.log(`- kept: trustedFolders: cannot edit ${configPath} (${error.message})`);
		}
	}
	// settings.json and mcp-config.json stay even as {}: Copilot owns them. A folder left empty is removed.
	if (settingsChanged) writeFileSync(settingsPath, toText(settings));
	if (mcpChanged) writeFileSync(mcpPath, toText(mcpConfig));
	for (const path of filesToDelete) unlinkSync(path);
	for (const dir of new Set(filesToDelete.map((p) => dirname(resolve(p))))) {
		if (dir === copilotDir) continue;
		try {
			rmdirSync(dir);
		} catch {}
	}
	console.log(`Removed. Backup saved in ${backupDir}`);
	return 0;
}
