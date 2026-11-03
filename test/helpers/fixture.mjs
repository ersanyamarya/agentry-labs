// Builds a throwaway home with a shelf and a git repo, and runs the CLI against it. Never touches the real ~/.claude.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../../bin/agentry.mjs", import.meta.url));

// shelf: { group: { skills: [names], agents: [file names] } }
export const createFixture = ({ shelf = { video: { skills: ["ffmpeg-install", "trim"], agents: ["editor.md"] }, audit: { skills: ["review"] } } } = {}) => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-")));
	const home = join(root, "home");
	const configDir = join(home, ".claude");
	const repo = join(root, "repo");

	for (const [group, { skills = [], agents = [] }] of Object.entries(shelf)) {
		for (const skill of skills) {
			mkdirSync(join(configDir, "skill-shelf", group, skill), { recursive: true });
			writeFileSync(join(configDir, "skill-shelf", group, skill, "SKILL.md"), `---\nname: ${skill}\n---\n`);
		}
		for (const agent of agents) {
			mkdirSync(join(configDir, "skill-shelf", group, "agents"), { recursive: true });
			writeFileSync(join(configDir, "skill-shelf", group, "agents", agent), "agent\n");
		}
	}
	mkdirSync(repo, { recursive: true });
	execFileSync("git", ["init", "-q"], { cwd: repo });

	const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir, AGENTRY_HOME: home };
	const run = (args, { cwd = repo } = {}) => {
		const { status, stdout, stderr } = spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: "utf8" });
		return { status, stdout, stderr };
	};

	return { root, home, configDir, repo, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};
