// The agentry-labs catalog: a shallow git clone of the repo, cached under <cacheDir>/catalog. It lists five kinds of item:
//   skill      skills/<name>/               -> the shelf, off (group = its bundle in bundles.tsv; none = "extras")
//   agent      agents/<name>.agent.md       -> ~/.claude/agents/, or <project>/.claude/agents/ with project
//   rule       rules/<name>.md              -> ~/.claude/rules/
//   claude-md  claude-md-files/<name>.md    -> <project>/CLAUDE.md, only when the project has none
//   mcp        a server of global/mcp.json  -> lib/mcp-edit.mjs `add` (masked preview, backup, undo), user or project scope
// Items are named kind/name; a bare name works when it is unique. `add` never overwrites. `update` replaces an installed
// skill, agent or rule with the catalog's copy: previewed per file, the current copy saved under <backups>/updated/ first,
// and only after a y (or --yes). An item is `outdated` when any file differs from the cached clone or is missing locally.
// Removing a skill is `shelf remove`. Only `refresh` touches the network.

import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { defaultConfirm, noteUpdatedCopy } from "./backups.mjs";
import { createMcpReader } from "./inventory/mcp.mjs";
import { createMcpEdit } from "./mcp-edit.mjs";
import { summarize } from "./mcp-toggle.mjs";
import { createShelf } from "./shelf.mjs";
import { descriptionTokens, estimateTokens, readDescription } from "./tokens.mjs";

export const CATALOG_REPO = "https://github.com/ersanyamarya/agentry-labs.git";

export const KINDS = ["skill", "agent", "rule", "claude-md", "mcp"];
const UPDATABLE = new Set(["skill", "agent", "rule"]);
const IGNORED = new Set([".DS_Store", "node_modules"]);
const BUNDLE_DIRS = { skills: "skill", agents: "agent", rules: "rule", "claude-md-files": "claude-md" };

const git = (args) => execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });

const filesIn = (dir, base = dir) =>
	readdirSync(dir, { withFileTypes: true })
		.filter((entry) => !IGNORED.has(entry.name))
		.flatMap((entry) => (entry.isDirectory() ? filesIn(join(dir, entry.name), base) : [relative(base, join(dir, entry.name))]))
		.sort();

// Line endings are ignored, so a CRLF checkout does not make everything look edited.
const sameFile = (a, b) => readFileSync(a, "latin1").replace(/\r\n/g, "\n") === readFileSync(b, "latin1").replace(/\r\n/g, "\n");

// How the installed copy `dest` differs from the catalog's `source` (a folder or a file): { changed, added, extra } as
// relative names ("" for a single file). Files only in the installed copy (extra) do not make it outdated and are never touched.
const diffOf = (source, dest) => {
	const folder = statSync(source).isDirectory();
	if (statSync(dest).isDirectory() !== folder) {
		return { changed: [""], added: [], extra: [] };
	}
	const [wanted, have] = folder ? [filesIn(source), filesIn(dest)] : [[""], [""]];
	const at = (root, name) => (name ? join(root, name) : root);
	return {
		changed: wanted.filter((name) => have.includes(name) && !sameFile(at(source, name), at(dest, name))),
		added: wanted.filter((name) => !have.includes(name)),
		extra: have.filter((name) => !wanted.includes(name)),
	};
};

// A real (not linked) installed skill, agent or rule that lacks or differs from a file of the catalog's copy.
const isOutdated = (kind, source, path) => {
	if (!path || !UPDATABLE.has(kind) || lstatSync(path).isSymbolicLink()) {
		return false;
	}
	const { changed, added } = diffOf(source, path);
	return changed.length + added.length > 0;
};

// Where an install of each kind lives, as `catalog list` words it.
const WHERE = { skill: "~/.claude/skills", agent: "~/.claude/agents", rule: "~/.claude/rules" };

