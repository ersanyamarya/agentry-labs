import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentry = (dir, args, options = {}) =>
	spawnSync(process.execPath, [join(dir, "bin/agentry.mjs"), ...args], { encoding: "utf8", ...options });

test("help runs without node_modules, so Ink and React are never loaded for it", () => {
	const copy = mkdtempSync(join(tmpdir(), "agentry-no-deps-"));
	try {
		for (const entry of ["bin", "lib", "package.json"]) {
			cpSync(join(root, entry), join(copy, entry), { recursive: true });
		}
		for (const args of [["--help"], ["--version"], ["shelf", "list"]]) {
			const result = agentry(copy, args);
			assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
		}
	} finally {
		rmSync(copy, { recursive: true, force: true });
	}
});

test("no arguments without a terminal prints help and exits 0", () => {
	const result = agentry(root, []);
	assert.equal(result.status, 0);
	assert.match(result.stdout, /Usage: agentry <command>/);
});

test("ui without a terminal refuses instead of rendering", () => {
	const result = agentry(root, ["ui"]);
	assert.equal(result.status, 2);
	assert.match(result.stderr, /needs an interactive terminal/);
});
