// The UI's only door to lib/: every read and every action goes through the same functions the CLI uses.
// `makePaths(dir)` builds the paths for one project folder; options reach the lib factories so tests can inject fixtures.

import { createDoctor } from "../lib/doctor.mjs";
import { createFix, findingKey } from "../lib/fix.mjs";
import { createFixUndo } from "../lib/fix-undo.mjs";
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

export const createData = ({ makePaths, doctorOptions = {}, fixOptions = {}, now = () => new Date() }) => {
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
			groups: attempt("shelf", () => createShelf(paths, noIo).groups(), []),
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
	const moveSkill = async ({ dir, action, args, dryRun = false }) => {
		const { code, lines } = await capture((io) => createShelf(makePaths(dir), io), (shelf) => shelf[action](...args, { dryRun }));
		return { ok: code === 0, text: lines.join("\n").trim() };
	};
	const shelveSkill = ({ dir, skill, group, dryRun }) => moveSkill({ dir, action: "shelve", args: [skill, group], dryRun });
	const unshelveSkill = ({ dir, target, dryRun }) => moveSkill({ dir, action: "unshelve", args: [target], dryRun });

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

	return { load, toggleShelf, shelveSkill, unshelveSkill, previewFix, applyFix, previewUndo, applyUndo };
};