const firstHeading = (file) => readFileSync(file, "utf8").split("\n").find((line) => /^#\s/.test(line))?.replace(/^#\s+/, "") ?? "";

// MCP options for lib/mcp-edit.mjs `add` from a catalog server config ({ url, headers } or { command, args, env }).
const mcpOptionsOf = (raw) =>
	raw.url !== undefined
		? { url: raw.url, headers: Object.entries(raw.headers ?? {}).map(([key, value]) => `${key}:${value}`) }
		: { command: raw.command, args: raw.args ?? [], env: Object.entries(raw.env ?? {}).map(([key, value]) => `${key}=${value}`) };

export const createCatalog = (paths, { out = console.log, err = console.error, repo = process.env.AGENTRY_CATALOG_REPO || CATALOG_REPO, run = git, now = () => new Date(), isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY), confirm = defaultConfirm, mcp = {} } = {}) => {
	const dir = join(paths.cacheDir, "catalog");
	const fetched = () => existsSync(join(dir, "skills"));
	const tilde = (text) => (paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text));

	const refresh = () => {
		try {
			if (existsSync(join(dir, ".git"))) {
				// A depth-1 clone cannot fast-forward (its history is rewritten), so fetch the tip and move to it.
				run(["-C", dir, "fetch", "--depth", "1", "origin", "HEAD"]);
				run(["-C", dir, "reset", "--hard", "FETCH_HEAD"]);
			} else {
				mkdirSync(dirname(dir), { recursive: true });
				run(["clone", "--depth", "1", repo, dir]);
			}
		} catch (error) {
			err(`Could not fetch the catalog from ${repo}: ${String(error.stderr ?? error.message).trim().split("\n").at(-1)}`);
			return 1;
		}
		out(`catalog up to date (${entries().length} items)`);
		return 0;
	};

	// kind/name -> bundle, from the selectors of bundles.tsv (skills/x, agents/x.agent.md, rules/x.md, claude-md-files/x.md).
	const bundleOf = () => {
		const file = join(dir, "bundles.tsv");
		const map = new Map();
		for (const line of existsSync(file) ? readFileSync(file, "utf8").split("\n") : []) {
			const [bundle, selector] = line.split("\t");
			const [folder, ...rest] = (selector ?? "").split("/");
			if (bundle && !bundle.startsWith("#") && BUNDLE_DIRS[folder] && rest.length > 0) {
				map.set(`${BUNDLE_DIRS[folder]}/${rest.join("/").replace(/(\.agent)?\.md$/, "")}`, bundle);
			}
		}
		return map;
	};

	const root = () => paths.projectRoot();
	const agentPath = (project, file) => (project ? join(root(), ".claude", "agents", file) : join(paths.configDir, "agents", file));
	const claudeMdPaths = () => [join(root(), "CLAUDE.md"), join(root(), ".claude", "CLAUDE.md")];

	const mcpInstalled = () => {
		try {
			const found = new Map();
			for (const server of createMcpReader(paths).read({ cwd: root() }).servers) {
				found.set(server.name, [...(found.get(server.name) ?? []), server.scope]);
			}
			return found;
		} catch {
			return new Map();
		}
	};

	// Every item with its install state, [] until the catalog is fetched. Internal: carries `source` and `raw`.
	const items = () => {
		if (!fetched()) {
			return [];
		}
		const bundles = bundleOf();
		const shelved = new Map(createShelf(paths, { out: () => {}, err: () => {}, warn: () => {} }).groups().flatMap((group) => group.items.filter((item) => item.kind === "skills").map((item) => [item.name, group.name])));
		const found = [];
		const item = (kind, name, fields) => {
			const bundle = bundles.get(`${kind}/${name}`) ?? (kind === "mcp" ? "global" : "extras");
			const installs = (fields.installs ?? []).filter(Boolean).map((one) => ({ ...one, outdated: isOutdated(kind, fields.source, one.path) }));
			const { installs: _unused, ...rest } = fields;
			found.push({ kind, name, id: `${kind}/${name}`, bundle, ...rest, installs, installed: installs.length > 0 ? installs.map((one) => one.label).join(", ") : undefined, outdated: installs.some((one) => one.outdated) });
		};

		const skillsDir = join(dir, "skills");
		for (const { name } of readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md")))) {
			const file = join(skillsDir, name, "SKILL.md");
			const shelf = shelved.get(name) ?? null;
			const global = existsSync(join(paths.configDir, "skills", name));
			item("skill", name, {
				source: join(skillsDir, name),
				description: readDescription(file),
				tokens: descriptionTokens(file),
				shelf,
				global,
				installs: [shelf ? { scope: "shelf", label: `shelf/${shelf}`, path: join(paths.shelfDir, shelf, name) } : global ? { scope: "user", label: "global", path: join(paths.configDir, "skills", name) } : null],
			});
		}
		const files = (folder, suffix) => (existsSync(join(dir, folder)) ? readdirSync(join(dir, folder), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(suffix) && entry.name !== "README.md").map((entry) => entry.name) : []);
		for (const file of files("agents", ".agent.md")) {
			const source = join(dir, "agents", file);
			const [user, project] = [agentPath(false, file), agentPath(true, file)];
			item("agent", file.replace(/\.agent\.md$/, ""), {
				file,
				source,
				description: readDescription(source),
				tokens: descriptionTokens(source),
				installs: [existsSync(user) && { scope: "user", label: "global", path: user }, existsSync(project) && { scope: "project", label: "project", path: project }],
			});
		}
		for (const [kind, folder] of [["rule", "rules"], ["claude-md", "claude-md-files"]]) {
			for (const file of files(folder, ".md")) {
				const source = join(dir, folder, file);
				const to = kind === "rule" ? join(paths.configDir, "rules", file) : claudeMdPaths()[0];
				const same = existsSync(to) && (kind === "rule" || sameFile(source, to));
				item(kind, file.replace(/\.md$/, ""), {
					file,
					source,
					description: readDescription(source) || firstHeading(source),
					tokens: estimateTokens(readFileSync(source, "utf8")),
					installs: [same && { scope: kind === "rule" ? "user" : "project", label: kind === "rule" ? "global" : "project", path: to }],
				});
			}
		}
		const servers = (() => {
			try {
				return JSON.parse(readFileSync(join(dir, "global", "mcp.json"), "utf8")).mcpServers ?? {};
			} catch {
				return {};
			}
		})();
		const present = mcpInstalled();
		for (const [name, raw] of Object.entries(servers)) {
			item("mcp", name, { raw, description: summarize(raw), tokens: null, installs: present.has(name) ? [{ scope: "mcp", label: present.get(name).join(", ") }] : [] });
		}
		return found.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.bundle.localeCompare(b.bundle) || a.name.localeCompare(b.name));
	};

	// [{ kind, name, id, bundle, description, tokens, installed (text or undefined), outdated, installs[], shelf?, global? }]
	const entries = () => items().map(({ source, raw, file, ...rest }) => rest);

	const needFetched = () => {
		if (!fetched()) {
			err("The catalog is not fetched yet: run agentry catalog refresh");
			return false;
		}
		return true;
	};

	const list = ({ json = false } = {}) => {
		if (!needFetched()) {
			return 1;
		}
		const all = entries();
		if (json) {
			out(JSON.stringify(all, null, 2));
			return 0;
		}
		for (const entry of all) {
			const where = entry.installs.map((one) => (one.scope === "user" ? WHERE[entry.kind] : one.scope === "project" && entry.kind === "agent" ? ".claude/agents" : one.label)).join(", ") || "not installed";
			out(`${entry.bundle.padEnd(8)} ${(entry.kind === "skill" ? entry.name : entry.id).padEnd(30)} ${entry.tokens === null ? "     -" : `~${String(entry.tokens).padStart(4)}`}  ${where}${entry.outdated ? "  outdated" : ""}`);
		}
		return 0;
	};

	// A bare name works when exactly one item has it; kind/name always does.
	const pick = (all, ref) => {
		const slash = ref.indexOf("/");
		if (slash > 0 && KINDS.includes(ref.slice(0, slash))) {
			const entry = all.find((one) => one.id === ref);
			return entry ? { entry } : { error: `No ${ref.slice(0, slash)} "${ref.slice(slash + 1)}" in the catalog. See agentry catalog list` };
		}
		const hits = all.filter((one) => one.name === ref);
		if (hits.length === 1) {
			return { entry: hits[0] };
		}
		return { error: hits.length === 0 ? `No item "${ref}" in the catalog. See agentry catalog list` : `"${ref}" matches ${hits.map((one) => one.id).join(" and ")}; name one as kind/name` };
	};

	// Copies source to `to` (never over something there) and says so. `where` words the destination.
	const place = (entry, to, where, { dryRun }) => {
		if (existsSync(to) || lstatSync(to, { throwIfNoEntry: false })) {
			err(`refused: ${tilde(to)} already exists; not overwriting it${UPDATABLE.has(entry.kind) ? ` (agentry catalog update ${entry.id} refreshes an installed copy)` : ""}.`);
			return 1;
		}
		if (dryRun) {
			out(`would add ${entry.id} to ${where}: ${entry.source} -> ${to}`);
			return 0;
		}
		mkdirSync(dirname(to), { recursive: true });
		cpSync(entry.source, to, { recursive: true });
		out(`added ${entry.id} to ${where}: ${tilde(to)}`);
		return 0;
	};

	// Copies each item into place (skills onto the shelf, group default: their bundle). Stops at the first problem; nothing
	// is overwritten. project: agents and MCP servers go to this project instead of the user. dryRun previews.
	const add = async (refs, { group, project = false, dryRun = false, yes = false } = {}) => {
		if (!needFetched()) {
			return 1;
		}
		if (group !== undefined && (group === "" || group === "agents" || group.includes("/") || group.startsWith("."))) {
			err(`Not a usable group name: "${group}"`);
			return 1;
		}
		const all = items();
		for (const ref of refs) {
			const { entry, error } = pick(all, ref);
			if (error) {
				err(error);
				return 1;
			}
			let code = 0;
			if (entry.kind === "skill") {
				if (entry.installed) {
					err(`${entry.name} is already installed (${entry.shelf ? `shelf/${entry.shelf}` : "~/.claude/skills"}); not overwriting`);
					return 1;
				}
				const to = join(paths.shelfDir, group ?? entry.bundle, entry.name);
				if (dryRun) {
					out(`would add ${entry.name} to shelf group ${group ?? entry.bundle}: ${entry.source} -> ${to}`);
					continue;
				}
				mkdirSync(dirname(to), { recursive: true });
				cpSync(entry.source, to, { recursive: true });
				out(`added ${entry.name} to shelf group ${group ?? entry.bundle} (off); turn it on with agentry shelf on ${group ?? entry.bundle}/${entry.name}`);
			} else if (entry.kind === "agent") {
				code = place(entry, agentPath(project, entry.file), project ? "this project's .claude/agents" : "~/.claude/agents", { dryRun });
			} else if (entry.kind === "rule") {
				code = place(entry, join(paths.configDir, "rules", entry.file), "~/.claude/rules", { dryRun });
			} else if (entry.kind === "claude-md") {
				const existing = claudeMdPaths().find((file) => existsSync(file));
				if (existing) {
					err(`refused: this project already has ${tilde(existing)}; not overwriting it. Merge ${entry.source} into it by hand.`);
					return 1;
				}
				code = place(entry, claudeMdPaths()[0], "this project as CLAUDE.md", { dryRun });
			} else {
				code = await createMcpEdit(paths, { out, err, ...mcp }).add({ name: entry.name, scope: project ? "project" : "user", path: root(), yes, dryRun, ...mcpOptionsOf(entry.raw) });
			}
			if (code !== 0) {
				return code;
			}
		}
		return 0;
	};

	// Replaces each outdated installed skill, agent or rule (all: every outdated one) with the catalog's copy. Previews the
	// files that change, saves the current copy under <backups>/updated/<time>/, then writes; asks y (or --yes) first.
	const update = async (refs, { all = false, dryRun = false, yes = false } = {}) => {
		if (!needFetched()) {
			return 1;
		}
		const every = items();
		const chosen = [];
		for (const ref of all ? [] : refs) {
			const { entry, error } = pick(every, ref);
			if (error || !UPDATABLE.has(entry.kind) || !entry.installed) {
				err(error ?? (UPDATABLE.has(entry.kind) ? `${entry.id} is not installed; agentry catalog add ${entry.id}` : `refused: ${entry.id} is copied or added once; there is nothing to update (a CLAUDE.md or MCP entry may be edited locally).`));
				return 1;
			}
			chosen.push(entry);
		}
		const todo = all ? every.filter((entry) => entry.outdated) : chosen.filter((entry) => entry.outdated);
		chosen.filter((entry) => !entry.outdated).forEach((entry) => out(`${entry.id} is up to date`));
		const jobs = todo.flatMap((entry) => entry.installs.filter((one) => one.outdated).map((install) => ({ entry, install, diff: diffOf(entry.source, install.path) })));
		if (jobs.length === 0) {
			all && out("Everything installed is up to date.");
			return 0;
		}
		const stamp = now().toISOString().replace(/[:.]/g, "-");
		let n = 0;
		while (existsSync(join(paths.backupsDir, "updated", n ? `${stamp}-${n}` : stamp))) {
			n++;
		}
		const saveIn = join(paths.backupsDir, "updated", n ? `${stamp}-${n}` : stamp);
		for (const { entry, install, diff } of jobs) {
			out(`update ${entry.id} at ${tilde(install.path)}:`);
			const name = (one) => one || basename(install.path);
			diff.changed.forEach((one) => out(`  overwrite ${name(one)}  (differs from the catalog copy: a local edit in it is replaced)`));
			diff.added.forEach((one) => out(`  add ${name(one)}`));
			diff.extra.forEach((one) => out(`  keep ${name(one)}  (only in your copy; not touched)`));
		}
		out(`The current copy of each is saved under ${tilde(saveIn)} first.`);
		if (dryRun || (!yes && !isTTY())) {
			out(dryRun ? "Dry run: nothing changed." : "Nothing changed; run again with --yes to apply.");
			return 0;
		}
		if (!yes && !(await confirm("\nOverwrite these? [y/N] "))) {
			out("Cancelled; nothing changed.");
			return 0;
		}
		for (const { entry, install, diff } of jobs) {
			const saved = join(saveIn, `${entry.kind}_${entry.name}_${install.scope}`);
			mkdirSync(dirname(saved), { recursive: true, mode: 0o700 });
			cpSync(install.path, saved, { recursive: true });
			noteUpdatedCopy({ saveIn, label: basename(saved), from: install.path, what: entry.kind, now });
			for (const one of [...diff.changed, ...diff.added]) {
				const [from, to] = one ? [join(entry.source, one), join(install.path, one)] : [entry.source, install.path];
				mkdirSync(dirname(to), { recursive: true });
				copyFileSync(from, to);
			}
			out(`updated ${entry.id} (${install.label})`);
		}
		return 0;
	};

	return { refresh, entries, list, add, update, fetched: () => fetched(), dir };
};
