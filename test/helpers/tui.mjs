// Renders the UI on a throwaway home with injected doctor rules and fixes. Never touches the real ~/.claude.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { createDiscover } from "../../lib/discover.mjs";
import { createPaths } from "../../lib/paths.mjs";
import { App } from "../../tui/app.mjs";
import { createData } from "../../tui/data.mjs";
import { createRecents } from "../../tui/recents.mjs";
import { createFixture } from "./fixture.mjs";

export const KEYS = { up: "\u001B[A", down: "\u001B[B", right: "\u001B[C", left: "\u001B[D", enter: "\r", esc: "\u001B", space: " " };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const createUi = ({ env = {}, spawn } = {}) => {
	const fx = createFixture({ shelf: { audit: { skills: ["review"] }, video: { skills: ["trim", "ffmpeg-install"] } } });
	assert.ok(!fx.root.startsWith(homedir()), "TMPDIR must be outside the home directory");
	writeFileSync(join(fx.configDir, "skill-shelf/video/trim/SKILL.md"), `---\nname: trim\ndescription: ${"x".repeat(40)}\n---\n`);

	const target = join(fx.repo, "target.json");
	writeFileSync(target, '{\n\t"value": "BAD"\n}\n');
	writeFileSync(join(fx.repo, ".mcp.json"), JSON.stringify({ mcpServers: { demo: { command: "echo", args: ["hi"], env: { API_KEY: "sk-supersecretvalue1234567890" } } } }));
	const rules = [
		{ id: "fake-bad", run: () => (readFileSync(target, "utf8").includes("BAD") ? [{ id: "fake-bad", severity: "warning", message: "target.json says BAD", file: target }] : []) },
		{ id: "fake-nofix", run: () => [{ id: "fake-nofix", severity: "info", message: "nothing can repair this", file: target }] },
	];
	const fixes = { "fake-bad": (finding) => ({ ruleId: finding.id, file: finding.file, describe: () => "Replace BAD with GOOD", apply: (text) => text.replace("BAD", "GOOD") }) };
	const doctorOptions = { platform: "linux", env: { PATH: "" }, rules, renames: {}, launchctlGetenv: () => "" };

	const makePaths = (dir) => createPaths({ env: { AGENTRY_HOME: fx.home, CLAUDE_CONFIG_DIR: fx.configDir }, cwd: dir });
	const finder = createDiscover();
	const props = {
		api: createData({ makePaths, doctorOptions, fixOptions: { fixes } }),
		startDir: fx.repo,
		recents: createRecents(makePaths(fx.repo)),
		discover: (roots) => finder.find(roots, { depth: 2 }),
		env,
		spawn,
	};
	const app = render(React.createElement(App, props));

	const until = async (pattern, what = String(pattern)) => {
		for (let tries = 0; tries < 100; tries++) {
			if (pattern.test(app.lastFrame() ?? "")) {
				return app.lastFrame();
			}
			await wait(20);
		}
		assert.fail(`never saw ${what}; last frame:\n${app.lastFrame()}`);
	};
	// Tabs mount once data arrives and Ink subscribes to stdin in an effect after the frame; keys sent sooner are lost.
	const ready = async () => {
		await until(/Shelf \(agentry shelf list\)/);
		await wait(60);
	};
	const press = async (...keys) => {
		for (const key of keys) {
			app.stdin.write(key);
			await wait(30);
		}
	};
	const stop = () => {
		app.unmount();
		fx.cleanup();
	};
	return { fx, target, app, until, ready, press, stop, frame: () => app.lastFrame(), exists: existsSync };
};
