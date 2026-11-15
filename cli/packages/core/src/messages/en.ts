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
// Said after most changes; the preview already told the user what is written.
const appliesUndo = "Applies to new sessions; undo with agentry fix --undo";
// "group" as a sentence-start plural ("Groups:"), so the glossary word still drives it.
const capital = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
const appliesNewSessions = "Applies to sessions started after this.";
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

// Text only the web UI shows; what it shares with the terminal UI is read from the sections above in the components.
const web = {
  common: {
    cancel: "Cancel",
    remove: "Remove",
    clear: "Clear",
    done: "Done.",
    failed: "Failed.",
    all: "All",
    scope: "Scope",
    cost: "Cost",
    path: "Path",
    model: "Model",
    on: "On",
    off: "Off",
    state: "State",
    turnOn: `Turn ${loaded}`,
    turnOff: `Turn ${notLoaded}`,
    scopeGlobal: allProjects,
    scopeProject: thisProject,
    noSelection: (what: string) => `Select ${what} to see its details.`,
  },
  skills: {
    scope: {
      plugin: "Plugin",
      globalAndProject: "Global + project",
    },
    tokensNotMeasured: "tokens not measured",
    tokens: (n: number) => `~${n} tokens`,
    installedAlwaysOn: (name: string) =>
      `${name} is installed, so it is always on. Shelve it to turn it off.`,
    bulkFailed: (label: string, ok: number, failed: number, names: string) =>
      `${label}: ${ok} done, ${failed} failed (${names})`,
    bulkDone: (label: string, ok: number) => `${label}: ${ok} done`,
    turnOn: `Turn ${loaded}`,
    turnOff: `Turn ${notLoaded}`,
    turnedOn: `Turned ${loaded}`,
    turnedOff: `Turned ${notLoaded}`,
    shelved: "Shelved",
    removed: "Removed",
    path: "Path",
    cost: "Cost",
    group: "Group",
    state: "State",
    brokenLink: "broken link",
    shelve: "Shelve",
    unshelve: "Unshelve",
    onlyThisProject: `Only this ${thisProject}`,
    allProjects: "All projects",
    note: (configDir: string | undefined, backupsDir: string | undefined) =>
      `Changes apply to ${configDir ?? "~/.claude"} or this ${thisProject}. Every removal keeps a copy under ${backupsDir ?? "the backups folder"} that Backups can restore.`,
    addFromCatalog: "Add from catalog",
    columns: { on: "On", name: "Name", group: "Group", scope: "Scope" },
    turnAria: (name: string, currentlyOn: boolean) =>
      `Turn ${name} ${currentlyOn ? notLoaded : loaded}`,
    turnGroupAria: (name: string, currentlyOn: boolean) =>
      `Turn group ${name} ${currentlyOn ? notLoaded : loaded}`,
    detailsLabel: "Skill details",
    selectOne: "a skill",
    emptyNone: "No skills yet. Add one from the catalog.",
    emptyNoMatch: "No skills match.",
    filters: { all: "All", on: "On" },
    hint: "↑↓ move · space toggle · m mark · a mark all · s shelve · x remove · / search",
    searchPlaceholder: "Search skills",
    summary: (all: number, on: number, shelf: number) =>
      `${all} skills · ${on} on · ${shelf} on the shelf`,
    title: "Skills",
    groupsAria: "Shelf groups",
    groups: "Groups",
    bulkAria: "Bulk actions",
    selected: (n: number) => `${n} selected`,
    count: (n: number) => `${n} skills`,
    shelveTitle: (what: string) => `Shelve ${what}`,
    shelveDescription: `The skill moves to the ${library}, ${notLoaded}. Pick an existing ${bundle} or type a new name.`,
    shelveGroupAria: "Shelf group",
    groupPlaceholder: "Group name",
    removeTitle: (what: string) => `Remove ${what}?`,
    removeDescription: (
      what: string,
      single: boolean,
      backupsDir: string | undefined
    ) =>
      `This deletes ${what}. A copy${single ? "" : " of each"} is kept under ${backupsDir ?? ""}, and Backups can restore it.`,
    folders: (n: number) => `${n} skill folders`,
  },
  catalog: {
    all: "All",
    update: "Update",
    add: "Add",
    install: "Install",
    installed: "Installed",
    title: (action: string, name: string) => `${action} ${name}`,
    note: `Skills go to the ${library}, ${notLoaded}. An update keeps a copy of the old one in the backups.`,
    removeAgentTitle: (name: string) => `Remove agent ${name}`,
    heading: "Catalog",
    summary: (n: number) =>
      `${n} items from agentry-labs, ready to install into this ${thisProject} or globally`,
    notFetched: "Not fetched yet.",
    refresh: "Refresh",
    fetch: "Fetch the catalog",
    search: "Search the catalog",
    bundleAria: "Bundle",
    tokens: (n: number) => ` · ~${n} tokens`,
    nothing: "Nothing matches.",
  },
  agents: {
    agent: "Agent",
    description: "Description",
    tools: "Tools",
    listingCost: "Listing cost",
    tokens: (n: number) => `~${n} tokens`,
    note: "Cost is the name and description Claude lists; the body loads when the agent runs. Add or remove agents from Catalog.",
    selectOne: "an agent",
    detailsLabel: "Agent details",
    empty: "No agents installed.",
    hint: "↑↓ move · / search",
    searchPlaceholder: "Search agents",
    summary: (n: number) => `${n} agents`,
    title: "Agents",
  },
  rules: {
    file: "File",
    kind: "Kind",
    size: "Size",
    title: "Title",
    removeTitle: (label: string) => `Remove ${label}`,
    copyKept: (backupsDir: string | undefined) =>
      `A copy is kept under ${backupsDir ?? "the backups folder"}, and Backups can restore it.`,
    note: "Removing keeps a copy in the backups.",
    selectOne: "a file",
    detailsLabel: "Rule details",
    empty: "No CLAUDE.md or rule files.",
    hint: "↑↓ move · x remove · / search",
    searchPlaceholder: "Search rules",
    summary: (n: number) => `${n} files`,
    heading: "Rules",
  },
  hooks: {
    pluginHook: (source: string) =>
      `This hook comes from ${source}. It belongs to its plugin: change it there.`,
    nothingToApply: "Nothing to apply.",
    title: (action: string, id: string, event: string) =>
      `${action} hook ${id}: ${event}`,
    note: "A backup of the settings file is made first, and agentry fix --undo restores it.",
    turnAria: (event: string, currentlyOn: boolean) =>
      `Turn hook ${event} ${currentlyOn ? notLoaded : loaded}`,
    hook: "Hook",
    event: "Event",
    matcher: "Matcher",
    allMatchers: "(all)",
    command: "Command",
    source: "Source",
    detailsNote: "Tokens and keys in commands are masked.",
    heading: (id: string) => `hook ${id}`,
    selectOne: "a hook",
    detailsLabel: "Hook details",
    empty: "No hooks.",
    hint: `↑↓ move · space ${notLoaded}/${loaded} · x remove · / search`,
    searchPlaceholder: "Search hooks",
    summary: (n: number, on: number) => `${n} hooks · ${on} on`,
    pageTitle: "Hooks",
  },
  plugins: {
    note: "Plugin changes apply to new sessions (undo: agentry fix --undo).",
    uninstall: "Uninstall",
    installTitle: (name: string) => `Install ${name}`,
    uninstallTitle: (id: string) => `Uninstall ${id}`,
    turnTitle: (action: string, id: string) => `${action} ${id}`,
    installPlugin: "Install plugin",
    turnAria: (id: string, currentlyOn: boolean) =>
      `Turn ${id} ${currentlyOn ? notLoaded : loaded}`,
    plugin: "Plugin",
    version: (version: string) => ` · ${version}`,
    cellTokens: (n: number) => ` · ~${n} tokens`,
    id: "Id",
    versionLabel: "Version",
    skills: "Skills",
    skillTokens: (n: number) => `~${n} tokens`,
    turnedOnBy: `Turned ${loaded} by`,
    selectOne: "a plugin",
    detailsLabel: "Plugin details",
    empty: "No plugins.",
    hint: `↑↓ move · space ${notLoaded}/${loaded} · i install · x uninstall · / search`,
    searchPlaceholder: "Search plugins",
    summary: (n: number, on: number) => `${n} plugins · ${on} on`,
    title: "Plugins",
    dialogTitle: "Install a plugin",
    dialogDescription: "Use name@marketplace. You will see a preview first.",
    namePlaceholder: "name@marketplace",
    preview: "Preview",
  },
  backups: {
    fixBackup:
      "Fix backups are undone from Doctor (Undo last fix), not restored here.",
    note: "Deleted backups cannot be restored.",
    deleteTitle: (name: string) => `Delete backup ${name}`,
    pruneLabel: (days: number) => `Delete ${days}+ days old`,
    backup: "Backup",
    kind: "Kind",
    size: "Size",
    age: "Age",
    delete: "Delete",
    item: "Item",
    taken: "Taken",
    takenValue: (date: string, age: string) => `${date} (${age})`,
    from: "From",
    copy: "Copy",
    selectOne: "a backup",
    detailsLabel: "Backup details",
    empty: (backupsDir: string | undefined) =>
      `Nothing is kept under ${backupsDir ?? "the backups folder"} yet.`,
    filters: { removed: "Removed", updated: "Updated", fix: "Fixes" },
    hint: "↑↓ move · u restore · x delete · d delete 30+ days old · / search",
    searchPlaceholder: "Search backups",
    summary: (n: number) => `${n} backups`,
    title: "Backups",
  },
  doctor: {
    severity: { error: "Error", warning: "Warning", info: "Info" },
    plural: (label: string) => `${label}s`,
    fixTitle: (message: string) => `Fix: ${message}`,
    fixNote: "A backup is made first, and Undo last fix restores it.",
    undoTitle: "Undo the last fix set",
    heading: "Doctor",
    noProblems: "No problems found.",
    findings: (n: number) =>
      `${n} findings in ~/.claude and this ${thisProject}`,
    undo: "Undo last fix",
    noFix: "No automatic fix. Change it by hand.",
    fixIt: "Fix it",
  },
  mcp: {
    parkedSource: "parked in agentry's config",
    managedElsewhere: (name: string, source: string) =>
      `${name} is managed in ${source}. Only user-scope servers can be turned off here.`,
    turnTitle: (enable: boolean, name: string) =>
      `${enable ? "Add back" : "Turn off"} ${name}`,
    removeTitle: (name: string) => `Remove ${name}`,
    removeNote: "A backup of ~/.claude.json is made first.",
    addTitle: (name: string) => `Add ${name}`,
    editTitle: (name: string) => `Edit ${name}`,
    addServer: "Add server",
    turnAria: (name: string, currentlyOn: boolean) =>
      `Turn ${name} ${currentlyOn ? notLoaded : loaded}`,
    server: "Server",
    addBack: "Add back",
    edit: "Edit",
    transport: "Transport",
    command: "Command",
    env: "Env",
    source: "Source",
    note: "Secrets stay masked here. Turning a server off keeps its config under agentry's folder, so it can be added back.",
    selectOne: "a server",
    detailsLabel: "Server details",
    empty: "No MCP servers.",
    hint: `↑↓ move · space ${notLoaded}/${loaded} · a add · x remove · / search`,
    searchPlaceholder: "Search servers",
    summary: (n: number, on: number) => `${n} servers · ${on} on`,
    title: "MCP",
    dialogAddTitle: "Add an MCP server",
    dialogAddDescription:
      "A command server (command, args, env) or a URL server. You will see a preview with secrets masked.",
    dialogEditDescription:
      "Env lines are K=V pairs to add or change. Args replace the current ones when filled in.",
    fieldName: "Name",
    fieldCommand: "Command",
    fieldUrl: "or URL",
    fieldArgs: "Args",
    fieldEnv: "Env (one K=V per line)",
    fieldHeaders: "Headers (one K: V per line, for a URL server)",
    placeholderName: "my-server",
    placeholderCommand: "npx",
    placeholderUrl: "https://…",
    placeholderArgs: "-y my-package",
    placeholderEnv: "API_KEY=…",
    preview: "Preview",
  },
  sidebar: {
    label: "Sections",
    groups: { library: "Library", discover: "Discover", health: "Health" },
    sections: {
      skills: "Skills",
      mcp: "MCP",
      hooks: "Hooks",
      plugins: "Plugins",
      rules: "Rules",
      agents: "Agents",
      catalog: "Catalog",
      doctor: "Doctor",
      backups: "Backups",
    },
    scope: "Scope",
    scopeAria: "Scope for toggles",
    scopeGlobal: "Global",
    scopeProject: `This ${thisProject}`,
    shortcutsAria: "Keyboard shortcuts",
  },
  list: {
    filterAria: "Filter",
    selectAllAria: "Select all shown",
    selectAria: (label: string) => `Select ${label}`,
  },
  help: {
    keys: [
      ["↑ ↓", "move between rows"],
      [
        "space",
        "turn the selected row on or off, in the scope chosen in the sidebar",
      ],
      ["s", `move a skill onto the ${library}`],
      ["x", "remove the selected row (a copy is kept in the backups)"],
      ["/", "search the rows"],
      ["?", "this help"],
    ] as [string, string][],
    title: "Keyboard shortcuts",
    description:
      "The same keys as the terminal UI. They are text while you type in a field.",
  },
  preview: {
    title: (title: string | undefined) => `${title} (preview)`,
    description: "Nothing is written until you apply.",
    loading: "Loading the preview...",
    cancel: "Cancel",
    apply: "Apply",
  },
  // WEB-INSERT
};

