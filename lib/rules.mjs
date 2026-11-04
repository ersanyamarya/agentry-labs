// The instruction files Claude Code loads into every session: CLAUDE.md files and rule files, user and project.
//   user:    ~/.claude/CLAUDE.md, ~/.claude/rules/**/*.md
//   project: <root>/CLAUDE.md, <root>/.claude/CLAUDE.md, <root>/CLAUDE.local.md, <root>/.claude/rules/**/*.md
// The token cost is the whole file (unlike a skill, nothing is loaded on demand). `remove` deletes one file after copying it
// to <backups>/removed/<time>/ (restore with agentry backups restore), unless backup is false. Nothing here edits a file.

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { removedCopyPath, saveRemovedCopy } from "./backups.mjs";
import { estimateTokens } from "./tokens.mjs";

const markdownIn = (dir, depth = 0) => {
	if (!existsSync(dir) || depth > 3) {
		return [];
	}
	return readdirSync(dir, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name))
		.flatMap((entry) => (entry.isDirectory() ? markdownIn(join(dir, entry.name), depth + 1) : entry.name.endsWith(".md") ? [join(dir, entry.name)] : []));
};

export const createRules = (paths, { out = console.log, err = console.error, now = () => new Date() } = {}) => {
	const tilde = (text) => (paths.home ? text.replaceAll(`${paths.home}/`, "~/") : text);

	// [{ id, scope: user|project, kind: claude-md|rule, label, title, path, tokens, bytes }]; only files that exist.
	const entries = () => {
		const root = paths.projectRoot();
		const sets = [
			["user", paths.configDir, [join(paths.configDir, "CLAUDE.md")], join(paths.configDir, "rules")],
			["project", root, [join(root, "CLAUDE.md"), join(root, ".claude", "CLAUDE.md"), join(root, "CLAUDE.local.md")], join(root, ".claude", "rules")],
		];
		return sets.flatMap(([scope, base, claudeMds, rulesDir]) => [
			...claudeMds.filter((file) => existsSync(file)).map((file) => [file, "claude-md"]),
			...markdownIn(rulesDir).map((file) => [file, "rule"]),
		].map(([file, kind]) => {
			const text = readFileSync(file, "utf8");
			const inside = relative(scope === "user" ? paths.configDir : root, file);
			return {
				id: `${scope}:${inside}`,
				scope,
				kind,
				label: scope === "user" ? tilde(file) : inside,
				title: `${inside.split("/").at(-1)} (${scope} ${kind === "rule" ? "rule" : "CLAUDE.md"})`,
				path: file,
				tokens: estimateTokens(text),
				bytes: Buffer.byteLength(text),
			};
		}));
	};

	const list = ({ json = false } = {}) => {
		const all = entries();
		if (json) {
			out(JSON.stringify(all, null, 2));
			return 0;
		}
		if (all.length === 0) {
			out("No CLAUDE.md or rule files found for this project or the user.");
			return 0;
		}
		for (const entry of all) {
			out(`${entry.scope.padEnd(8)} ${entry.label.padEnd(44)} ~${String(entry.tokens).padStart(5)} tokens`);
		}
		return 0;
	};

	// target: a label as list prints it, an absolute path, or a file name that is unique.
	const resolveTarget = (target) => {
		const all = entries();
		const exact = all.filter((entry) => entry.label === target || entry.path === target || entry.id === target);
		const found = exact.length > 0 ? exact : all.filter((entry) => entry.path.split("/").at(-1) === target);
		if (found.length === 1) {
			return { entry: found[0] };
		}
		return found.length === 0 ? { error: `No CLAUDE.md or rule file "${target}". See agentry rules list`, code: 2 } : { error: `"${target}" matches ${found.length} files (${found.map((entry) => entry.label).join(", ")}); name one in full.`, code: 2 };
	};

	const remove = (target, { dryRun = false, backup = true } = {}) => {
		const { entry, error, code } = resolveTarget(target);
		if (error) {
			err(error);
			return code;
		}
		const to = removedCopyPath(paths, now, entry.title);
		if (dryRun) {
			out(`would remove ${entry.title}: ${entry.path} (${backup ? `copy kept in ${to}` : "no copy kept"})`);
			return 0;
		}
		if (backup) {
			saveRemovedCopy({ from: entry.path, to, label: entry.title, now, what: entry.kind === "rule" ? "rule" : "CLAUDE.md" });
		}
		rmSync(entry.path);
		out(`removed ${entry.title}; ${backup ? `a copy is in ${to}` : "no copy kept"}`);
		return 0;
	};

	return { entries, list, remove };
};
