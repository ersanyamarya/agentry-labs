import assert from "node:assert/strict";
import type { Fixture } from "./helpers/fixture.js";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createFixture } from "./helpers/fixture.js";

let fx: Fixture;
beforeEach(() => {
	fx = createFixture();
});
afterEach(() => fx.cleanup());

const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

describe("router", () => {
	test("--help, -h, help and no arguments print usage with examples", () => {
		for (const args of [["--help"], ["-h"], ["help"], []]) {
			const { status, stdout } = fx.run(args);
			assert.equal(status, 0, args.join(" "));
			assert.match(stdout, /^Usage: agentry <command>/);
			assert.match(stdout, /Examples:\n {2}agentry shelf list/);
		}
	});

	test("unknown command prints an error plus usage and exits 2", () => {
		const { status, stderr } = fx.run(["bogus"]);
		assert.equal(status, 2);
		assert.match(stderr, /Unknown command: bogus\n\nUsage: agentry/);
	});

	test("unknown option exits 2", () => {
		assert.equal(fx.run(["--bogus"]).status, 2);
	});

	test("--version prints the package.json version", () => {
		const { status, stdout } = fx.run(["--version"]);
		assert.equal(status, 0);
		assert.equal(stdout, `${version}\n`);
	});

	test("shelf with a missing action or group exits 2", () => {
		assert.equal(fx.run(["shelf"]).status, 2);
		assert.equal(fx.run(["shelf", "on"]).status, 2);
	});
});
