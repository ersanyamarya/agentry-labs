// @ts-nocheck
// Finds git repos and worktrees under one or more roots: a folder holding `.git` (a folder for a repo, a file for a
// worktree). Build output, dependency and map folders are skipped; hidden folders are skipped except the ones that
// hold worktrees. A found repo is still searched for nested repos and worktrees, but its plain subfolders are not reported.

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const SKIP_DIRS = ["node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".turbo", ".cache", "target", ".dart_tool", ".gradle", "Pods", "venv", ".venv", "__pycache__", "coverage", "graft"];
const HIDDEN_ALLOWED = [".claude", ".worktrees"];

export const createDiscover = ({ skip = SKIP_DIRS, hiddenAllowed = HIDDEN_ALLOWED } = {}) => {
	const skipSet = new Set(skip);
	const kindOf = (dir) => {
		try {
			return statSync(join(dir, ".git")).isDirectory() ? "repo" : "worktree";
		} catch {
			return undefined;
		}
	};

	// Returns [{ path, kind }] sorted by path; `depth` counts folder levels below a root (0 = the root itself).
	const find = (roots, { depth = 4 } = {}) => {
		const found = new Map();
		const walk = (dir, level) => {
			const kind = kindOf(dir);
			if (kind) {
				found.set(dir, { path: dir, kind });
			}
			if (level >= depth) {
				return;
			}
			let entries;
			try {
				entries = readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				if (!entry.isDirectory() || skipSet.has(entry.name) || (entry.name.startsWith(".") && !hiddenAllowed.includes(entry.name))) {
					continue;
				}
				walk(join(dir, entry.name), level + 1);
			}
		};
		for (const root of roots) {
			walk(resolve(root), 0);
		}
		return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
	};

	return { find };
};