export const en = {
  terms,
  web,
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
    notices: {
      badGroupName: (name: string) =>
        `Not a usable ${bundle} name: "${name}" (no slash, no leading dot, not "agents")`,
      shelvePreviewTitle: "Shelve preview (dry run)",
      shelved: (skill: string, name: string) =>
        `Shelved ${skill} into ${name}; it is ${notLoaded}, toggle it with space.`,
      newGroupTitle: (skill: string) => `Shelve ${skill}: new ${bundle}`,
      newGroupLabel: "Group name",
      newGroupIntro: `Type the name of the new ${library} ${bundle}.`,
      chooseTitle: (skill: string) => `Shelve ${skill}: choose a ${bundle}`,
      chooseIntro: (skill: string) =>
        `Move ${skill} onto the ${library} in which ${bundle}?`,
      unshelvePreviewTitle: "Unshelve preview (dry run)",
      unshelved: (target: string) =>
        `Unshelved ${target} into ~/.claude/skills.`,
      agentsSwitch: `Agents switch with their ${bundle}: toggle the ${bundle} row.`,
      markedNotSwitchable: `Marked rows are not ${library} ${bundle}s or skills: nothing to switch.`,
      whereGlobal: "globally",
      whereProject: `for this ${thisProject}`,
      turnTitle: (on: boolean, where: string) =>
        `Turn ${on ? loaded : notLoaded} ${where}`,
      link: (on: boolean, target: string | undefined, where: string) =>
        `${on ? "Link" : "Unlink"} ${target} ${where}.`,
      turned: (on: boolean, where: string) =>
        `Turned ${on ? loaded : notLoaded} ${where}`,
      markedNotRemovable: `Marked rows cannot be removed here (shelved, ${allProjects} or ${thisProject}-only skills only).`,
      alreadyShelved: `Already on the ${library}; press u to move it back to ~/.claude/skills.`,
      shelveHint: `s shelves a ${allProjects} or ${thisProject}-only skill: select one under Global skills or This ${thisProject} only.`,
      unshelveHint: `u unshelves a shelved skill: expand a ${bundle} and select one.`,
      removeHint: `x removes a shelved, ${allProjects} or ${thisProject}-only skill folder (X keeps no copy): select one.`,
      moveToAllHint: `a moves a ${thisProject}-only skill to ~/.claude/skills (all projects): select one under This ${thisProject} only.`,
      moveToProjectHint: `o moves a ${allProjects} skill into this ${thisProject} only: select one under Global skills.`,
      projectLabel: (skill: string | undefined) => `${skill} (${thisProject})`,
      globalLabel: (skill: string | undefined) => `${skill} (${allProjects})`,
    },
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
    notices: {
      added: {
        skill: `to the ${library}, ${notLoaded}. Turn it ${loaded} from the Skills tab`,
        agent: "as an agent",
        rule: "to ~/.claude/rules",
        claudeMd: `as this ${thisProject}'s CLAUDE.md`,
        mcp: "as an MCP server. It applies to sessions started after this",
      },
      outdatedCount: (n: number) => `${n} outdated (u updates)`,
      fetching: "Fetching the catalog...",
      addSkillTitle: (name: string) =>
        `Add ${name} to the ${library} (preview)`,
      addTitle: (item: string | undefined, project: boolean) =>
        `Add ${item}${project ? ` to this ${thisProject}` : ""} (preview)`,
      addDone: (name: string, where: string | undefined) =>
        `Added ${name} ${where}.`,
      updateTitle: (item: string | undefined) => `Update ${item} (preview)`,
      updateDone: (item: string | undefined) =>
        `Updated ${item}; the old copy is in ~/.claude/backups/agentry/updated/.`,
      bulkTitle: (title: string, n: number) => `${title} ${n} (preview)`,
      bulkAdd: "Add",
      bulkUpdate: "Update",
      bulkAddDone:
        "Added the marked items (agents and MCP servers to all projects).",
      bulkUpdateDone:
        "Updated the marked items; the old copies are in ~/.claude/backups/agentry/updated/.",
      removeUnsupported:
        "x removes a skill, agent or rule here; remove an MCP server from the MCP tab, CLAUDE.md from the Rules tab.",
      notInstalled: (item: string | undefined) => `${item} is ${notAdded}.`,
      alreadyInstalled: (item: string | undefined, where: string) =>
        `${item} is already ${added} (${where}).`,
      projectOnlyHint: `o adds an agent or an MCP server to this ${thisProject} only; use i for this item.`,
      upToDate: (item: string | undefined) => `${item} is up to date.`,
    },
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
    notices: {
      removeFiles: "Remove files",
      selectFile: "Select a file first.",
    },
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
    notices: {
      restoreTitle: (label: string | undefined) => `Restore ${label}`,
      restored: "Restored; it is back in its original folder.",
      restore: "Restore",
      restoredMany: "Restored; they are back in their original folders",
      deleteMany: (n: number) => `Delete ${n} backup${n === 1 ? "" : "s"}`,
      deletedMany: "Deleted those backups.",
      restoreHint:
        "u restores a removed skill: select one that has a known original folder.",
      deleteOne: (label: string) => `Delete ${label}`,
      deletedOne: "Deleted that backup.",
      selectBackup: "Select a backup first.",
      pruneTitle: (days: number) => `Delete backups ${days}+ days old`,
      pruned: (days: number) => `Deleted the backups ${days}+ days old.`,
    },
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
    flow: {
      undone: "Undone.",
      fixApplied: "Fix applied and verified.",
      cancelled: "Cancelled; nothing written.",
      undoFailed: "Undo",
      fixFailed: (id: string) => `Fix [${id}]`,
      undoTitle: "Undo preview",
      fixTitle: "Fix preview (dry run)",
      details: "Details",
      errors: (n: number) => `${n} errors`,
      warnings: (n: number) => `${n} warnings`,
      info: (n: number) => `${n} info`,
    },
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
  flows: {
    previewNote: "Preview only; nothing is written until you press y.",
    cancelled: "Cancelled; nothing changed.",
    working: "Working...",
    finishedWithErrors: "Finished with errors; see the output on the right.",
    failed: (title: string) => `✖ ${title} failed`,
    preview: (title: string) => `${title} (preview)`,
    resultTitle: "Result (c = copy)",
    resultErrorsTitle: "Result (errors, c = copy)",
    pickKeysNew: `↑/↓ choose, enter select, n new ${bundle}, esc cancel`,
    pickKeys: "↑/↓ choose, enter select, esc cancel",
    nameKeys: "enter confirm, esc cancel",
    applyPrompt: "Apply?  y yes   n no   c copy",
    restorePrompt: "Restore?  y yes   n no   c copy",
    nothingToApply: "Nothing can be applied here. n = close, c = copy",
    refreshed: "Refreshed.",
    loading: "Loading...",
    warning: (message: string | undefined) => `warning: ${message}`,
    pickerTitle: "Project (enter select, esc close)",
    removeSkills: "Remove skills",
    removedMany: (backup: boolean) =>
      backup
        ? "Removed; copies are in ~/.claude/backups/agentry/removed/"
        : "Removed; no copies were kept",
    bulk: {
      title: (title: string, todo: number, total: number) =>
        `${title}: ${todo} of ${total} (preview)`,
      nothing: "(nothing to do)",
      skipped: "\n(skipped: cannot be applied)",
      done: (done: string, n: number) =>
        `${done} (${n} item${n === 1 ? "" : "s"}).`,
    },
    move: {
      title: (promote: boolean, skill: string) =>
        `${promote ? "Move to all projects" : `Move to this ${thisProject} only`}: ${skill} (preview)`,
      done: (promote: boolean, skill: string) =>
        promote
          ? `${skill} now lives in ~/.claude/skills and loads in every project.`
          : `${skill} now lives in this ${thisProject}'s .claude/skills only.`,
    },
    remove: {
      title: (label: string | undefined) => `Remove ${label} (preview)`,
      done: (label: string | undefined, backup: boolean) =>
        backup
          ? `Removed ${label}; a copy is in ~/.claude/backups/agentry/removed/ (Backups tab restores it).`
          : `Removed ${label}; no copy was kept.`,
    },
    hook: {
      toggleTitle: (off: boolean, hook: string | undefined) =>
        `${off ? `Turn ${loaded}` : `Turn ${notLoaded}`} hook ${hook}`,
      toggled: (hook: string | undefined, off: boolean) =>
        `Hook ${hook} is ${off ? `back ${loaded}` : `${notLoaded} (saved)`}. ${appliesUndo}.`,
      removeTitle: (hook: string | undefined) => `Remove hook ${hook}`,
      removed: (hook: string | undefined) =>
        `Hook ${hook} is removed. ${appliesUndo}.`,
    },
    plugin: {
      toggleTitle: (enable: boolean, plugin: string) =>
        `${enable ? "Enable" : "Disable"} ${plugin} (preview)`,
      toggled: (plugin: string, enable: boolean) =>
        `${plugin} ${enable ? "enabled" : "disabled"}. ${appliesUndo}.`,
      installTitle: (install: boolean, name: string, scope: string) =>
        `${install ? "Install" : "Uninstall"} ${name} at ${scope} scope (preview)`,
      installDone: (name: string, install: boolean, scope: string) =>
        `${name} is ${install ? "installed" : "uninstalled"} at ${scope} scope. Applies to new sessions.`,
      formTitle: "Install plugin",
      formLabel: "Plugin (name@marketplace)",
      formIntro:
        "The marketplace must already be added to claude (claude plugin marketplace add).",
      badId: "Type it as name@marketplace, e.g. demo@market.",
      scopeTitle: (name: string) => `Install ${name}: scope`,
      scopeIntro: "Where should it be installed?",
      uninstallScopeTitle: (name: string) => `Uninstall ${name}: scope`,
      uninstallScopeIntro: "Installed at several scopes here; which one?",
    },
    mcp: {
      toggleTitle: (enable: boolean, name: string) =>
        `${enable ? "Add back" : "Turn off"} ${name} (preview)`,
      toggled: (name: string, enable: boolean) =>
        `${name} ${enable ? "is back in user scope" : `is turned ${notLoaded}`}. ${appliesUndo}.`,
      removeTitle: (name: string) => `Remove ${name} (preview)`,
      removed: (name: string) => `${name} is removed. ${appliesUndo}.`,
      add: {
        nameTitle: "Add MCP server",
        nameLabel: "Server name",
        nameIntro: "Letters, digits, . _ : - only.",
        badName: "Not a valid name: use letters, digits and . _ : - only.",
        typeTitle: (name: string) => `Add ${name}: type`,
        typeIntro: "How does the server run?",
        typeOptions: ["command (stdio)", "url (http)"],
        commandTitle: (name: string) => `Add ${name}: command`,
        commandLabel: "Command and args",
        commandIntro: "Space separated, e.g. npx -y @scope/server",
        envTitle: (name: string) => `Add ${name}: env`,
        envLabel: "Env (KEY=VALUE ...)",
        envIntro:
          "Space separated; values are hidden as you type. Blank for none.",
        needCommand: "A command is needed.",
        urlTitle: (name: string) => `Add ${name}: url`,
        urlLabel: "URL",
        urlIntro: "https://...",
        headersTitle: (name: string) => `Add ${name}: headers`,
        headersLabel: "Headers (Name: value; ...)",
        headersIntro:
          "Separated by ';'; values are hidden as you type. Blank for none.",
        badUrl: "The URL must start with http:// or https://.",
        scopeTitle: (name: string) => `Add ${name}: scope`,
        scopeIntro: "Where should the server live?",
        scopeOptions: [
          "user (claude mcp add-json, every project)",
          "project (this repo's .mcp.json)",
        ],
        previewTitle: (name: string) => `Add ${name} (preview)`,
        done: (name: string) => `${name} is added. ${appliesUndo}.`,
      },
      set: {
        envTitle: (name: string) => `Edit ${name}: env`,
        envLabel: "Env changes",
        envIntro:
          "KEY=VALUE sets, -KEY removes; space separated; values hidden as you type. Blank keeps env.",
        argsTitle: (name: string) => `Edit ${name}: args`,
        argsLabel: "New args",
        argsIntro:
          "Replaces the whole args list, space separated. Blank keeps args.",
        previewTitle: (name: string) => `Edit ${name} (preview)`,
        done: (name: string) => `${name} is updated. ${appliesUndo}.`,
      },
    },
    inventory: {
      nothing: "Nothing to switch or remove on this row.",
      notOneScope:
        "Not installed at exactly one scope here: uninstall it on its own.",
      removeOrUninstall: "Remove or uninstall",
      switch: "Switch",
      removedDone: `Removed. ${appliesUndo}`,
      switchedDone: `Switched. ${appliesUndo}`,
      notInstalledHere: `Not installed for this ${thisProject}: nothing to uninstall here.`,
    },
  },
  core: {
    scopeNames: { user: allProjects, desktop: "desktop" },
    scopeTitle: { user: "User", project: `This ${thisProject}` },
    columns: { state: "STATE", scope: "SCOPE" },
    // Detail-line labels whose value is drawn in its state colour.
    stateLabels: ["state", `this ${thisProject}`, allProjects],
    detail: {
      scope: (scope: string) => `scope: ${scope}`,
      state: (state: string) => `state: ${state}`,
      tokens: (tokens: string) => `tokens: ${tokens}`,
      source: (source: string) => `source: ${source}`,
      path: (path: string) => `path: ${path}`,
      note: (text: string) => `note: ${text}`,
      toggle: (text: string) => `toggle: ${text}`,
    },
    refused: (reason: string) => `refused: ${reason}`,
    scopeOneOf: (scopes: string) => `--scope must be one of ${scopes}`,
    pluginMatchesSeveral: (name: string, ids: string) =>
      `"${name}" matches several plugins: ${ids}. Use name@marketplace.`,
    appliesNote: appliesNewSessions,
    shelf: {
      skipTaken: (name: string, link: string) =>
        `skip ${name}: ${link} already exists and is not a ${library} link`,
      noGroup: (target: string, dir: string, groups: string) =>
        `No ${bundle} "${target}" in ${dir}. ${capital(bundle)}s: ${groups || "none"}`,
      noSkillInGroup: (skill: string, group: string, dir: string) =>
        `No skill "${skill}" in ${bundle} "${group}" of ${dir}`,
      severalGroups: (skill: string, groups: string) =>
        `"${skill}" is in several ${bundle}s: ${groups}. Use ${bundle}/skill.`,
      agentCount: (count: number) => `, ${count} agent${count > 1 ? "s" : ""}`,
      listLine: (
        name: string,
        skills: number,
        agentNote: string,
        tokens: number,
        state: string
      ) =>
        `${name.padEnd(16)} ${String(skills).padStart(3)} skills${agentNote}  ~${tokens} tokens  ${state}`,
      linkLine: (link: string, source: string) => `link ${link} -> ${source}`,
      unlinkLine: (link: string) => `unlink ${link}`,
      excludeLine: (sign: string, entry: string) => `exclude ${sign} ${entry}`,
      changed: (
        label: string,
        command: string,
        base: string,
        count: number,
        total: number,
        dryRun: boolean
      ) =>
        `${label} ${command} in ${base}: ${count} of ${total} ${dryRun ? "would change" : "changed"}.`,
      allOff: (base: string, count: number, total: number, dryRun: boolean) =>
        `all ${notLoaded} in ${base}: ${count} of ${total} ${dryRun ? "would change" : "changed"}.`,
      statusLine: (name: string, state: string) =>
        `${name.padEnd(16)} ${state}`,
      scopeHeading: (scope: string, base: string) => `\n${scope} (${base})`,
      nothingFromShelf: `  nothing from the ${library}`,
      itemLine: (group: string, name: string, agent: boolean) =>
        `  ${group}/${name}${agent ? " (agent)" : ""}`,
      brokenLine: (kind: string, name: string, target: string) =>
        `  BROKEN ${kind}/${name} -> ${target} (missing)`,
      noProjectScope: (dir: string) =>
        `This folder's .claude is the ${allProjects} config folder (${dir}), so there is no separate ${thisProject} scope.`,
      noProjectScopeToMove: (dir: string) =>
        `This folder's .claude is the ${allProjects} config folder (${dir}), so there is no separate ${thisProject} scope to move between.`,
      notSkillFolder: (from: string) =>
        `${from} is not a skill folder (symlinks are not moved)`,
      cannotShelve: (skill: string, group: string) =>
        `Cannot shelve "${skill}" into "${group}"`,
      alreadyExists: (to: string) => `${to} already exists; not overwriting`,
      linkNamed: (skill: string, links: string) =>
        `A ${library} link named ${skill} exists: ${links}. Turn it ${notLoaded} first.`,
      wouldShelve: (skill: string, group: string, from: string, to: string) =>
        `would shelve ${skill} into ${group}: ${from} -> ${to}`,
      shelved: (skill: string, group: string) =>
        `shelved ${skill} into ${group}`,
      unshelveNeedsSkill: (target: string) =>
        `"${target}" is a ${bundle}; unshelve takes a skill name or ${bundle}/skill`,
      stillLinked: (label: string, links: string) =>
        `${label} is still linked: ${links}. Turn it ${notLoaded} first.`,
      wouldUnshelve: (label: string, dir: string, from: string, to: string) =>
        `would unshelve ${label} into ${dir}: ${from} -> ${to}`,
      unshelved: (label: string, dir: string) =>
        `unshelved ${label} into ${dir}`,
      badSkillName: (skill: string) => `Not a usable skill name: "${skill}"`,
      isLink: (from: string, scopeName: string) =>
        `${from} is a link, not a ${scopeName} skill folder (links belong to the ${library}; turn it ${notLoaded} instead)`,
      noScopeFolder: (scopeName: string, skill: string, dir: string) =>
        `No ${scopeName} skill folder "${skill}" in ${dir}`,
      wouldMove: (direction: string, skill: string, from: string, to: string) =>
        `would ${direction} ${skill}: ${from} -> ${to} (a move, no copy kept)`,
      moved: (
        direction: string,
        skill: string,
        scopeName: string,
        to: string
      ) => `${direction}d ${skill} to ${scopeName} scope: ${to}`,
      noSkillFolder: (target: string, dir: string) =>
        `No skill folder "${target}" in ${dir}`,
      isShelfLink: (target: string) =>
        `${target} is a link into the ${library}, not a ${thisProject} skill folder. Turn it ${notLoaded} instead.`,
      removeNeedsSkill: (target: string) =>
        `"${target}" is a ${bundle}; remove takes a skill name or ${bundle}/skill`,
      wouldRemove: (label: string, from: string, backup: boolean, to: string) =>
        `would remove ${label}: ${from} (${backup ? `copy kept in ${to}` : "no copy kept"})`,
      removed: (label: string, backup: boolean, to: string) =>
        `removed ${label}; ${backup ? `a copy is in ${to}` : "no copy kept"}`,
    },
    catalog: {
      fetchFailed: (repo: string, detail: string) =>
        `Could not fetch the catalog from ${repo}: ${detail}`,
      upToDate: (count: number) => `catalog up to date (${count} items)`,
      notFetched: "The catalog is not fetched yet: run agentry catalog refresh",
      notInstalled: notAdded,
      listLine: (
        bundleName: string,
        label: string,
        tokens: string,
        where: string,
        outdated: boolean
      ) =>
        `${bundleName.padEnd(8)} ${String(label).padEnd(30)} ${tokens}  ${where}${outdated ? "  outdated" : ""}`,
      noKindItem: (kind: string, name: string) =>
        `No ${kind} "${name}" in the catalog. See agentry catalog list`,
      noItem: (ref: string) =>
        `No item "${ref}" in the catalog. See agentry catalog list`,
      ambiguous: (ref: string, ids: string) =>
        `"${ref}" matches ${ids}; name one as kind/name`,
      refusedExists: (path: string, updateId: string | undefined) =>
        `refused: ${path} already exists; not overwriting it${updateId === undefined ? "" : ` (agentry catalog update ${updateId} refreshes an ${added} copy)`}.`,
      wouldAdd: (id: string, where: string, source: string, to: string) =>
        `would add ${id} to ${where}: ${source} -> ${to}`,
      added: (id: string, where: string, to: string) =>
        `added ${id} to ${where}: ${to}`,
      badGroupName: (group: string) =>
        `Not a usable ${bundle} name: "${group}"`,
      alreadyInstalled: (name: string, where: string) =>
        `${name} is already ${added} (${where}); not overwriting`,
      wouldAddSkill: (
        name: string,
        group: string,
        source: string,
        to: string
      ) =>
        `would add ${name} to ${library} ${bundle} ${group}: ${source} -> ${to}`,
      addedSkill: (name: string, group: string) =>
        `added ${name} to ${library} ${bundle} ${group} (${notLoaded}); turn it ${loaded} with agentry shelf on ${group}/${name}`,
      whereProjectAgents: `this ${thisProject}'s .claude/agents`,
      whereClaudeMd: `this ${thisProject} as CLAUDE.md`,
      refusedClaudeMd: (existing: string, source: string) =>
        `refused: this ${thisProject} already has ${existing}; not overwriting it. Merge ${source} into it by hand.`,
      isNotInstalled: (id: string) =>
        `${id} is ${notAdded}; agentry catalog add ${id}`,
      itemUpToDate: (id: string) => `${id} is up to date`,
      allUpToDate: `Everything ${added} is up to date.`,
      updateHeader: (id: string, path: string) => `update ${id} at ${path}:`,
      overwriteFile: (name: string) =>
        `  overwrite ${name}  (differs from the catalog copy: a local edit in it is replaced)`,
      addFile: (name: string) => `  add ${name}`,
      keepFile: (name: string) =>
        `  keep ${name}  (only in your copy; not touched)`,
      savedUnder: (path: string) =>
        `The current copy of each is saved under ${path} first.`,
      updateServer: (id: string) =>
        `update ${id} in your user config (args replaced, missing env keys added; existing env values stay):`,
      dryRun: "Dry run: nothing changed.",
      needYes: "Nothing changed; run again with --yes to apply.",
      overwritePrompt: "\nOverwrite these? [y/N] ",
      cancelled: "Cancelled; nothing changed.",
      updated: (id: string, label: string) => `updated ${id} (${label})`,
      removeAgentsOnly: (id: string, command: string) =>
        `refused: catalog remove takes agents; remove ${id} with ${command}.`,
      agentNotInstalled: (id: string, project: boolean) =>
        `${id} is ${notAdded} ${project ? `in this ${thisProject}` : "in ~/.claude/agents"}${project ? "" : `; --project removes the ${thisProject} copy`}.`,
      wouldRemove: (id: string, to: string, backup: boolean, saved: string) =>
        `remove ${id}: ${to} (${backup ? `a copy is kept under ${saved}` : "no copy kept"})`,
      removePrompt: "\nRemove these? [y/N] ",
      removed: (id: string) => `removed ${id}`,
    },
    mcpEdit: {
      pairNeeds: (what: string, format: string, got: string) =>
        `${what} needs ${format}, got "${got}"`,
      managedBy: {
        plugin: "managed by its plugin",
        project: "a project server (.mcp.json)",
        local: "a local-scope server",
        "desktop-config": "managed by Claude desktop",
        "desktop-extension": "managed by Claude desktop",
      } as Record<string, string>,
      aServer: (scope: string) => `a ${scope} server`,
      exactlyOne: "Give exactly one of --command and --url.",
      headerWithUrl: "--header goes with --url.",
      commandEmpty: "--command is empty.",
      argEnvWithCommand: "--arg and --env go with --command.",
      urlInvalid: "--url must be an http(s) URL.",
      addUsage:
        "Usage: agentry mcp add <name> (--command <cmd> [--arg A]... [--env K=V]... | --url <url> [--header K:V]...) [--scope user|project]",
      scopeInvalid: "--scope must be user or project",
      refusedExists: (scope: string, name: string) =>
        `refused: a ${scope}-scope server named ${name} already exists; not overwriting it (agentry mcp remove ${name} first, or agentry mcp set to change env and args).`,
      refusedNoDir: (dir: string) => `refused: ${dir} does not exist.`,
      describeAdd: (scope: string, name: string, summary: string) =>
        `Add ${scope} MCP server ${name} (${summary})`,
      added: (name: string, scope: string) =>
        `${name} is added to ${scope} scope.${scope === "project" ? ` Claude Code asks you to approve a ${thisProject} server the first time it loads.` : ""} ${appliesNewSessions}`,
      setUsage:
        "Usage: agentry mcp set <name> [--env K=V]... [--unset-env K]... [--arg A]...",
      notEditable: (name: string, who: string) =>
        `refused: ${name} is ${who}, which this tool does not edit.`,
      noUserServer: (name: string) =>
        `refused: No user-scope MCP server "${name}".`,
      urlServer: (name: string) =>
        `refused: ${name} is a url server; env and args only exist on command servers.`,
      nothingToChange: (name: string) =>
        `${name} already has that env and args; nothing to change.`,
      setEnv: (keys: string) => `set env ${keys}`,
      unsetEnv: (keys: string) => `unset env ${keys}`,
      replaceArgs: (count: number) => `replace args (${count})`,
      describeSet: (name: string, parts: string) =>
        `Edit user MCP server ${name}: ${parts}`,
      updated: (name: string) => `${name} is updated. ${appliesNewSessions}`,
    },
    mcpToggle: {
      managedBy: {
        "desktop-config": "managed by Claude desktop",
        "desktop-extension": "managed by Claude desktop",
      } as Record<string, string>,
      alreadyOffHere: (name: string) =>
        `${name} is already turned ${notLoaded} in this ${thisProject}.`,
      managed: (name: string, who: string) => `${name} is ${who}.`,
      doesNotManage: (scope: string) =>
        `a ${scope} server this tool does not manage`,
      noUserServer: (name: string) => `No user-scope MCP server "${name}".`,
      alreadyParked: (name: string, file: string) =>
        `${name} is already parked with a different config; enable it first or remove the parked entry by hand (${file}).`,
      notParked: (name: string, parked: string) =>
        `${name} is not parked. Parked: ${parked || "none"}`,
      alreadyExists: (name: string) =>
        `A user-scope server named ${name} already exists; not overwriting it.`,
      describeProject: (enable: boolean, name: string, key: string) =>
        `${enable ? "Turn on" : "Turn off"} MCP server ${name} for ${key} (disabledMcpServers in ~/.claude.json)`,
      projectState: (name: string, enable: boolean, key: string) =>
        `${name} is ${enable ? loaded : notLoaded} for ${key}. ${appliesNewSessions}`,
      describePark: (enable: boolean, name: string, summary: string) =>
        `${enable ? "Add back" : "Park"} user MCP server ${name} (${summary})`,
      saveFailed: "could not save the parked copy, so nothing was removed",
      backInUserScope: (name: string) =>
        `${name} is back in user scope; its parked copy is deleted. ${appliesNewSessions}`,
      parked: (name: string, file: string) =>
        `${name} is parked (saved in ${file}, mode 0600, secrets included). Switch it back with agentry mcp enable ${name}. ${appliesNewSessions}`,
      wouldDeleteParked: (name: string, summary: string, file: string) =>
        `would delete the parked copy of ${name} (${summary}) from ${file}`,
      addYes: "Add --yes to delete the parked copy.",
      parkedDeleted: (name: string) => `${name}: parked copy deleted.`,
      noServer: (name: string) => `refused: No MCP server "${name}".`,
      refusedManaged: (name: string, who: string, plugin: boolean) =>
        `refused: ${name} is ${who}${plugin ? " (remove the plugin, or turn the server off with agentry mcp disable)" : ""}.`,
      describeRemove: (what: string) => `Remove ${what}`,
      removed: (name: string, scope: string) =>
        `${name} is removed from ${scope} scope. ${appliesNewSessions}`,
    },
    hookToggle: {
      selectorHelp:
        "The selector is the id column of agentry hook list (4 to 8 hex characters).",
      matchesSeveral: (selector: string, ids: string) =>
        `"${selector}" matches several hooks (${ids}); use more characters.`,
      pluginManages: (selector: string, plugin: string) =>
        `${selector} is a hook of plugin ${plugin}, which manages it; turn the plugin ${notLoaded} with agentry plugin disable ${plugin}.`,
      alreadyOff: (selector: string, described: string) =>
        `${selector} is already ${notLoaded} (${described}).`,
      alreadyOn: (selector: string, scope: string) =>
        `${selector} is already ${loaded} (${scope} settings).`,
      noHook: (action: string, selector: string, scope: string | undefined) =>
        `No ${action === "enable" ? "turned-off " : ""}hook "${selector}"${scope ? ` in ${scope} settings` : ""}. See agentry hook list.`,
      existsIn: (selector: string, scopes: string) =>
        `${selector} exists in ${scopes} settings; pick one with --scope.`,
      wouldDeleteParked: (described: string, file: string) =>
        `would delete the parked copy of ${described} from ${file}`,
      addYes: "Add --yes to delete the parked copy.",
      parkedDeleted: (selector: string) => `${selector}: parked copy deleted.`,
      notInFile: (selector: string, file: string) =>
        `refused: ${selector} is not in ${file} any more; run agentry hook list.`,
      alreadyInFile: (selector: string, file: string, scope: string) =>
        `${selector} is already in ${file}; the saved copy stays (agentry hook remove ${selector} --scope ${scope} deletes it).`,
      noDirToPutBack: (dir: string) =>
        `refused: ${dir} does not exist, so the hook cannot be put back there.`,
      verbs: {
        disable: "Turn off",
        enable: "Turn on",
        remove: "Remove",
      } as Record<string, string>,
      describe: (verb: string, id: string, label: string, scope: string) =>
        `${verb} hook ${id}: ${label} (${scope} settings)`,
      isOff: (id: string, file: string) =>
        `hook ${id} is ${notLoaded} (saved in ${file}, mode 0600). Switch it back with agentry hook enable ${id}. ${appliesNewSessions}`,
      backIn: (id: string, scope: string) =>
        `hook ${id} is back in ${scope} settings; its saved copy is deleted. ${appliesNewSessions}`,
      removedFrom: (id: string, scope: string) =>
        `hook ${id} is removed from ${scope} settings. ${appliesNewSessions}`,
      saveFailed:
        "The settings file changed, but the saved copy could not be updated; agentry fix --undo restores the file.",
    },
    pluginToggle: {
      appliesNote:
        "Applies to sessions started after this; a running session keeps its plugins until restarted.",
      noPlugin: (name: string, ids: string) =>
        `No plugin "${name}". Plugins: ${ids || "none"}`,
      notInstalledHere: (id: string, otherProjects: boolean) =>
        `${id} is ${otherProjects ? `${added} only for other ${thisProject}s, so it does not load in this folder` : notAdded}; install it with claude plugin install first.`,
      mdm: (id: string, domain: string) =>
        `${id} is set by macOS MDM managed settings (${domain}), which this tool cannot change.`,
      managedFile: (id: string, file: string) =>
        `${id} is set by managed settings (${file}), which this tool cannot change.`,
      overridden: (top: string, source: string, id: string, chosen: string) =>
        `${top} settings (${source}) also set ${id} and win over ${chosen}; use --scope ${top}.`,
      noDir: (dir: string, scope: string) =>
        `${dir} does not exist, so ${scope} settings cannot be created there.`,
      already: (id: string, enable: boolean, by: string) =>
        `${id} is already ${enable ? "enabled" : "disabled"}${by === "default" ? " (by default)" : ` (${by} settings)`}.`,
      describe: (enable: boolean, id: string, scope: string) =>
        `${enable ? "Enable" : "Disable"} ${id} in ${scope} settings`,
    },
    pluginInstall: {
      usage:
        "Usage: agentry plugin install <name>@<marketplace> [--scope user|project|local]",
      noInstalled: (name: string, ids: string) =>
        `No ${added} plugin "${name}". ${capital(added)}: ${ids || "none"}`,
      onlyOtherProjects: (id: string) =>
        `${id} is ${added} only for other ${thisProject}s; run this in one of them.`,
      severalScopes: (id: string, scopes: string) =>
        `${id} is ${added} at several scopes here (${scopes}); pick one with --scope.`,
      alreadyInstalled: (id: string, scope: string) =>
        `refused: ${id} is already ${added} at ${scope} scope.`,
      notInstalledAt: (id: string, scope: string) =>
        `refused: ${id} is ${notAdded} at ${scope} scope.`,
      noDir: (dir: string, scope: string) =>
        `refused: ${dir} does not exist, so ${scope} scope cannot be used here.`,
      describe: (install: boolean, id: string, scope: string) =>
        `${install ? "Install" : "Uninstall"} plugin ${id} at ${scope} scope`,
      done: (install: boolean, id: string, scope: string, note: string) =>
        `${id} is ${install ? "installed" : "uninstalled"} at ${scope} scope. ${note}`,
    },
    backups: {
      fixSet: (files: number, state: string) =>
        `fix set, ${files} file${files === 1 ? "" : "s"}, ${state}`,
      fixSetUnreadable: "fix set (manifest unreadable)",
      itemDetail: (kind: string, what: string, from: string | undefined) =>
        `${kind} ${what}${from ? `, from ${from}` : ", original folder unknown (copy it back by hand)"}`,
      none: (dir: string) => `No backups in ${dir}.`,
      heading: (dir: string) => `Backups in ${dir} (newest first):`,
      total: (count: number, size: string) =>
        `${count} backup${count === 1 ? "" : "s"}, ${size}.`,
      noBackup: (id: string) =>
        `No backup "${id}". Run agentry backups list to see the ids.`,
      isFixSet: (id: string, name: string) =>
        `${id} is a fix set; restore it with agentry fix --undo ${name}.`,
      noOrigin: (id: string, path: string) =>
        `${id} has no recorded original folder (made by an older agentry). Copy ${path} back by hand.`,
      exists: (from: string) => `${from} already exists; not overwriting.`,
      wouldRestore: (name: string, from: string, to: string) =>
        `would restore ${name}: ${from} -> ${to}`,
      keptCurrent: (path: string) => `kept the current copy as ${path}`,
      restored: (name: string, to: string) => `restored ${name} to ${to}`,
      kindWithIds: "--kind goes with --older-than or --all, not with ids.",
      kindOneOf: (kinds: string) => `--kind must be one of ${kinds}.`,
      sayWhat: "Say what to delete: --older-than <days> or --all.",
      nothingToDelete: "Nothing to delete.",
      wouldDelete: (count: number, size: string) =>
        `Would delete ${count} backup${count === 1 ? "" : "s"} (${size}) for good:`,
      liveFixSets: (count: number) =>
        `${count} fix set${count === 1 ? "" : "s"} not undone yet: agentry fix --undo can no longer restore ${count === 1 ? "it" : "them"}.`,
      dryRun: "Dry run: nothing deleted.",
      needYes: "Nothing deleted; run again with --yes to apply.",
      deletePrompt: "\nDelete these? [y/N] ",
      cancelled: "Cancelled; nothing deleted.",
      deleted: (count: number) =>
        `deleted ${count} backup${count === 1 ? "" : "s"}`,
    },
  },
};
