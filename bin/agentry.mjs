#!/usr/bin/env node
// agentry: shows and manages what a Claude Code session loads. Run `agentry --help`.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createPaths } from "../lib/paths.mjs";
import { createShelf } from "../lib/shelf.mjs";

const USAGE = `Usage: agentry <command> [options]

Commands:
  shelf list                    List shelf groups and whether each is on
  shelf on <group> [--global]   Link a group's skills and agents into this project (or ~/.claude)
  shelf off <group> [--global]  Remove those links
  help                          Show this help

Options:
  -h, --help       Show this help
      --version    Print the version

Examples:
  agentry shelf list
  agentry shelf on video
  agentry shelf off video --global`;

const SHELF_USAGE = "Usage: agentry shelf list | on <group> [--global] | off <group> [--global]";

const usageError = (message) => {
	console.error(`${message}\n\n${USAGE}`);
	return 2;
};

const runShelf = (args, global) => {
	const [action, group] = args;
	const shelf = createShelf(createPaths());
	if (action === "list") {
		return shelf.list();
	}
	if ((action === "on" || action === "off") && group) {
		return shelf[action](group, { global });
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
			options: { help: { type: "boolean", short: "h" }, version: { type: "boolean" }, global: { type: "boolean" } },
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
		return runShelf(rest, values.global);
	}
	return usageError(`Unknown command: ${command}`);
};

process.exitCode = main(process.argv.slice(2));
