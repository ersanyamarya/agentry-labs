// The English text of the terminal UI, the web UI and the core text they show. Every user-facing word comes from `terms`
// (the glossary), so renaming a word is one edit here. A message with a value is a function. Sections are filled in as
// each area moves over from its component.
const terms = {
  // Today's words; the words phase renames them.
  library: "shelf",
  bundle: "group",
  thisProject: "project",
  allProjects: "global",
  loaded: "on",
  notLoaded: "off",
  added: "installed",
  notAdded: "not installed",
};
const {
  library,
  bundle,
  thisProject,
  allProjects,
  loaded,
  notLoaded,
  added,
  notAdded,
} = terms;

export const en = {
  terms,
  // Footer key hints: `<name>` is the text, `<name>Short` the short form shown when the footer is tight.
  keys: {
    openFile: "open file",
    openFileShort: "edit",
    removeCopyKept: "remove (copy kept)",
    removeCopyKeptShort: "remove",
    removeNoCopy: "remove (no copy)",
    removeNoCopyShort: "no copy",
    remove: "remove",
    update: "update",
    footer: { sidebar: "sidebar", help: "help" },
    skills: {
      projectToggle: `${thisProject} ${loaded}/${notLoaded}`,
      projectToggleShort: thisProject,
      globalToggle: `${allProjects} ${loaded}/${notLoaded}`,
      globalToggleShort: allProjects,
      expand: "expand",
      unshelve: "unshelve",
      pluginToggle: "enable/disable plugin",
      pluginToggleShort: `${loaded}/${notLoaded}`,
      shelve: "shelve",
      moveToAll: "move to all projects",
      moveToAllShort: "all projects",
      moveToProject: `move to this ${thisProject} only`,
      moveToProjectShort: `this ${thisProject}`,
    },
    catalog: {
      fetch: "fetch catalog",
      fetchShort: "fetch",
      addToLibrary: `add to ${library}`,
      addAllProjects: "add (all projects)",
      add: "add",
      addToProject: `add to this ${thisProject}`,
      addToProjectShort: thisProject,
      updateCatalog: "update catalog",
    },
    backups: {
      prune: "delete 30+ days old",
      pruneShort: "prune",
      restore: "restore",
      delete: "delete",
    },
    mcp: {
      add: "add server",
      addShort: "add",
      edit: "edit env/args",
      turnOnHere: "turn on here",
      addBack: "add back",
      turnOffHere: "turn off here",
      turnOffSaved: "turn off (saved)",
      on: loaded,
      off: notLoaded,
    },
    hooks: {
      turnOn: "turn on",
      turnOffSaved: "turn off (saved)",
      on: loaded,
      off: notLoaded,
    },
    plugins: {
      toggle: "enable/disable",
      toggleShort: `${loaded}/${notLoaded}`,
      install: "install a plugin",
      installShort: "install",
      uninstall: "uninstall",
    },
    doctor: {
      previewFix: "preview fix",
      previewFixShort: "fix",
      undo: "undo last fix set",
      undoShort: "undo",
    },
  },
  help: {
    title: "Keys (? or esc to close)",
    tab: "move the keys between the sidebar and the list; on the sidebar, ↑ / ↓ pick a section and enter goes back to the list",
    sections:
      "switch section (1-9 follow the sidebar: Skills, MCP, Hooks, Plugins, Rules, Agents, Catalog, Doctor, Backups)",
    rows: "move between rows",
    enter: "details, expand a group, preview a fix",
    space: `Skills: ${library} row ${loaded}/${notLoaded} for this ${thisProject}; plugin rows: ${loaded}/${notLoaded}; MCP, Hooks: turn ${notLoaded} (saved) / add back`,
    addServer: "MCP: add a server (user or project scope)",
    globalToggle: `Skills: ${library} row ${loaded}/${notLoaded} globally`,
    shelve: `Skills: move a ${allProjects} skill onto the ${library}; MCP: edit env/args of a user server`,
    moveToAll: `Skills: move a ${thisProject}-only skill to ~/.claude/skills (all projects)`,
    moveToProject: `Skills: move a ${allProjects} skill into this ${thisProject} only; Catalog: add an agent or MCP server to this ${thisProject} only`,
    unshelve:
      "Skills: unshelve a skill; Doctor: undo the last fix set; Backups: restore a removed skill or updated copy; Catalog: update an outdated item (skill, agent, rule, CLAUDE.md, MCP server)",
    remove: `Skills: remove a skill; Catalog: remove an ${added} skill, agent or rule (a copy is kept in the backups); Rules: remove a file; Backups: delete a backup; MCP, Hooks: remove; Plugins: uninstall`,
    removeNoCopy: "Skills, Catalog, Rules: remove and keep no copy",
    prune: "Backups: delete the backups 30+ days old",
    install: `Catalog: add the selected skill (to the ${library}, ${notLoaded}), agent, rule, CLAUDE.md or MCP server; Plugins: install a plugin`,
    fetch: "Catalog: fetch or update the agentry-labs catalog",
    search:
      "search the rows of the current tab: type, enter keeps it, esc clears it (q and tab are text while typing)",
    mark: "mark or unmark the selected row / clear marks; space, g, x, X, i, u then apply to all marked rows, one preview, one y",
    open: "open the selected row's file in $EDITOR",
    confirm: "confirm or cancel a previewed change; c copies the preview",
    refresh: "refresh",
    switchProject: `switch ${thisProject}`,
    help: "this help",
    quit: "quit",
    legendStates: `● ${loaded} / active green, ○ ${notLoaded} / disabled gray, ◐ partial yellow. Cost: dim < 100, yellow < 500, red 500+.`,
    legendNotes: `* marks a row. Skills > Token total: description tokens per ${allProjects}, this ${thisProject}, plugins. No colour: set NO_COLOR. Plugin changes apply to new sessions (undo: agentry fix --undo).`,
  },
  skills: {
    headers: {
      shelf: "Shelf",
      skills: "Skills",
      cost: "Cost",
      project: "Project",
      global: "Global",
    },
    noGroups: `  (no ${library} ${bundle}s)`,
    noGroupsDetail:
      "Shelved skills live in <config dir>/skill-shelf/<group>/<skill>.",
    count: (n: number) => `${n} skills`,
    agentWord: "agent",
    agentSuffix: " (agent)",
    group: {
      title: (name: string) => `${library} ${bundle}: ${name} (opt-in)`,
      thisProject: (state: string) => `this ${thisProject}: ${state}`,
      allProjects: (state: string) => `${allProjects}: ${state}`,
      contains: (skills: number, agents: number) =>
        `contains: ${skills} skills${agents > 0 ? `, ${agents} agent${agents > 1 ? "s" : ""}` : ""}`,
      cost: (tokens: string) => `cost when ${loaded}: ${tokens} tokens`,
      toggle: `space = this ${thisProject}, g = ${allProjects}; enter expands`,
    },
    item: {
      title: (isSkill: boolean, name: string) =>
        `${isSkill ? "skill" : "agent"}: ${name}`,
      bundle: (name: string) => `${bundle}: ${name}`,
      toggleSkill: `${library} skill (opt-in): space = this ${thisProject}, g = ${allProjects}; u unshelves`,
      toggleAgent: `agents switch with their ${bundle}`,
    },
    detail: {
      skill: (name: string) => `skill: ${name}`,
      scope: (scope: string, plugin?: string) =>
        `scope: ${scope}${plugin ? ` (${plugin})` : ""}`,
      tokensDescription: (tokens: string) => `tokens: ${tokens} (description)`,
      linksTo: (target: string) => `links to: ${target}`,
    },
    whyFixed: {
      project: `${thisProject} skill (this repo's .claude/skills): e opens it, s moves it to the ${library}, a moves it to ~/.claude/skills (all projects)`,
      global: `${allProjects} skill (~/.claude/skills, every project): s moves it to the ${library} (${loaded} per ${thisProject}), o moves it into this ${thisProject} only`,
      broken: "broken skill: see the Doctor tab",
      symlink:
        "global skill is a symlink, not a folder: shelve moves folders only",
    },
    sections: {
      global: "Global skills",
      project: `This ${thisProject} only`,
      plugins: "Plugin skills",
    },
    plugin: {
      skills: (list: string) => `skills: ${list}`,
      toggle: "plugin skill (comes with a plugin): space toggles the plugin",
    },
    total: {
      label: "  Token total (every session)",
      total: (n: number) =>
        `total: ~${n} tokens of skill descriptions loaded in every session`,
      global: (n: number) => `in ${allProjects}: ~${n}`,
      project: (n: number) => `in this ${thisProject}: ~${n}`,
      plugins: (n: number) => `from plugins: ~${n}`,
      note: `counts skills that are ${loaded} (${library} skills under the scope they are linked in); ${notLoaded} skills, MCP, hooks and rule files cost 0 here (rule files: Rules tab).`,
    },
  },
  catalog: {
    toggle: {
      skillInstalled: "x removes it (a copy is kept in the backups)",
      skill: `i copies it onto the ${library}, ${notLoaded}; turn it ${loaded} from the Skills tab`,
      agent: `i copies it to ~/.claude/agents (every project), o to this ${thisProject}'s .claude/agents; never overwrites`,
      rule: "i copies it to ~/.claude/rules; never overwrites",
      claudeMd: `i copies it to this ${thisProject} as CLAUDE.md, only when the ${thisProject} has none`,
      mcp: `i adds it to your user config (claude mcp add-json), o to this ${thisProject}'s .mcp.json; the preview masks secrets`,
      removeSuffix: "; x removes it (a copy is kept in the backups)",
      outdatedMcp:
        "; u sets the catalog's args and any env key you lack (masked preview, backed up, undoable)",
      outdated:
        "; u overwrites the installed copy with the catalog's (previewed, the old copy is saved first)",
    },
    sections: {
      agent: "Agents",
      rule: "Rules",
      claudeMd: "CLAUDE.md files",
      mcp: "MCP servers",
    },
    outdatedPlain: "◐ outdated",
    notInstalledPlain: `○ ${notAdded}`,
    item: {
      bundle: (name: string) => `bundle: ${name}`,
      installed: (outdated: boolean, where: string) =>
        `installed: ${outdated ? "◐" : "●"} ${where}${outdated ? ", outdated" : ""}`,
      notInstalled: `installed: ○ ${notAdded}`,
      outdated: "status: outdated (a file differs from the catalog copy)",
      tokens: (count: string, description: boolean) =>
        `${count} (${description ? "description" : "whole file"})`,
      noDescription: "(no description)",
    },
    notFetched: "  (catalog not fetched)",
    notFetchedDetail: "The agentry-labs catalog is not on this machine yet.",
    notFetchedToggle:
      "press f to fetch it (a shallow git clone of github.com/ersanyamarya/agentry-labs, cached; needs network).",
    bundleHeader: (name: string) => `${name} bundle`,
  },
  mcp: {
    why: {
      plugin: "plugin server: managed by the plugin, switch the plugin instead",
      project:
        "project server (.mcp.json): managed by the repo, approval is in Claude Code",
      local: "local-scope server: this tool only handles user scope",
      desktopConfig: "desktop server: managed by Claude desktop",
      desktopExtension: "desktop extension: managed by Claude desktop",
    },
    columns: { server: "SERVER", transport: "TRANSPORT" },
    detail: {
      server: (name: string) => `server: ${name}`,
      transport: (transport: string) => `transport: ${transport}`,
      target: (isUrl: boolean, target: string) =>
        `${isUrl ? "url" : "command"}: ${target}`,
      env: (key: string, value: string) => `env ${key}=${value}`,
      header: (key: string, value: string) => `header ${key}: ${value}`,
      tokens: "tokens: not measured (tool lists)",
      toggleUser: `space turns it ${notLoaded} (removes it from user scope, config saved), s edits env and args; undo with agentry fix --undo`,
      toggleOther: `space turns it ${notLoaded} for this ${thisProject} only (disabledMcpServers in ~/.claude.json); space again turns it ${loaded}`,
      notManaged: "not managed here",
      parkedState: (badge: string) => `state: ${badge} (config saved)`,
      config: (summary: string) => `config: ${summary}`,
      turnedOff: (when: string) => `turned ${notLoaded}: ${when}`,
      parkedToggle:
        "space adds it back to user scope (claude mcp add-json from the saved copy)",
    },
  },
  hooks: {
    why: "plugin hook: the plugin manages it; turn the plugin off in the Plugins tab",
    columns: { eventMatcher: "EVENT  MATCHER" },
    detail: {
      id: (id: string) => `id: ${id}`,
      event: (event: string) => `event: ${event}`,
      matcher: (matcher: string) => `matcher: ${matcher}`,
      type: (type: string) => `type: ${type}`,
      command: (command: string) => `command: ${command}`,
      output: "output: not measured",
      toggle: `space turns it ${notLoaded} (moved to ~/.claude/agentry/parked-hooks.json), x removes it; undo with agentry fix --undo`,
      parkedState: (badge: string) => `state: ${badge} (saved copy)`,
      turnedOff: (when: string) => `turned ${notLoaded}: ${when}`,
      wasIn: (source: string) => `was in: ${source}`,
      parkedToggle:
        "space puts it back in that settings file, x deletes the saved copy",
    },
  },
  plugins: {
    note: "applies to new sessions",
    columns: { plugin: "PLUGIN", version: "VERSION" },
    detail: {
      plugin: (id: string) => `plugin: ${id}`,
      version: (version: string | undefined) =>
        `version: ${version ?? "unknown"}`,
      skillTokens: (tokens: string) => `skill tokens: ${tokens}`,
      install: (
        scope: string,
        projectPath: string | undefined,
        here: boolean
      ) =>
        `install: ${scope}${projectPath ? ` ${projectPath}` : ""}${here ? "" : ` (other ${thisProject})`}`,
      enabledBy: (source: string) => `enabled by: ${source}`,
      notInstalled: notAdded,
      toggle: (active: boolean) =>
        `space ${active ? "disables" : "enables"} it; x uninstalls it, i installs another`,
    },
  },
  rules: {
    empty: "  (no CLAUDE.md or rule files)",
    emptyDetail:
      "No ~/.claude/CLAUDE.md, ~/.claude/rules/*.md, CLAUDE.md or .claude/rules/*.md was found.",
    emptyNote:
      "the Catalog tab can add a rule (~/.claude/rules) or a CLAUDE.md file.",
    headers: { files: "Files", cost: "Cost", kind: "Kind" },
    kindRule: "rule",
    kindClaudeMd: "CLAUDE.md",
    detail: {
      file: (label: string) => `file: ${label}`,
      kind: (kind: string) => `kind: ${kind}`,
      tokens: (tokens: string) => `${tokens} (whole file)`,
      note: "loaded into every session of this scope; a rule with a paths: header loads only for matching files, which this estimate does not account for.",
      toggle: "x removes it (a copy is kept in the backups)",
    },
  },
  agents: {
    empty: "  (no agents)",
    emptyDetail: "No ~/.claude/agents/*.md or .claude/agents/*.md was found.",
    emptyNote:
      "the Catalog tab can add an agent (~/.claude/agents, or o for this project only).",
    headers: { agents: "Agents", cost: "Cost", model: "Model" },
    detail: {
      agent: (name: string) => `agent: ${name}`,
      description: (text: string) => `description: ${text}`,
      model: (model: string) => `model: ${model}`,
      tools: (tools: string) => `tools: ${tools}`,
      tokens: "(name and description; the body loads when the agent runs)",
      note: "install or remove agents from the Catalog tab; e opens the file.",
    },
  },
  backups: {
    empty: "  (no backups)",
    emptyDetail: "Nothing is kept under ~/.claude/backups/agentry yet.",
    emptyNote:
      "fixes (agentry fix) and skill removals leave a copy here; this tab restores or deletes them.",
    headers: { backup: "BACKUP", kind: "KIND", size: "SIZE", age: "AGE" },
    fixSet: "fix set",
    removed: "removed",
    detail: {
      backup: (id: string) => `backup: ${id}`,
      kind: (kind: string) => `kind: ${kind}`,
      made: (date: string) => `made: ${date}`,
      size: (size: string) => `size: ${size}`,
      from: (from: string) => `from: ${from}`,
      toggleFix: "x deletes it for good",
      toggleFixNotUndone: " (fix --undo can then no longer restore it)",
      toggleRemoved: (restorable: boolean) =>
        `${restorable ? "u moves it back (never overwrites), " : ""}x deletes it for good`,
    },
  },
  doctor: {
    headings: { error: "Errors", warning: "Warnings", info: "Info" },
    detail: {
      finding: (severity: string, id: string) => `${severity}: [${id}]`,
      file: (file: string, line: number | undefined) =>
        `file: ${file}${line ? `:${line}` : ""}`,
      advice: (fix: string) => `advice: ${fix}`,
      noAdvice: "advice: none from doctor",
    },
  },
  sidebar: {
    groups: { library: "LIBRARY", discover: "DISCOVER", health: "HEALTH" },
    tokens: (compact: string) => `${compact} tokens`,
    problems: (n: number) => `${n} problem${n === 1 ? "" : "s"}`,
    noProblems: "no problems",
    helpWide: "? help  tab focus",
    helpNarrow: "? help",
    err: " err",
  },
  flows: {},
  core: {
    scopeNames: { user: allProjects, desktop: "desktop" },
    scopeTitle: { user: "User", project: `This ${thisProject}` },
    columns: { state: "STATE", scope: "SCOPE" },
    detail: {
      scope: (scope: string) => `scope: ${scope}`,
      state: (state: string) => `state: ${state}`,
      tokens: (tokens: string) => `tokens: ${tokens}`,
      source: (source: string) => `source: ${source}`,
      path: (path: string) => `path: ${path}`,
      note: (text: string) => `note: ${text}`,
      toggle: (text: string) => `toggle: ${text}`,
    },
  },
};
