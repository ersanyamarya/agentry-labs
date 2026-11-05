// @ts-nocheck
// Runs the real `agentry ui` in a pseudo-terminal (python3 pty, test/helpers/pty-run.py) and looks at the bytes it writes: colour must be real SGR
// escapes on a TTY, also when TERM is unset, and absent with NO_COLOR. Why colour can go missing: chalk (inside Ink)
// decides its level once at load from TTY-ness, TERM, COLORTERM and FORCE_COLOR, and never reads NO_COLOR.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createFixture } from "./helpers/fixture.js";

const bin = fileURLToPath(new URL("../bin/agentry.mjs", import.meta.url));
const runner = fileURLToPath(new URL("./helpers/pty-run.py", import.meta.url));
const hasPython = spawnSync("python3", ["-c", "import pty"]).status === 0;

let fx;
beforeEach(() => {
	fx = createFixture();
});
afterEach(() => fx.cleanup());

// `env` entries set to undefined are removed (TERM, NO_COLOR...).
const ui = (extra) =>
	new Promise((resolve) => {
		const env = { ...process.env, CLAUDE_CONFIG_DIR: fx.configDir, AGENTRY_HOME: fx.home, AGENTRY_MANAGED_DIR: fx.managedDir, ...extra };
		for (const key of Object.keys(env)) {
			if (env[key] === undefined) {
				delete env[key];
			}
		}
		for (const key of ["NO_COLOR", "FORCE_COLOR", "TERM", "COLORTERM", "TERM_PROGRAM", "CI"]) {
			if (!(key in extra)) {
				delete env[key];
			}
		}
		const child = spawn("python3", [runner, process.execPath, bin, "ui"], { cwd: fx.repo, env });
		let out = "";
		child.stdout.on("data", (data) => (out += data));
		child.on("close", () => resolve(out));
	});

const COLOUR = /\u001B\[(3[0-7]|9[0-7])m/;

describe("colour in a pseudo-terminal", { skip: !hasPython && "needs python3 with pty" }, () => {
	test("TERM=xterm-256color: real SGR colour escapes", async () => {
		const out = await ui({ TERM: "xterm-256color" });
		assert.match(out, /\u001B\[32m/, "green");
		assert.match(out, /\u001B\[90m/, "gray");
	});

	test("TERM unset (as in some embedded terminals): colour still on", async () => {
		assert.match(await ui({}), COLOUR);
	});

	test("NO_COLOR=1: no colour escapes, words still there", async () => {
		const out = await ui({ TERM: "xterm-256color", NO_COLOR: "1" });
		assert.doesNotMatch(out, COLOUR);
		assert.match(out, /● on ○ off ◐ partial/);
	});

	test("TERM=dumb and FORCE_COLOR=0: the user's opt-outs are respected", async () => {
		assert.doesNotMatch(await ui({ TERM: "dumb" }), COLOUR);
		assert.doesNotMatch(await ui({ TERM: "xterm-256color", FORCE_COLOR: "0" }), COLOUR);
	});
});
