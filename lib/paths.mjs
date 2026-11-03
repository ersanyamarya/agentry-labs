// Every path the CLI touches resolves here, so tests can redirect it with CLAUDE_CONFIG_DIR / AGENTRY_HOME.
// AGENTRY_HOME replaces the home directory (default: the OS home); CLAUDE_CONFIG_DIR replaces <home>/.claude.

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const createPaths = ({ env = process.env, cwd = process.cwd() } = {}) => {
	const home = env.AGENTRY_HOME || homedir();
	const configDir = env.CLAUDE_CONFIG_DIR || join(home, ".claude");

	const projectRoot = () => {
		try {
			return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
		} catch {
			return cwd;
		}
	};

	// In a worktree .git is a file, so ask git where info/exclude lives; undefined outside a git repo.
	const excludeFile = (root) => {
		try {
			const path = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
			return resolve(root, path);
		} catch {
			return undefined;
		}
	};

	return { home, configDir, shelfDir: join(configDir, "skill-shelf"), projectRoot, excludeFile };
};
