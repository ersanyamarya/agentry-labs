// Builds a throwaway home with a shelf and a git repo, and runs the CLI against it. Never touches the real ~/.claude.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../../bin/agentry.mjs", import.meta.url));

// A plugin installed for the user scope, with one skill; `enabled` (default true, null for no entry) goes into <config>/settings.json.
export const addPlugin = (fx, { id = "demo@mkt", enabled = true, settingsText } = {}) => {
	const [name] = id.split("@");
	const installPath = join(fx.configDir, "plugins/cache/mkt", name, "1.0.0");
	mkdirSync(join(installPath, "skills/hello"), { recursive: true });
	writeFileSync(join(installPath, "skills/hello/SKILL.md"), `---\nname: hello\ndescription: ${"y".repeat(20)}\n---\n`);
	writeFileSync(join(fx.configDir, "plugins/installed_plugins.json"), JSON.stringify({ version: 2, plugins: { [id]: [{ scope: "user", installPath, version: "1.0.0" }] } }));
	const settings = join(fx.configDir, "settings.json");
	if (settingsText !== undefined) {
		writeFileSync(settings, settingsText);
	} else if (enabled !== null) {
		writeFileSync(settings, `{\n\t"enabledPlugins": {\n\t\t"${id}": ${enabled}\n\t}\n}\n`);
	}
	return { id, settings };
};

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

	const managedDir = join(root, "managed");
	const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir, AGENTRY_HOME: home, AGENTRY_MANAGED_DIR: managedDir };
	const run = (args, { cwd = repo, env: extra = {} } = {}) => {
		const { status, stdout, stderr } = spawnSync(process.execPath, [bin, ...args], { cwd, env: { ...env, ...extra }, encoding: "utf8" });
		return { status, stdout, stderr };
	};

	return { root, home, configDir, repo, managedDir, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};
