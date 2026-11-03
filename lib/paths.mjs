// Every path the CLI touches resolves here, so tests can redirect it with CLAUDE_CONFIG_DIR / AGENTRY_HOME.
// AGENTRY_HOME replaces the home directory (default: the OS home); CLAUDE_CONFIG_DIR replaces <home>/.claude.
// Facts behind the Claude Code paths: docs/claude-config-sources.md.

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

export const createPaths = ({ env = process.env, cwd = process.cwd() } = {}) => {
	const home = env.AGENTRY_HOME || homedir();
	const configDir = env.CLAUDE_CONFIG_DIR || join(home, ".claude");

	const projectRoot = (dir = cwd) => {
		try {
			return git(["rev-parse", "--show-toplevel"], dir);
		} catch {
			return dir;
		}
	};

	// The key of a project's entry in .claude.json: the main checkout's root, also from a worktree or a subfolder.
	const repoKey = (dir = cwd) => {
		try {
			const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], dir);
			return basename(common) === ".git" ? dirname(common) : projectRoot(dir);
		} catch {
			return dir;
		}
	};

	// In a worktree .git is a file, so ask git where info/exclude lives; undefined outside a git repo.
	const excludeFile = (root) => {
		try {
			return resolve(root, git(["rev-parse", "--git-path", "info/exclude"], root));
		} catch {
			return undefined;
		}
	};

	return {
		home,
		configDir,
		shelfDir: join(configDir, "skill-shelf"),
		// With CLAUDE_CONFIG_DIR set, Claude Code keeps .claude.json inside it rather than in the home directory.
		claudeJson: env.CLAUDE_CONFIG_DIR ? join(configDir, ".claude.json") : join(home, ".claude.json"),
		pluginsDir: env.CLAUDE_CODE_PLUGIN_CACHE_DIR || join(configDir, "plugins"),
		desktopDir: join(home, "Library", "Application Support", "Claude"),
		projectRoot,
		repoKey,
		excludeFile,
	};
};
