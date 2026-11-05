// The instruction files Claude Code loads into every session: CLAUDE.md files and rule files, user and project.
//   user:    ~/.claude/CLAUDE.md, ~/.claude/rules/**/*.md
//   project: <root>/CLAUDE.md, <root>/.claude/CLAUDE.md, <root>/CLAUDE.local.md, <root>/.claude/rules/**/*.md
// The token cost is the whole file (unlike a skill, nothing is loaded on demand). `remove` deletes one file after copying it
// to <backups>/removed/<time>/ (restore with agentry backups restore), unless backup is false. Nothing here edits a file.

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { removedCopyPath, saveRemovedCopy } from "./backups.js";
import type { Paths } from "./paths.js";
import { estimateTokens } from "./tokens.js";

export interface RuleEntry {
	id: string;
	scope: "user" | "project";
	kind: "claude-md" | "rule";
	label: string;
	title: string;
	path: string;
	tokens: number;
	bytes: number;
}

export interface RulesOptions {
	out?: (text: string) => void;
	err?: (text: string) => void;
	now?: () => Date;
}

const markdownIn = (dir: string, depth = 0): string[] => {
	if (!existsSync(dir) || depth > 3) {
		return [];
	}
	return readdirSync(dir, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name))
		.flatMap((entry) => (entry.isDirectory() ? markdownIn(join(dir, entry.name), depth + 1) : entry.name.endsWith(".md") ? [join(dir, entry.name)] : []));
};

export const createRules = (paths: Paths, { out = console.log, err = console.error, now = () => new Date() }: RulesOptions = {}) => {
	const tilde = (text: string): string => (paths.home ? text.replaceAll(`${paths.home}/`, "~/") : text);

	// [{ id, scope: user|project, kind: claude-md|rule, label, title, path, tokens, bytes }]; only files that exist.
	const entries = (): RuleEntry[] => {
		const root = paths.projectRoot();
		const sets: ["user" | "project", string, string[], string][] = [
			["user", paths.configDir, [join(paths.configDir, "CLAUDE.md")], join(paths.configDir, "rules")],
			["project", root, [join(root, "CLAUDE.md"), join(root, ".claude", "CLAUDE.md"), join(root, "CLAUDE.local.md")], join(root, ".claude", "rules")],
		];
		return sets.flatMap(([scope, base, claudeMds, rulesDir]) => [
			...claudeMds.filter((file) => existsSync(file)).map((file): [string, RuleEntry["kind"]] => [file, "claude-md"]),
			...markdownIn(rulesDir).map((file): [string, RuleEntry["kind"]] => [file, "rule"]),
		].map(([file, kind]): RuleEntry => {
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

	const list = ({ json = false }: { json?: boolean } = {}): number => {
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
	const resolveTarget = (target: string): { entry: RuleEntry } | { error: string; code: number } => {
		const all = entries();
		const exact = all.filter((entry) => entry.label === target || entry.path === target || entry.id === target);
		const found = exact.length > 0 ? exact : all.filter((entry) => entry.path.split("/").at(-1) === target);
		if (found.length === 1) {
			return { entry: found[0] as RuleEntry };
		}
		return found.length === 0 ? { error: `No CLAUDE.md or rule file "${target}". See agentry rules list`, code: 2 } : { error: `"${target}" matches ${found.length} files (${found.map((entry) => entry.label).join(", ")}); name one in full.`, code: 2 };
	};

	const remove = (target: string, { dryRun = false, backup = true }: { dryRun?: boolean; backup?: boolean } = {}): number => {
		const resolved = resolveTarget(target);
		if ("error" in resolved) {
			err(resolved.error);
			return resolved.code;
		}
		const { entry } = resolved;
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
