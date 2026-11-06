#!/usr/bin/env node
// agentry: shows and manages what a Claude Code session loads. Run `agentry --help`.

import { parseArgs } from "node:util";
import { createBackups } from "../lib/backups.js";
import { createCatalog } from "../lib/catalog.js";
import { createDoctor } from "../lib/doctor.js";
import { createFix } from "../lib/fix.js";
import { createFixUndo } from "../lib/fix-undo.js";
import type { HookAction } from "../lib/hook-toggle.js";
import { createHookToggle } from "../lib/hook-toggle.js";
import { createMcpEdit } from "../lib/mcp-edit.js";
import { createMcpToggle } from "../lib/mcp-toggle.js";
import { createPaths } from "../lib/paths.js";
import { createPluginInstall } from "../lib/plugin-install.js";
import { createPluginToggle } from "../lib/plugin-toggle.js";
import { createRules } from "../lib/rules.js";
import { createScan } from "../lib/scan.js";
import { createShelf } from "../lib/shelf.js";
import { createStatus } from "../lib/status.js";
import { packageVersion } from "../lib/version.js";

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
  scan [roots...] --find-skill <name> [--global] [--json]
                                      List every repo and worktree under the roots with .claude/skills/<name>,
                                      marking the ones git tracks; --global adds ~/.claude/skills/<name>
  scan [roots...] --remove-skill <name> [--global] [--no-backup] [--dry-run] [--yes]
                                      Delete that folder from each of them (previewed; no copy kept; shelf links are
                                      skipped). --global also deletes ~/.claude/skills/<name>, keeping a copy under
                                      ~/.claude/backups/agentry/removed/ unless --no-backup. Without a terminal it
                                      only previews unless --yes
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
  plugin install <name>@<marketplace> [--scope user|project|local] [--dry-run] [--yes]
  plugin uninstall <name> [--scope user|project|local] [--dry-run] [--yes]
                                      Run claude plugin install|uninstall (the marketplace must already be added to
                                      claude). Previewed, the scope's settings file backed up first. fix --undo
                                      restores that file only; undo an install with uninstall and the reverse
  mcp disable|enable <name> [--dry-run] [--yes]   (plugin, project and local servers: off for this project only)
                                      Park a user-scope MCP server (save its config, then claude mcp remove) or add
                                      it back (claude mcp add-json) from the parked copy. Previewed with secrets
                                      masked, ~/.claude.json backed up first, undo with fix --undo. Other scopes are
                                      refused. Parked configs hold secrets in <config>/agentry/parked-mcp.json (0600)
  mcp remove <name> [--dry-run] [--yes]
                                      Delete a user, local or project (.mcp.json) server for good, or a parked copy.
  mcp list-parked                     List the parked servers (names and masked summaries only)
  mcp add <name> (--command C [--arg=A]... [--env K=V]... | --url U [--header K:V]...) [--scope user|project] [--dry-run] [--yes]
                                      Add a server: user scope runs claude mcp add-json, project scope edits .mcp.json.
                                      Never overwrites a name; secrets masked in the preview. Write --arg=-y with = when
                                      the value starts with a dash
  mcp set <name> [--env K=V]... [--unset-env K]... [--arg=A]... [--dry-run] [--yes]
                                      Change env and args of a user-scope server (a text edit of ~/.claude.json,
                                      backed up, undoable). --arg replaces the whole args list
  hook list [--json]                  List every hook with its id (hash of event + matcher + command), scope and state,
                                      plus hooks that were turned off
  hook disable|enable|remove <id> [--scope user|project|local] [--dry-run] [--yes]
                                      Turn a settings hook off (parked in <config>/agentry/parked-hooks.json, 0600) and
                                      back on, or delete it. Previewed as a diff, backed up, undoable with fix --undo.
                                      Plugin hooks are refused: they belong to the plugin
  ui                                  Open the terminal UI (needs a terminal)
  shelf list                          List shelf groups, their token cost and whether each is on
  shelf status [--json]               Show what is on in this project and globally, plus broken links
  shelf on <target>... [--global]     Link groups or skills into this project (or ~/.claude)
  shelf off <target>... [--global]    Remove those links
  shelf off --all [--global]          Remove every shelf link in this project (or ~/.claude)
  shelf shelve <skill> <group>        Move ~/.claude/skills/<skill> onto the shelf
  shelf unshelve <skill>              Move a shelved skill back to ~/.claude/skills
  shelf promote <skill> [--dry-run]   Move .claude/skills/<skill> of this project to ~/.claude/skills (every project)
  shelf demote <skill> [--dry-run]    Move ~/.claude/skills/<skill> into this project's .claude/skills
                                      (real folders only, never overwrites, no copy kept: it is a move)
  shelf remove <skill> [--project] [--no-backup]
                                      Delete a shelved skill or ~/.claude/skills/<skill> (--project: .claude/skills/<skill> here), keeping a copy under
                                      ~/.claude/backups/agentry/removed/<time>/ unless --no-backup (refuses while it is linked)
  backups list [--json]               List the fix backup sets and the removed-skill copies with size and age
  backups restore <id> [--dry-run]    Move a removed skill's copy back where it came from (never overwrites)
  backups delete <id>... [--dry-run] [--yes]
  backups prune --older-than <days> | --all [--kind fix|removed|updated] [--dry-run] [--yes]
                                      Delete backups for good: previewed, then asked (or --yes). Deleting a fix set
                                      that is not undone ends fix --undo for it
  catalog refresh                     Fetch the agentry-labs skill catalog (shallow git clone, cached)
  catalog list [--json]               List the catalog's skills, agents, rules, CLAUDE.md files and MCP servers (kind/name),
                                      with where each is installed and "outdated" when the installed copy differs
  catalog add <item>... [--group G] [--project] [--dry-run] [--yes]
                                      Install from the catalog; never overwrites. A skill goes onto the shelf (default group:
                                      its bundle), off; an agent to ~/.claude/agents (--project: .claude/agents); a rule to
                                      ~/.claude/rules; a CLAUDE.md file to this project as CLAUDE.md (refused when it has
                                      one); an MCP server through mcp add (user scope, --project: .mcp.json; --yes skips
                                      its question). Items are kind/name (agent/super-planner); a bare name works if unique
  catalog update <item>... | --all [--dry-run] [--yes]
                                      Replace outdated installed skills, agents, rules and CLAUDE.md files with the catalog's
                                      copy: lists each file it overwrites or adds, saves the current copy under
                                      ~/.claude/backups/agentry/updated/, then asks (or --yes). An MCP server (user scope) gets
                                      the catalog's args and any env key it lacks, through mcp set (masked, backed up, undoable).
                                      Without a terminal it only previews unless --yes
  catalog remove agent/<name>... [--project] [--no-backup] [--dry-run] [--yes]
                                      Remove an installed agent (~/.claude/agents, or --project: .claude/agents), keeping a copy
                                      under ~/.claude/backups/agentry/removed/ unless --no-backup; previews, then asks (or --yes)
  rules list [--json]                 List the CLAUDE.md and rule files loaded for this project and the user, with tokens
  rules remove <file> [--dry-run] [--no-backup]
                                      Delete one of them (label as list shows it, a path, or a unique file name), keeping a copy
                                      under ~/.claude/backups/agentry/removed/ unless --no-backup
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
      --all        With shelf off: every shelf link instead of named targets. With catalog update: every outdated item
      --dry-run    With shelf: print the links and exclude lines (or the move) a write would change. With fix: show the
                   preview only. Either way nothing is written
      --no-backup  With shelf remove, rules remove or scan --remove-skill --global: keep no copy of the deleted file
      --project    With shelf remove: the project's skill folder. With catalog add: agents and MCP servers go to this project
      --older-than N  With backups prune: backups at least N days old
      --kind K        With backups prune: only fix, removed or updated backups
      --find-skill N, --remove-skill N  With scan: look for or delete .claude/skills/N in every repo found
      --scope S    With plugin: settings scope to edit (user, project, local); default: the scope that decides today.
                   With hook: which settings file when the id is in several. With mcp add: user (default) or project
      --command C, --url U, --arg A, --env K=V, --unset-env K, --header K:V  With mcp add or set: the server's config
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
  agentry plugin install demo@market --scope project --dry-run
  agentry plugin uninstall demo --yes
  agentry shelf promote my-skill --dry-run
  agentry shelf demote my-skill
  agentry mcp disable context7 --dry-run
  agentry mcp enable context7 --yes
  agentry mcp add files --command npx --arg=-y --arg @scope/files-server --env FILES_TOKEN=abc --dry-run
  agentry mcp add docs --url https://example.com/mcp --header "Authorization: Bearer abc" --scope project --yes
  agentry mcp set files --env FILES_TOKEN=new --dry-run
  agentry hook list
  agentry hook disable 1a2b3c4d --dry-run
  agentry hook enable 1a2b3c4d --yes
  agentry scan ~/ws --find-skill old-skill
  agentry scan ~/ws --remove-skill old-skill --dry-run
  agentry backups list
  agentry backups prune --older-than 30 --dry-run
  agentry shelf remove old-skill --no-backup --dry-run
  agentry catalog add agent/super-planner --dry-run
  agentry catalog update --all --dry-run
  agentry rules list
  agentry fix --undo --list
  agentry fix --undo --yes`;

const SHELF_USAGE =
  "Usage: agentry shelf list | status [--json] | on <target>... [--global] [--dry-run] | off <target>... [--global] [--dry-run] | off --all [--global] [--dry-run] | shelve <skill> <group> [--dry-run] | unshelve <skill> [--dry-run] | promote <skill> [--dry-run] | demote <skill> [--dry-run] | remove <skill> [--project] [--no-backup] [--dry-run]";

const parseCli = (argv: string[]) =>
  parseArgs({
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
      "no-backup": { type: "boolean" },
      "older-than": { type: "string" },
      kind: { type: "string" },
      "find-skill": { type: "string" },
      "remove-skill": { type: "string" },
      group: { type: "string" },
      command: { type: "string" },
      url: { type: "string" },
      arg: { type: "string", multiple: true },
      env: { type: "string", multiple: true },
      "unset-env": { type: "string", multiple: true },
      header: { type: "string", multiple: true },
    },
  });

type Values = ReturnType<typeof parseCli>["values"];

const isHookAction = (action: string): action is HookAction =>
  ["disable", "enable", "remove"].includes(action);

const usageError = (message: string): number => {
  console.error(`${message}\n\n${USAGE}`);
  return 2;
};

const runShelf = (
  args: string[],
  {
    global,
    json,
    all,
    project,
    "no-backup": noBackup,
    "dry-run": dryRun,
  }: Values
): number => {
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
  if ((action === "promote" || action === "demote") && rest.length === 1) {
    return shelf[action](rest[0], { dryRun });
  }
  if (action === "remove" && rest.length === 1) {
    return shelf.remove(rest[0], { dryRun, project, backup: !noBackup });
  }
  console.error(SHELF_USAGE);
  return 2;
};

const runBackups = async (
  args: string[],
  { json, all, "older-than": olderThan, kind, "dry-run": dryRun, yes }: Values
): Promise<number> => {
  const [action, ...rest] = args;
  const backups = createBackups(createPaths());
  if (yes && dryRun) {
    return usageError("--yes and --dry-run cannot be used together");
  }
  if (action === "list" && rest.length === 0) {
    return backups.list({ json });
  }
  if (action === "restore" && rest.length === 1) {
    return backups.restore(rest[0], { dryRun });
  }
  if (action === "delete" && rest.length > 0) {
    return backups.prune({ ids: rest, dryRun, yes });
  }
  if (
    action === "prune" &&
    rest.length === 0 &&
    Boolean(all) !== (olderThan !== undefined)
  ) {
    const days = olderThan === undefined ? undefined : Number(olderThan);
    if (
      olderThan !== undefined &&
      !(Number.isFinite(days) && (days as number) >= 0)
    ) {
      return usageError("--older-than needs a number of days (0 or more)");
    }
    return backups.prune({ olderThan: days, all, kind, dryRun, yes });
  }
  return usageError(
    "Usage: agentry backups list [--json] | restore <id> [--dry-run] | delete <id>... [--dry-run] [--yes] | prune (--older-than <days> | --all) [--kind fix|removed|updated] [--dry-run] [--yes]"
  );
};

const runCatalog = async (
  args: string[],
  {
    group,
    json,
    project,
    all,
    yes,
    "dry-run": dryRun,
    "no-backup": noBackup,
  }: Values
): Promise<number> => {
  const [action, ...rest] = args;
  const catalog = createCatalog(createPaths());
  if (action === "refresh" && rest.length === 0) {
    return catalog.refresh();
  }
  if (action === "list" && rest.length === 0) {
    return catalog.list({ json });
  }
  if (yes && dryRun) {
    return usageError("--yes and --dry-run cannot be used together");
  }
  if (action === "add" && rest.length > 0) {
    return catalog.add(rest, { group, project, dryRun, yes });
  }
  if (action === "update" && (all ? rest.length === 0 : rest.length > 0)) {
    return catalog.update(rest, { all, dryRun, yes });
  }
  if (action === "remove" && rest.length > 0) {
    return catalog.remove(rest, { project, dryRun, yes, backup: !noBackup });
  }
  return usageError(
    "Usage: agentry catalog refresh | list [--json] | add <item>... [--group G] [--project] [--dry-run] [--yes] | update <item>... | --all [--dry-run] [--yes] | remove agent/<name>... [--project] [--no-backup] [--dry-run] [--yes]"
  );
};

const runRules = (
  args: string[],
  { json, "dry-run": dryRun, "no-backup": noBackup }: Values
): number => {
  const [action, target] = args;
  const rules = createRules(createPaths());
  if (action === "list" && args.length === 1) {
    return rules.list({ json });
  }
  if (action === "remove" && target && args.length === 2) {
    return rules.remove(target, { dryRun, backup: !noBackup });
  }
  return usageError(
    "Usage: agentry rules list [--json] | remove <file> [--dry-run] [--no-backup]"
  );
};

// Ink and React load here, on demand, so no other command pays for them.
// Chalk (inside Ink) picks its colour level once, when it loads, from TERM, COLORTERM and FORCE_COLOR, and never reads
// NO_COLOR. A terminal that leaves TERM unset (some app-embedded terminals) would get level 0 and no colour at all, so on a
// TTY we ask for the basic 16 colours unless the user opted out (NO_COLOR, FORCE_COLOR, TERM=dumb).
const preferColor = (): void => {
  const { env } = process;
  if (
    process.stdout.isTTY &&
    !env.NO_COLOR &&
    !("FORCE_COLOR" in env) &&
    env.TERM !== "dumb"
  ) {
    env.FORCE_COLOR = "1";
  }
};

const runUi = async (): Promise<number> => {
  preferColor();
  const { run } = await import("../tui/index.js");
  return run({
    io: {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    },
  });
};

const main = (argv: string[]): number | Promise<number> => {
  let parsed: ReturnType<typeof parseCli>;
  try {
    parsed = parseCli(argv);
  } catch (error) {
    return usageError((error as Error).message);
  }
  const {
    values,
    positionals: [command, ...rest],
  } = parsed;

  if (values.version) {
    console.log(packageVersion());
    return 0;
  }
  if (
    !(command || values.help) &&
    process.stdin.isTTY &&
    process.stdout.isTTY
  ) {
    return runUi();
  }
  if (values.help || !command || command === "help") {
    console.log(USAGE);
    return 0;
  }
  if (command === "ui") {
    return runUi();
  }
  if (command === "status") {
    if (rest.length > 1) {
      return usageError("Usage: agentry status [path] [--json]");
    }
    return createStatus(createPaths()).run({
      path: rest[0],
      json: values.json,
    });
  }
  if (command === "doctor") {
    if (rest.length > 1) {
      return usageError("Usage: agentry doctor [path] [--json]");
    }
    return createDoctor(createPaths()).run({
      path: rest[0],
      json: values.json,
    });
  }
  if (command === "scan") {
    const depth = values.depth === undefined ? 4 : Number(values.depth);
    if (!Number.isInteger(depth) || depth < 0) {
      return usageError("--depth needs a whole number of 0 or more");
    }
    const [findName, removeName] = [
      values["find-skill"],
      values["remove-skill"],
    ];
    if (
      (findName !== undefined && (removeName !== undefined || values.fix)) ||
      (removeName !== undefined && values.fix)
    ) {
      return usageError("Use one of --fix, --find-skill and --remove-skill");
    }
    if (findName !== undefined || removeName !== undefined) {
      const scan = createScan(createPaths({ memoize: true }));
      if (findName !== undefined) {
        return values.yes || values["dry-run"]
          ? usageError(
              "--find-skill only lists; --yes and --dry-run go with --remove-skill"
            )
          : scan.runFindSkill({
              roots: rest,
              depth,
              name: findName,
              json: values.json,
              global: values.global,
            });
      }
      if (values.json) {
        return usageError("--remove-skill takes no --json");
      }
      if (values.yes && values["dry-run"]) {
        return usageError("--yes and --dry-run cannot be used together");
      }
      return scan.runRemoveSkill({
        roots: rest,
        depth,
        name: removeName,
        yes: values.yes,
        dryRun: values["dry-run"],
        global: values.global,
        backup: !values["no-backup"],
      });
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
      return createScan(createPaths({ memoize: true })).runFix({
        roots: rest,
        depth,
        yes: values.yes,
        dryRun: values["dry-run"],
        cache: !values["no-cache"],
      });
    }
    return createScan(createPaths({ memoize: true })).run({
      roots: rest,
      depth,
      json: values.json,
      onlyProblems: values["only-problems"],
      cache: !values["no-cache"],
    });
  }
  if (command === "fix" && values.undo) {
    const usage =
      "Usage: agentry fix --undo [timestamp] [--list] [--yes] [--dry-run] [--force]";
    if (rest.length > 1 || values.json || (values.list && rest.length > 0)) {
      return usageError(usage);
    }
    if (values.yes && values["dry-run"]) {
      return usageError("--yes and --dry-run cannot be used together");
    }
    return createFixUndo(createPaths()).run({
      timestamp: rest[0],
      list: values.list,
      yes: values.yes,
      dryRun: values["dry-run"],
      force: values.force,
    });
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
    return createFix(createPaths()).run({
      path: rest[0],
      yes: values.yes,
      dryRun: values["dry-run"],
    });
  }
  if (command === "plugin") {
    const [action, name] = rest;
    if (
      !(
        ["enable", "disable", "install", "uninstall"].includes(action) && name
      ) ||
      rest.length > 2 ||
      values.json
    ) {
      return usageError(
        "Usage: agentry plugin enable|disable|install|uninstall <name> [--scope user|project|local] [--dry-run] [--yes]"
      );
    }
    if (values.yes && values["dry-run"]) {
      return usageError("--yes and --dry-run cannot be used together");
    }
    if (action === "install" || action === "uninstall") {
      return createPluginInstall(createPaths()).run({
        action,
        name,
        scope: values.scope,
        yes: values.yes,
        dryRun: values["dry-run"],
      });
    }
    return createPluginToggle(createPaths()).run({
      name,
      enable: action === "enable",
      scope: values.scope,
      yes: values.yes,
      dryRun: values["dry-run"],
    });
  }
  if (command === "mcp") {
    const [action, name] = rest;
    if (values.yes && values["dry-run"]) {
      return usageError("--yes and --dry-run cannot be used together");
    }
    if (
      (action === "add" || action === "set") &&
      name &&
      rest.length === 2 &&
      !values.json
    ) {
      const edit = createMcpEdit(createPaths());
      const common = {
        name,
        env: values.env,
        yes: values.yes,
        dryRun: values["dry-run"],
      };
      return action === "add"
        ? edit.add({
            ...common,
            command: values.command,
            url: values.url,
            args: values.arg,
            headers: values.header,
            scope: values.scope,
          })
        : edit.set({
            ...common,
            unsetEnv: values["unset-env"],
            args: values.arg,
          });
    }
    if (action === "list-parked" && rest.length === 1) {
      const parked = createMcpToggle(createPaths()).listParked();
      parked.forEach((entry) =>
        console.log(
          `${entry.name}  parked ${entry.parkedAt ?? ""}  ${entry.summary}`
        )
      );
      return 0;
    }
    if (
      (action !== "enable" && action !== "disable" && action !== "remove") ||
      !name ||
      rest.length > 2 ||
      values.json
    ) {
      return usageError(
        "Usage: agentry mcp disable|enable|remove <name> [--dry-run] [--yes] | agentry mcp add <name> (--command C | --url U) ... | agentry mcp set <name> [--env K=V] ... | agentry mcp list-parked"
      );
    }
    const toggle = createMcpToggle(createPaths());
    return action === "remove"
      ? toggle.remove({ name, yes: values.yes, dryRun: values["dry-run"] })
      : toggle.run({
          name,
          enable: action === "enable",
          yes: values.yes,
          dryRun: values["dry-run"],
        });
  }
  if (command === "hook") {
    const [action, selector] = rest;
    const hooks = createHookToggle(createPaths());
    if (action === "list" && rest.length === 1) {
      return hooks.list({ json: values.json });
    }
    if (!(isHookAction(action) && selector) || rest.length > 2 || values.json) {
      return usageError(
        "Usage: agentry hook list [--json] | agentry hook disable|enable|remove <id> [--scope user|project|local] [--dry-run] [--yes]"
      );
    }
    if (values.yes && values["dry-run"]) {
      return usageError("--yes and --dry-run cannot be used together");
    }
    return hooks.run({
      selector,
      action,
      scope: values.scope,
      yes: values.yes,
      dryRun: values["dry-run"],
    });
  }
  if (command === "shelf") {
    return runShelf(rest, values);
  }
  if (command === "backups") {
    return runBackups(rest, values);
  }
  if (command === "catalog") {
    return runCatalog(rest, values);
  }
  if (command === "rules") {
    return runRules(rest, values);
  }
  return usageError(`Unknown command: ${command}`);
};

process.exitCode = await main(process.argv.slice(2));
