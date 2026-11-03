#!/usr/bin/env node
// agentry: shows and manages what a Claude Code session loads. Run `agentry --help`.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createDoctor } from "../lib/doctor.mjs";
import { createFix } from "../lib/fix.mjs";
import { createPaths } from "../lib/paths.mjs";
import { createScan } from "../lib/scan.mjs";
import { createShelf } from "../lib/shelf.mjs";
import { createStatus } from "../lib/status.mjs";

const USAGE = `Usage: agentry <command> [options]

Commands:
  status [path] [--json]              Show the skills, MCP servers, hooks and plugins a session in a folder loads,
                                      with source files and token estimates (unmeasurable parts say "not measured")
  doctor [path] [--json]              Find duplicates, broken references, unset env-var placeholders and stale names in
                                      the setup a session in a folder loads; exit 1 only if there are errors
  scan [roots...] [--depth N]         Status and doctor for every git repo and worktree under the roots (default: this
                                      folder): counts, token estimate and findings per repo, sorted by findings;
                                      user-level findings are shown once. Results are cached until a config file changes
  fix [path] [--dry-run] [--yes]      Preview doctor's automatic fixes as a diff per file (secrets masked), ask, back
                                      each file up under ~/.claude/backups/agentry/<time>/, write, then re-run doctor
                                      to confirm each finding is gone. Without a terminal it only previews unless --yes
  shelf list                          List shelf groups, their token cost and whether each is on
  shelf status [--json]               Show what is on in this project and globally, plus broken links
  shelf on <target>... [--global]     Link groups or skills into this project (or ~/.claude)
  shelf off <target>... [--global]    Remove those links
  shelf off --all [--global]          Remove every shelf link in this project (or ~/.claude)
  shelf shelve <skill> <group>        Move ~/.claude/skills/<skill> onto the shelf
  shelf unshelve <skill>              Move a shelved skill back to ~/.claude/skills
  help                                Show this help

A target is a group (video), group/skill (video/ffmpeg-install) or a skill name that is unique across groups.

Options:
  -h, --help       Show this help
      --version    Print the version
      --json       With status, doctor, scan or shelf status: machine-readable output
      --depth N    With scan: how many folder levels below each root to search for repos (default 4)
      --only-problems  With scan: list only repos with findings
      --no-cache   With scan: ignore and do not write the scan cache (~/.claude/cache/agentry)
      --all        With shelf off: every shelf link instead of named targets
      --dry-run    With shelf: print the links and exclude lines a write would change. With fix: show the
                   preview only. Either way nothing is written
  -y, --yes        With fix: apply without asking (for scripts); exit 1 if a fix or its verification fails

Examples:
  agentry shelf list
  agentry shelf on video audit/review
  agentry shelf status --json
  agentry shelf off video --global
  agentry shelf on audit --dry-run
  agentry shelf off --all
  agentry status
  agentry status ~/ws/my-repo --json
  agentry doctor
  agentry doctor ~/ws/my-repo --json
  agentry scan ~/ws --only-problems
  agentry scan ~/ws ~/other --depth 3 --json
  agentry fix --dry-run
  agentry fix ~/ws/my-repo --yes`;

const SHELF_USAGE =
	"Usage: agentry shelf list | status [--json] | on <target>... [--global] [--dry-run] | off <target>... [--global] [--dry-run] | off --all [--global] [--dry-run] | shelve <skill> <group> [--dry-run] | unshelve <skill> [--dry-run]";

const usageError = (message) => {
	console.error(`${message}\n\n${USAGE}`);
	return 2;
};

const runShelf = (args, { global, json, all, "dry-run": dryRun }) => {
	const [action, ...rest] = args;
	const shelf = createShelf(createPaths());
	if (action === "list") {
		return shelf.list();
	}
	if (action === "status") {
		return shelf.status({ json });
	}
	if (action === "off" && all && rest.length === 0) {
		return shelf.offAll({ global, dryRun });
	}
	if ((action === "on" || action === "off") && rest.length > 0 && !all) {
		return shelf[action](rest, { global, dryRun });
	}
	if (action === "shelve" && rest.length === 2) {
		return shelf.shelve(rest[0], rest[1], { dryRun });
	}
	if (action === "unshelve" && rest.length === 1) {
		return shelf.unshelve(rest[0], { dryRun });
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
			options: {
				help: { type: "boolean", short: "h" },
				version: { type: "boolean" },
				global: { type: "boolean" },
				json: { type: "boolean" },
				all: { type: "boolean" },
				depth: { type: "string" },
				"only-problems": { type: "boolean" },
				"no-cache": { type: "boolean" },
				"dry-run": { type: "boolean" },
				yes: { type: "boolean", short: "y" },
			},
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
	if (command === "status") {
		if (rest.length > 1) {
			return usageError("Usage: agentry status [path] [--json]");
		}
		return createStatus(createPaths()).run({ path: rest[0], json: values.json });
	}
	if (command === "doctor") {
		if (rest.length > 1) {
			return usageError("Usage: agentry doctor [path] [--json]");
		}
		return createDoctor(createPaths()).run({ path: rest[0], json: values.json });
	}
	if (command === "scan") {
		const depth = values.depth === undefined ? 4 : Number(values.depth);
		if (!Number.isInteger(depth) || depth < 0) {
			return usageError("--depth needs a whole number of 0 or more");
		}
		return createScan(createPaths({ memoize: true })).run({ roots: rest, depth, json: values.json, onlyProblems: values["only-problems"], cache: !values["no-cache"] });
	}
	if (command === "fix") {
		if (rest.length > 1 || values.json) {
			return usageError("Usage: agentry fix [path] [--dry-run] [--yes]");
		}
		if (values.yes && values["dry-run"]) {
			return usageError("--yes and --dry-run cannot be used together");
		}
		return createFix(createPaths()).run({ path: rest[0], yes: values.yes, dryRun: values["dry-run"] });
	}
	if (command === "shelf") {
		return runShelf(rest, values);
	}
	return usageError(`Unknown command: ${command}`);
};

process.exitCode = await main(process.argv.slice(2));
