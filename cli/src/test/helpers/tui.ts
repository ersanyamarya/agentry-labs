// @ts-nocheck
// Renders the UI on a throwaway home with injected doctor rules and fixes. Never touches the real ~/.claude.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { createDiscover } from "../../lib/discover.js";
import { createPaths } from "../../lib/paths.js";
import { App } from "../../tui/app.js";
import { createData } from "../../tui/data.js";
import { createRecents } from "../../tui/recents.js";
import { addPlugin, createFixture } from "./fixture.js";

export const KEYS = { up: "\u001B[A", down: "\u001B[B", right: "\u001B[C", left: "\u001B[D", enter: "\r", esc: "\u001B", space: " " };

// Frames carry escape codes when the test forces colour; patterns match the frame as drawn or with the codes removed.
export const stripAnsi = (text) => text.replace(/\u001B\[[0-9;]*m/g, "");

// The frame with box borders removed and whitespace collapsed, so text the details pane wrapped can still be matched.
export const squash = (text) => stripAnsi(text).replace(/[│┌┐└┘─╭╮╰╯]/g, " ").replace(/\s+/g, " ");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const createUi = ({ env = {}, spawn, personal = [], plugin, size = { cols: 100, rows: 60 }, fit = false, catalogRepo, clipboard } = {}) => {
	const fx = createFixture({ shelf: { audit: { skills: ["review"] }, video: { skills: ["trim", "ffmpeg-install"] } } });
	assert.ok(!fx.root.startsWith(homedir()), "TMPDIR must be outside the home directory");
	writeFileSync(join(fx.configDir, "skill-shelf/video/trim/SKILL.md"), `---\nname: trim\ndescription: ${"x".repeat(40)}\n---\n`);

	for (const name of personal) {
		mkdirSync(join(fx.configDir, "skills", name), { recursive: true });
		writeFileSync(join(fx.configDir, "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: ${"z".repeat(8)}\n---\n`);
	}
	mkdirSync(join(fx.repo, ".claude/skills/proj"), { recursive: true });
	writeFileSync(join(fx.repo, ".claude/skills/proj/SKILL.md"), "---\nname: proj\ndescription: p\n---\n");
	const pluginInfo = plugin ? addPlugin(fx, plugin) : undefined;

	const target = join(fx.repo, "target.json");
	writeFileSync(target, '{\n\t"value": "BAD"\n}\n');
	writeFileSync(join(fx.repo, ".mcp.json"), JSON.stringify({ mcpServers: { demo: { command: "echo", args: ["hi"], env: { API_KEY: "sk-supersecretvalue1234567890" } } } }));
	const rules = [
		{ id: "fake-bad", run: () => (readFileSync(target, "utf8").includes("BAD") ? [{ id: "fake-bad", severity: "warning", message: "target.json says BAD", file: target }] : []) },
		{ id: "fake-nofix", run: () => [{ id: "fake-nofix", severity: "info", message: "nothing can repair this", file: target }] },
	];
	const fixes = { "fake-bad": (finding) => ({ ruleId: finding.id, file: finding.file, describe: () => "Replace BAD with GOOD", apply: (text) => text.replace("BAD", "GOOD") }) };
	const doctorOptions = { platform: "linux", env: { PATH: "" }, rules, renames: {}, launchctlGetenv: () => "" };

	const makePaths = (dir) => createPaths({ env: { AGENTRY_HOME: fx.home, CLAUDE_CONFIG_DIR: fx.configDir, AGENTRY_MANAGED_DIR: fx.managedDir }, cwd: dir });
	const finder = createDiscover();
	const props = {
		api: createData({ makePaths, doctorOptions, fixOptions: { fixes }, ...(catalogRepo ? { catalogOptions: { repo: catalogRepo } } : {}) }),
		startDir: fx.repo,
		recents: createRecents(makePaths(fx.repo)),
		discover: (roots) => finder.find(roots, { depth: 2 }),
		env,
		spawn,
		clipboard,
		...(fit ? {} : { size }),
	};
	const app = render(React.createElement(App, props));

	const until = async (pattern, what = String(pattern)) => {
		for (let tries = 0; tries < 100; tries++) {
			if (pattern.test(app.lastFrame() ?? "") || pattern.test(stripAnsi(app.lastFrame() ?? "")) || pattern.test(squash(app.lastFrame() ?? ""))) {
				return app.lastFrame();
			}
			await wait(20);
		}
		assert.fail(`never saw ${what}; last frame:\n${app.lastFrame()}`);
	};
	// Tabs mount once data arrives and Ink subscribes to stdin in an effect after the frame; keys sent sooner are lost.
	const ready = async () => {
		await until(/Shelf\s+Skills/);
		await wait(60);
	};
	const press = async (...keys) => {
		for (const key of keys) {
			app.stdin.write(key);
			await wait(30);
		}
	};
	// Presses up or down until the highlighted row (the line starting with ">") matches.
	const moveTo = async (pattern, key = KEYS.down) => {
		const selected = () => stripAnsi(app.lastFrame() ?? "").split("\n").find((line) => /^>/.test(line)) ?? "";
		for (let tries = 0; tries < 30 && !pattern.test(selected()); tries++) {
			await press(key);
		}
		assert.match(selected(), pattern, `could not select ${pattern}; last frame:\n${app.lastFrame()}`);
	};
	// Resizes the fake terminal (columns and rows, as Ink and the app see them) and waits for the redraw.
	const resize = async (cols, rows) => {
		Object.defineProperty(app.stdout, "columns", { value: cols, configurable: true });
		Object.defineProperty(app.stdout, "rows", { value: rows, configurable: true });
		app.stdout.emit("resize");
		await wait(120);
	};
	const stop = () => {
		app.unmount();
		fx.cleanup();
	};
	return { fx, plugin: pluginInfo, target, app, until, ready, press, moveTo, resize, stop, frame: () => app.lastFrame(), exists: existsSync };
};
