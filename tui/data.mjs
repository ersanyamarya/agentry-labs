// The UI's only door to lib/: every read and every action goes through the same functions the CLI uses.
// `makePaths(dir)` builds the paths for one project folder; options reach the lib factories so tests can inject fixtures.

import { createBackups } from "../lib/backups.mjs";
import { createCatalog } from "../lib/catalog.mjs";
import { createDoctor } from "../lib/doctor.mjs";
import { createFix, findingKey } from "../lib/fix.mjs";
import { createFixUndo } from "../lib/fix-undo.mjs";
import { createHookToggle } from "../lib/hook-toggle.mjs";
import { createMcpEdit } from "../lib/mcp-edit.mjs";
import { createMcpToggle } from "../lib/mcp-toggle.mjs";
import { createPluginInstall } from "../lib/plugin-install.mjs";
import { createPluginToggle } from "../lib/plugin-toggle.mjs";
import { createRules } from "../lib/rules.mjs";
import { createShelf } from "../lib/shelf.mjs";
import { createStatus } from "../lib/status.mjs";

const failure = (error) => `failed (${error?.code ?? error?.name ?? "error"})`;

// Runs fn with out/err/warn collected into lines instead of printed.
const capture = async (make, run) => {
	const lines = [];
	const push = (line) => lines.push(String(line));
	const code = await run(make({ out: push, err: push, warn: push }));
	return { code, lines };
};

