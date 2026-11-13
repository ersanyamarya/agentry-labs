// Every path the CLI touches resolves here, so tests can redirect it with CLAUDE_CONFIG_DIR / AGENTRY_HOME.
// AGENTRY_HOME replaces the home directory (default: the OS home); CLAUDE_CONFIG_DIR replaces <home>/.claude.
// Facts behind the Claude Code paths: cli/docs/claude-config-sources.md.

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const runGit = (args: string[], cwd: string): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

// `memoize` keeps each git answer for the life of this object: for long scans over many folders, not for code that edits repos.
export interface PathsOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  memoize?: boolean;
}

export type Paths = ReturnType<typeof createPaths>;

export const createPaths = ({
  env = process.env,
  cwd = process.cwd(),
  memoize = false,
}: PathsOptions = {}) => {
  const answers = new Map<string, { value: string } | { error: unknown }>();
  const git = (args: string[], dir: string): string => {
    if (!memoize) {
      return runGit(args, dir);
    }
    const key = `${dir}\0${args.join(" ")}`;
    if (!answers.has(key)) {
      try {
        answers.set(key, { value: runGit(args, dir) });
      } catch (error) {
        answers.set(key, { error });
      }
    }
    const answer = answers.get(key) as { value: string } | { error: unknown };
    if ("error" in answer) {
      throw answer.error;
    }
    return answer.value;
  };
  const home = env.AGENTRY_HOME || homedir();
  const configDir = env.CLAUDE_CONFIG_DIR || join(home, ".claude");

  const projectRoot = (dir: string = cwd): string => {
    try {
      return git(["rev-parse", "--show-toplevel"], dir);
    } catch {
      return dir;
    }
  };

  // The key of a project's entry in .claude.json: the main checkout's root, also from a worktree or a subfolder.
  const repoKey = (dir: string = cwd): string => {
    try {
      const common = git(
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        dir
      );
      return basename(common) === ".git" ? dirname(common) : projectRoot(dir);
    } catch {
      return dir;
    }
  };

  // In a worktree .git is a file, so ask git where info/exclude lives; undefined outside a git repo.
  const excludeFile = (root: string): string | undefined => {
    try {
      return resolve(
        root,
        git(["rev-parse", "--git-path", "info/exclude"], root)
      );
    } catch {
      return undefined;
    }
  };

  return {
    home,
    configDir,
    shelfDir: join(configDir, "skill-shelf"),
    cacheDir: join(configDir, "cache", "agentry"),
    // Parked user-scope MCP servers (agentry mcp disable): full configs, secrets included, mode 0600. See src/lib/mcp-toggle.ts.
    parkedMcp: join(configDir, "agentry", "parked-mcp.json"),
    // Hooks turned off with agentry hook disable: the raw hook entries, mode 0600. See src/lib/hook-toggle.ts.
    parkedHooks: join(configDir, "agentry", "parked-hooks.json"),
    backupsDir: join(configDir, "backups", "agentry"),
    // With CLAUDE_CONFIG_DIR set, Claude Code keeps .claude.json inside it rather than in the home directory.
    claudeJson: env.CLAUDE_CONFIG_DIR
      ? join(configDir, ".claude.json")
      : join(home, ".claude.json"),
    pluginsDir: env.CLAUDE_CODE_PLUGIN_CACHE_DIR || join(configDir, "plugins"),
    // Where managed (enterprise) Claude Code settings live; AGENTRY_MANAGED_DIR redirects it for tests.
    managedDir:
      env.AGENTRY_MANAGED_DIR ||
      (process.platform === "darwin"
        ? "/Library/Application Support/ClaudeCode"
        : "/etc/claude-code"),
    desktopDir: join(home, "Library", "Application Support", "Claude"),
    projectRoot,
    repoKey,
    excludeFile,
  };
};
