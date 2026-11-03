#!/usr/bin/env node
// agentry: shows and manages what a Claude Code session loads. Run `agentry --help`.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createPaths } from "../lib/paths.mjs";
import { createShelf } from "../lib/shelf.mjs";

const USAGE = `Usage: agentry <command> [options]

Commands:
  shelf list                          List shelf groups and whether each is on
  shelf status [--json]               Show what is on in this project and globally, plus broken links
  shelf on <target>... [--global]     Link groups or skills into this project (or ~/.claude)
  shelf off <target>... [--global]    Remove those links
  shelf shelve <skill> <group>        Move ~/.claude/skills/<skill> onto the shelf
  shelf unshelve <skill>              Move a shelved skill back to ~/.claude/skills
  help                                Show this help

A target is a group (video), group/skill (video/ffmpeg-install) or a skill name that is unique across groups.

Options:
  -h, --help       Show this help
      --version    Print the version

Examples:
  agentry shelf list
  agentry shelf on video audit/review
  agentry shelf status --json
  agentry shelf off video --global`;

const SHELF_USAGE = "Usage: agentry shelf list | status [--json] | on <target>... [--global] | off <target>... [--global] | shelve <skill> <group> | unshelve <skill>";

const usageError = (message) => {
	console.error(`${message}\n\n${USAGE}`);
	return 2;
};

const runShelf = (args, { global, json }) => {
	const [action, ...rest] = args;
	const shelf = createShelf(createPaths());
	if (action === "list") {
		return shelf.list();
	}
	if (action === "status") {
		return shelf.status({ json });
	}
	if ((action === "on" || action === "off") && rest.length > 0) {
		return shelf[action](rest, { global });
	}
	if (action === "shelve" && rest.length === 2) {
		return shelf.shelve(...rest);
	}
	if (action === "unshelve" && rest.length === 1) {
		return shelf.unshelve(rest[0]);
	}
	console.error(SHELF_USAGE);
	return 2;
};

const main = (argv) => {
	let parsed;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: { help: { type: "boolean", short: "h" }, version: { type: "boolean" }, global: { type: "boolean" }, json: { type: "boolean" } },
		});
	} catch (error) {
		return usageError(error.message);
	}
	const {
		values,
		positionals: [command, ...rest],
	} = parsed;

	if (values.version) {
		console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
		return 0;
	}
	if (values.help || !command || command === "help") {
		console.log(USAGE);
		return 0;
	}
	if (command === "shelf") {
		return runShelf(rest, values);
	}
	return usageError(`Unknown command: ${command}`);
};

process.exitCode = main(process.argv.slice(2));