export const createData = ({ makePaths, doctorOptions = {}, fixOptions = {}, catalogOptions = {}, now = () => new Date() }) => {
	const doctorFor = (paths) => createDoctor(paths, { out: () => {}, err: () => {}, ...doctorOptions });
	const fixFor = (paths, io) => createFix(paths, { ...io, doctor: () => doctorFor(paths), now, ...fixOptions });

	// Collects everything a tab shows; a failed part is reported, never thrown, so one bad file cannot blank the UI.
	const load = (dir) => {
		const paths = makePaths(dir);
		const attempt = (name, fn, fallback) => {
			try {
				return fn();
			} catch (error) {
				return { ...fallback, loadError: `${name} ${failure(error)}` };
			}
		};
		const noIo = { out: () => {}, err: () => {}, warn: () => {} };
		return {
			dir,
			paths,
			status: attempt("status", () => createStatus(paths, { out: () => {}, err: () => {} }).collect(dir), {
				project: { cwd: dir, root: dir },
				skills: { items: [], skipped: [] },
				mcp: { servers: [] },
				hooks: { items: [] },
				plugins: { items: [], marketplaces: [] },
				tokens: { measured: 0 },
				errors: [],
			}),
			doctor: attempt("doctor", () => doctorFor(paths).collect(dir), { findings: [], summary: { error: 0, warning: 0, info: 0 }, errors: [] }),
			backups: attempt("backups", () => createBackups(paths, { ...noIo, now }).entries(), []),
			parkedHooks: attempt("parked hooks", () => createHookToggle(paths).listParked(), []),
			parked: attempt("parked", () => createMcpToggle(paths).listParked(), []),
			rules: attempt("rules", () => createRules(paths, noIo).entries(), []),
			groups: attempt("shelf", () => createShelf(paths, noIo).groups(), []),
			catalog: attempt("catalog", () => {
				const catalog = createCatalog(paths, { ...noIo, ...catalogOptions });
				return { fetched: catalog.fetched(), entries: catalog.entries() };
			}, { fetched: false, entries: [] }),
		};
	};

	// target: "group" or "group/skill". Returns { ok, message } with the shelf's own output.
	const toggleShelf = async ({ dir, target, on, global }) => {
		const paths = makePaths(dir);
		const { code, lines } = await capture((io) => createShelf(paths, io), (shelf) => (on ? shelf.on : shelf.off)([target], { global }));
		return { ok: code === 0, message: lines.join("\n") || `${target} ${on ? "on" : "off"}` };
	};

	// Moves a skill between ~/.claude/skills and the shelf with the shelf's own checks (no overwrite, refuses while linked).
	// dryRun previews: nothing moves. Returns { ok, text }.
	const moveSkill = async ({ dir, action, args, dryRun = false, options = {} }) => {
		const { code, lines } = await capture((io) => createShelf(makePaths(dir), io), (shelf) => shelf[action](...args, { dryRun, ...options }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};
	const shelveSkill = ({ dir, skill, group, dryRun }) => moveSkill({ dir, action: "shelve", args: [skill, group], dryRun });
	const unshelveSkill = ({ dir, target, dryRun }) => moveSkill({ dir, action: "unshelve", args: [target], dryRun });
	// Moves a real skill folder between this project and ~/.claude/skills (lib/shelf.mjs promote/demote). Preview with dryRun.
	const promoteSkill = ({ dir, skill, dryRun }) => moveSkill({ dir, action: "promote", args: [skill], dryRun });
	const demoteSkill = ({ dir, skill, dryRun }) => moveSkill({ dir, action: "demote", args: [skill], dryRun });
	// Deletes a skill after copying it to the backups (see lib/shelf.mjs remove). Preview with dryRun.
	const removeSkill = ({ dir, target, dryRun, project, backup = true }) => moveSkill({ dir, action: "remove", args: [target], dryRun, options: { project, backup } });

	// Backups manager (lib/backups.mjs): restore a removed skill, delete or prune backups. Previews are the lib's own dry run.
	const backupsFor = (dir, io) => createBackups(makePaths(dir), { ...io, now });
	const restoreBackup = async ({ dir, id, dryRun = false }) => {
		const { code, lines } = await capture((io) => backupsFor(dir, io), (backups) => backups.restore(id, { dryRun }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};
	const pruneBackups = async ({ dir, ids, olderThan, all, dryRun = false }) => {
		const { code, lines } = await capture((io) => backupsFor(dir, io), (backups) => backups.prune({ ids, olderThan, all, dryRun, yes: !dryRun }));
		const text = lines.join("\n").replace(/\n?Dry run: nothing deleted\./, "").trim();
		return { ok: code === 0 && (dryRun ? lines.some((line) => line.startsWith("Would delete")) : true), text };
	};

	// The agentry-labs catalog: fetch (network, cached), install its skills, agents, rules, CLAUDE.md files and MCP servers, update. Each returns { ok, text }.
	const catalogFor = (dir, io) => createCatalog(makePaths(dir), { ...io, ...catalogOptions });
	const refreshCatalog = async ({ dir }) => {
		// one tick, so "Fetching..." can paint before the blocking git call
		await new Promise((resolve) => setTimeout(resolve, 30));
		const { code, lines } = await capture((io) => catalogFor(dir, io), (catalog) => catalog.refresh());
		return { ok: code === 0, text: lines.join("\n").trim() };
	};
	// project: agents and MCP servers go to this project. A real run answers the engine's question with y (the UI asked already).
	const addFromCatalog = async ({ dir, names, group, project, dryRun = false }) => {
		const { code, lines } = await capture((io) => catalogFor(dir, io), (catalog) => catalog.add(names, { group, project, dryRun, yes: !dryRun }));
		return { ok: code === 0, text: lines.join("\n").replace(/\n?Dry run: nothing written\./, "").trim() };
	};
	const updateFromCatalog = async ({ dir, names, dryRun = false }) => {
		const { code, lines } = await capture((io) => catalogFor(dir, io), (catalog) => catalog.update(names, { dryRun, yes: !dryRun }));
		return { ok: code === 0, text: lines.join("\n").replace(/\n?Dry run: nothing changed\./, "").trim() };
	};
	// An installed catalog agent (target: agent/<name>): delete after a copy to the backups. Preview with dryRun.
	const removeAgent = async ({ dir, target, project, dryRun = false, backup = true }) => {
		const { code, lines } = await capture((io) => catalogFor(dir, { ...io, now }), (catalog) => catalog.remove([target], { project, dryRun, backup, yes: !dryRun }));
		return { ok: code === 0, text: lines.join("\n").replace(/\n?Dry run: nothing changed\./, "").trim() };
	};
	// CLAUDE.md and rule files (lib/rules.mjs): delete after a copy to the backups. Preview with dryRun.
	const removeRule = async ({ dir, target, dryRun = false, backup = true }) => {
		const { code, lines } = await capture((io) => createRules(makePaths(dir), { ...io, now }), (rules) => rules.remove(target, { dryRun, backup }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};

	// Plugin enable/disable: the engine's own preview (dry run), then, after an explicit y, backup + write + verify.
	const toggleFor = (dir, io) => createPluginToggle(makePaths(dir), { ...io, now });
	const previewPlugin = async ({ dir, id, enable }) => {
		const { code, lines } = await capture((io) => toggleFor(dir, io), (toggle) => toggle.run({ name: id, enable, path: dir, dryRun: true }));
		const text = lines.join("\n").replace(/\n?Dry run: nothing written\./, "").trim();
		return { appliable: code === 0 && lines.some((line) => line.startsWith(`[plugin-toggle]`)), text };
	};
	const applyPlugin = async ({ dir, id, enable }) => {
		const { code, lines } = await capture((io) => toggleFor(dir, io), (toggle) => toggle.run({ name: id, enable, path: dir, yes: true }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};

	// Plugin install/uninstall through `claude plugin` (lib/plugin-install.mjs): the engine's dry run, then after y the command.
	const installFor = (dir, io) => createPluginInstall(makePaths(dir), { ...io, now });
	const previewPluginInstall = async ({ dir, action, name, scope }) => {
		const { code, lines } = await capture((io) => installFor(dir, io), (install) => install.run({ action, name, scope, path: dir, dryRun: true }));
		return { appliable: code === 0 && lines.some((line) => line.startsWith("[plugin-install]")), text: lines.join("\n").replace(/\n?Dry run: nothing written\./, "").trim() };
	};
	const applyPluginInstall = async ({ dir, action, name, scope }) => {
		const { code, lines } = await capture((io) => installFor(dir, io), (install) => install.run({ action, name, scope, path: dir, yes: true }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};

	// User-scope MCP servers: park (claude mcp remove, config saved first) and add back. Preview = the engine's dry run.
	const mcpFor = (dir, io) => createMcpToggle(makePaths(dir), { ...io, now });
	const previewMcp = async ({ dir, name, enable }) => {
		const { code, lines } = await capture((io) => mcpFor(dir, io), (toggle) => toggle.run({ name, enable, path: dir, dryRun: true }));
		return { appliable: code === 0 && lines.some((line) => line.startsWith("[mcp-toggle]")), text: lines.join("\n").replace(/\n?Dry run: nothing written\./, "").trim() };
	};
	const previewMcpRemove = async ({ dir, name }) => {
		const { code, lines } = await capture((io) => mcpFor(dir, io), (toggle) => toggle.remove({ name, path: dir, dryRun: true }));
		return { appliable: code === 0 && lines.length > 0, text: lines.join("\n").replace(/\n?Dry run: nothing written\./, "").trim() };
	};
	const applyMcpRemove = async ({ dir, name }) => {
		const { code, lines } = await capture((io) => mcpFor(dir, io), (toggle) => toggle.remove({ name, path: dir, yes: true }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};
	const applyMcp = async ({ dir, name, enable }) => {
		const { code, lines } = await capture((io) => mcpFor(dir, io), (toggle) => toggle.run({ name, enable, path: dir, yes: true }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};

	// Hooks in settings files: turn off (parked), on, remove. Preview = the engine's dry run.
	const hookFor = (dir, io) => createHookToggle(makePaths(dir), { ...io, now });
	const previewHook = async ({ dir, selector, action, scope }) => {
		const { code, lines } = await capture((io) => hookFor(dir, io), (hooks) => hooks.run({ selector, action, scope, path: dir, dryRun: true }));
		return { appliable: code === 0 && lines.some((line) => line.startsWith("[hook-toggle]") || line.startsWith("would delete")), text: lines.join("\n").replace(/\n?Dry run: nothing written\./, "").trim() };
	};
	const applyHook = async ({ dir, selector, action, scope }) => {
		const { code, lines } = await capture((io) => hookFor(dir, io), (hooks) => hooks.run({ selector, action, scope, path: dir, yes: true }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};

	// MCP add (user via claude mcp add-json, project via .mcp.json) and set (env/args of a user server).
	const editFor = (dir, io) => createMcpEdit(makePaths(dir), { ...io, now });
	const mcpEdit = (method) => async ({ dir, dryRun, ...args }) => {
		const { code, lines } = await capture((io) => editFor(dir, io), (edit) => edit[method]({ ...args, path: dir, dryRun, yes: !dryRun }));
		const text = lines.join("\n").replace(/\n?Dry run: nothing written\./, "").trim();
		return dryRun ? { appliable: code === 0 && lines.some((line) => line.startsWith("[mcp-edit]")), text } : { ok: code === 0, text };
	};
	const previewMcpAdd = (args) => mcpEdit("add")({ ...args, dryRun: true });
	const applyMcpAdd = (args) => mcpEdit("add")(args);
	const previewMcpSet = (args) => mcpEdit("set")({ ...args, dryRun: true });
	const applyMcpSet = (args) => mcpEdit("set")(args);

	const stepsOf = (planned) => planned.edits.length + planned.commands.length;

	// Dry-run preview of one finding's fix: the engine's own masked diff. Nothing is written.
	const previewFix = async ({ dir, finding }) => {
		const paths = makePaths(dir);
		const key = findingKey(finding);
		const include = (item) => findingKey(item) === key;
		const planned = fixFor(paths, { out: () => {}, err: () => {} }).plan(dir, { include });
		const { lines } = await capture((io) => fixFor(paths, io), (fix) => fix.run({ path: dir, dryRun: true, include }));
		const steps = stepsOf(planned);
		const text = lines.join("\n").replace(/\n?Dry run: nothing written\./, "").trim();
		return { appliable: steps > 0 && planned.failures.length === 0, steps, text: steps === 0 && !/no fix:/.test(text) ? `${text}\nNo automatic fix is registered for this finding.`.trim() : text };
	};

	// Only called after an explicit confirm keypress. Backs up, writes and verifies through the Phase 5 engine.
	const applyFix = async ({ dir, finding }) => {
		const paths = makePaths(dir);
		const key = findingKey(finding);
		const { code, lines } = await capture((io) => fixFor(paths, io), (fix) => fix.run({ path: dir, yes: true, include: (item) => findingKey(item) === key }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};

	const undoFor = (paths, io) => createFixUndo(paths, { ...io, now });

	const previewUndo = async ({ dir }) => {
		const { code, lines } = await capture((io) => undoFor(makePaths(dir), io), (undo) => undo.run({ dryRun: true }));
		return { appliable: code === 0 && lines.some((line) => /^ {2}(restore|delete|link) /.test(line)), text: lines.join("\n").replace(/\n?Dry run: nothing restored\./, "").trim() };
	};

	const applyUndo = async ({ dir }) => {
		const { code, lines } = await capture((io) => undoFor(makePaths(dir), io), (undo) => undo.run({ yes: true }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};

	return { load, toggleShelf, shelveSkill, unshelveSkill, removeSkill, promoteSkill, demoteSkill, restoreBackup, pruneBackups, refreshCatalog, addFromCatalog, updateFromCatalog, removeAgent, removeRule, previewPlugin, applyPlugin, previewPluginInstall, applyPluginInstall, previewMcp, applyMcp, previewMcpRemove, applyMcpRemove, previewMcpAdd, applyMcpAdd, previewMcpSet, applyMcpSet, previewHook, applyHook, previewFix, applyFix, previewUndo, applyUndo };
};
