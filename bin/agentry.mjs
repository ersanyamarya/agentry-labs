#!/usr/bin/env node
// agentry: shows and manages what a Claude Code session loads. Run `agentry --help`.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createDoctor } from "../lib/doctor.mjs";
import { createFix } from "../lib/fix.mjs";
import { createFixUndo } from "../lib/fix-undo.mjs";
import { createMcpToggle } from "../lib/mcp-toggle.mjs";
import { createPaths } from "../lib/paths.mjs";
import { createPluginToggle } from "../lib/plugin-toggle.mjs";
import { createScan } from "../lib/scan.mjs";
import { createCatalog } from "../lib/catalog.mjs";
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
  scan [roots...] --fix [--dry-run] [--yes]
                                      Apply doctor's automatic fixes across every repo found: user-level fixes once,
                                      then each repo with findings, previewed and confirmed per repo, with the files
                                      git tracks marked. Backups and undo as for fix. Without a terminal it only
                                      previews unless --yes
  fix [path] [--dry-run] [--yes]      Preview doctor's automatic fixes as a diff per file (secrets masked), ask, back
                                      each file up under ~/.claude/backups/agentry/<time>/, write, then re-run doctor
                                      to confirm each finding is gone. Without a terminal it only previews unless --yes
  fix --undo [timestamp]              Restore the files from a backup set (the newest by default) and list what changed;
                                      a file edited since the fix is skipped unless --force
  fix --undo --list                   List the backup sets with their status and file count; changes nothing
  plugin enable|disable <name> [--scope user|project|local] [--dry-run] [--yes]
                                      Switch a plugin on or off by editing enabledPlugins in the settings file that
                                      decides it (or --scope's): previewed as a diff, backed up, undoable with fix
                                      --undo. Refuses when managed settings or a higher scope win. New sessions only
  mcp disable|enable <name> [--dry-run] [--yes]   (plugin, project and local servers: off for this project only)
                                      Park a user-scope MCP server (save its config, then claude mcp remove) or add
                                      it back (claude mcp add-json) from the parked copy. Previewed with secrets
                                      masked, ~/.claude.json backed up first, undo with fix --undo. Other scopes are
                                      refused. Parked configs hold secrets in <config>/agentry/parked-mcp.json (0600)
  mcp remove <name> [--dry-run] [--yes]
                                      Delete a user, local or project (.mcp.json) server for good, or a parked copy.
  mcp list-parked                     List the parked servers (names and masked summaries only)
  ui                                  Open the terminal UI (needs a terminal)
  shelf list                          List shelf groups, their token cost and whether each is on
  shelf status [--json]               Show what is on in this project and globally, plus broken links
  shelf on <target>... [--global]     Link groups or skills into this project (or ~/.claude)
  shelf off <target>... [--global]    Remove those links
  shelf off --all [--global]          Remove every shelf link in this project (or ~/.claude)
  shelf shelve <skill> <group>        Move ~/.claude/skills/<skill> onto the shelf
  shelf unshelve <skill>              Move a shelved skill back to ~/.claude/skills
  shelf remove <skill> [--project]    Delete a shelved skill or ~/.claude/skills/<skill> (--project: .claude/skills/<skill> here), keeping a copy under
                                      ~/.claude/backups/agentry/removed/<time>/ (refuses while it is linked)
  catalog refresh                     Fetch the agentry-labs skill catalog (shallow git clone, cached)
  catalog list [--json]               List the catalog's skills by bundle, with where each is installed
  catalog add <skill>... [--group G] [--dry-run]
                                      Copy skills from the catalog onto the shelf (default group: the skill's bundle),
                                      off until you turn them on. Never overwrites
  help                                Show this help

A target is a group (video), group/skill (video/ffmpeg-install) or a skill name that is unique across groups.

Options:
  -h, --help       Show this help
      --version    Print the version
      --json       With status, doctor, scan or shelf status: machine-readable output
      --depth N    With scan: how many folder levels below each root to search for repos (default 4)
      --only-problems  With scan: list only repos with findings
      --fix        With scan: apply the fixes instead of listing findings (see above)
      --no-cache   With scan: ignore and do not write the scan cache (~/.claude/cache/agentry)
      --all        With shelf off: every shelf link instead of named targets
      --dry-run    With shelf: print the links and exclude lines a write would change. With fix: show the
                   preview only. Either way nothing is written
      --scope S    With plugin: settings scope to edit (user, project, local); default: the scope that decides today
  -y, --yes        With fix or plugin: apply without asking (for scripts); exit 1 if a fix or its verification fails
      --undo       With fix: undo a backup set instead of fixing (see above)
      --list       With fix --undo: list the backup sets only
      --force      With fix --undo: overwrite files that changed since the fix wrote them

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
  agentry scan ~/ws --fix --dry-run
  agentry scan ~/ws --fix
  agentry fix --dry-run
  agentry fix ~/ws/my-repo --yes
  agentry plugin disable context-mode --dry-run
  agentry plugin enable demo@market --scope user --yes
  agentry mcp disable context7 --dry-run
  agentry mcp enable context7 --yes
  agentry fix --undo --list
  agentry fix --undo --yes`;

const SHELF_USAGE =
	"Usage: agentry shelf list | status [--json] | on <target>... [--global] [--dry-run] | off <target>... [--global] [--dry-run] | off --all [--global] [--dry-run] | shelve <skill> <group> [--dry-run] | unshelve <skill> [--dry-run] | remove <skill> [--project] [--dry-run]";

const usageError = (message) => {
	console.error(`${message}\n\n${USAGE}`);
	return 2;
};

const runShelf = (args, { global, json, all, project, "dry-run": dryRun }) => {
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
	if (action === "remove" && rest.length === 1) {
		return shelf.remove(rest[0], { dryRun, project });
	}
	console.error(SHELF_USAGE);
	return 2;
};

const runCatalog = async (args, { group, json, "dry-run": dryRun }) => {
	const [action, ...rest] = args;
	const catalog = createCatalog(createPaths());
	if (action === "refresh" && rest.length === 0) {
		return catalog.refresh();
	}
	if (action === "list" && rest.length === 0) {
		return catalog.list({ json });
	}
	if (action === "add" && rest.length > 0) {
		return catalog.add(rest, { group, dryRun });
	}
	console.error("Usage: agentry catalog refresh | list [--json] | add <skill>... [--group G] [--dry-run]");
	return 2;
};

// Ink and React load here, on demand, so no other command pays for them.
// Chalk (inside Ink) picks its colour level once, when it loads, from TERM, COLORTERM and FORCE_COLOR, and never reads
// NO_COLOR. A terminal that leaves TERM unset (some app-embedded terminals) would get level 0 and no colour at all, so on a
// TTY we ask for the basic 16 colours unless the user opted out (NO_COLOR, FORCE_COLOR, TERM=dumb).
const preferColor = () => {
	const { env } = process;
	if (process.stdout.isTTY && !env.NO_COLOR && !("FORCE_COLOR" in env) && env.TERM !== "dumb") {
		env.FORCE_COLOR = "1";
	}
};

const runUi = async (argv) => {
	preferColor();
	const { run } = await import("../tui/index.mjs");
	return run({ argv, paths: createPaths(), io: { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr } });
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
				project: { type: "boolean" },
				yes: { type: "boolean", short: "y" },
				undo: { type: "boolean" },
				list: { type: "boolean" },
				force: { type: "boolean" },
				fix: { type: "boolean" },
				scope: { type: "string" },
				group: { type: "string" },
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
	if (!command && !values.help && process.stdin.isTTY && process.stdout.isTTY) {
		return runUi(rest);
	}
	if (values.help || !command || command === "help") {
		console.log(USAGE);
		return 0;
	}
	if (command === "ui") {
		return runUi(rest);
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
		if ((values.yes || values["dry-run"]) && !values.fix) {
			return usageError("--yes and --dry-run go with scan --fix");
		}
		if (values.fix) {
			if (values.json || values["only-problems"]) {
				return usageError("scan --fix takes no --json or --only-problems");
			}
			if (values.yes && values["dry-run"]) {
				return usageError("--yes and --dry-run cannot be used together");
			}
			return createScan(createPaths({ memoize: true })).runFix({ roots: rest, depth, yes: values.yes, dryRun: values["dry-run"], cache: !values["no-cache"] });
		}
		return createScan(createPaths({ memoize: true })).run({ roots: rest, depth, json: values.json, onlyProblems: values["only-problems"], cache: !values["no-cache"] });
	}
	if (command === "fix" && values.undo) {
		const usage = "Usage: agentry fix --undo [timestamp] [--list] [--yes] [--dry-run] [--force]";
		if (rest.length > 1 || values.json || (values.list && rest.length > 0)) {
			return usageError(usage);
		}
		if (values.yes && values["dry-run"]) {
			return usageError("--yes and --dry-run cannot be used together");
		}
		return createFixUndo(createPaths()).run({ timestamp: rest[0], list: values.list, yes: values.yes, dryRun: values["dry-run"], force: values.force });
	}
	if (command === "fix") {
		if (values.list || values.force) {
			return usageError("--list and --force go with fix --undo");
		}
		if (rest.length > 1 || values.json) {
			return usageError("Usage: agentry fix [path] [--dry-run] [--yes]");
		}
		if (values.yes && values["dry-run"]) {
			return usageError("--yes and --dry-run cannot be used together");
		}
		return createFix(createPaths()).run({ path: rest[0], yes: values.yes, dryRun: values["dry-run"] });
	}
	if (command === "plugin") {
		const [action, name] = rest;
		if ((action !== "enable" && action !== "disable") || !name || rest.length > 2 || values.json) {
			return usageError("Usage: agentry plugin enable|disable <name> [--scope user|project|local] [--dry-run] [--yes]");
		}
		if (values.yes && values["dry-run"]) {
			return usageError("--yes and --dry-run cannot be used together");
		}
		return createPluginToggle(createPaths()).run({ name, enable: action === "enable", scope: values.scope, yes: values.yes, dryRun: values["dry-run"] });
	}
	if (command === "mcp") {
		const [action, name] = rest;
		if (action === "list-parked" && rest.length === 1) {
			const parked = createMcpToggle(createPaths()).listParked();
			parked.forEach((entry) => console.log(`${entry.name}  parked ${entry.parkedAt ?? ""}  ${entry.summary}`));
			return 0;
		}
		if ((action !== "enable" && action !== "disable" && action !== "remove") || !name || rest.length > 2 || values.json) {
			return usageError("Usage: agentry mcp disable|enable|remove <name> [--dry-run] [--yes] | agentry mcp list-parked");
		}
		if (values.yes && values["dry-run"]) {
			return usageError("--yes and --dry-run cannot be used together");
		}
		const toggle = createMcpToggle(createPaths());
		return action === "remove" ? toggle.remove({ name, yes: values.yes, dryRun: values["dry-run"] }) : toggle.run({ name, enable: action === "enable", yes: values.yes, dryRun: values["dry-run"] });
	}
	if (command === "shelf") {
		return runShelf(rest, values);
	}
	if (command === "catalog") {
		return runCatalog(rest, values);
	}
	return usageError(`Unknown command: ${command}`);
};

process.exitCode = await main(process.argv.slice(2));
