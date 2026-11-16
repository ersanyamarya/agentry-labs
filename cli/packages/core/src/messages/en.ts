// The English text of the terminal UI, the web UI and the core text they show. Every user-facing word comes from `terms`
// (the glossary), so renaming a word is one edit here. A message with a value is a function. Sections are filled in as
// each area moves over from its component.
const terms = {
  library: "library",
  bundle: "bundle",
  thisProject: "this project",
  allProjects: "all projects",
  // Skills only: a skill is loaded or not loaded.
  loaded: "loaded",
  notLoaded: "not loaded",
  // Catalog items: added or not added.
  added: "added",
  notAdded: "not added",
  // MCP servers, hooks and plugins are really on or off.
  on: "on",
  off: "off",
  // Claude user items given to GitHub Copilot: shared or not shared (always for all projects).
  shared: "shared",
  notShared: "not shared",
};
// Claude Code plugins are really installed, unlike catalog items.
const installed = "installed";
const notInstalled = "not installed";
// Said after most changes; the preview already told the user what is written.
const appliesUndo = "Applies to new sessions; undo with agentry fix --undo";
// A glossary word with a capital ("Bundles:"), so the glossary word still drives it.
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
  on,
  off,
  shared,
  notShared,
} = terms;
const skillsForAll = `Skills for ${allProjects}`;
const skillsForProject = `Skills for ${thisProject} only`;

// Text only the web UI shows; what it shares with the terminal UI is read from the sections above in the components.
const web = {
  common: {
    cancel: "Cancel",
    remove: "Remove",
    delete: "Delete",
    deleteNoCopy: "Delete (no copy)",
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
    turnOn: `Turn ${on}`,
    turnOff: `Turn ${off}`,
    scopeGlobal: capital(allProjects),
    scopeProject: capital(thisProject),
    noSelection: (what: string) => `Select ${what} to see its details.`,
  },
  skills: {
    scope: {
      plugin: "Plugin",
      globalAndProject: `${capital(loaded)} in ${allProjects} and ${thisProject}`,
      global: `${capital(loaded)} in ${allProjects}`,
      project: `${capital(loaded)} in ${thisProject}`,
      library: capital(notLoaded),
    },
    tokensNotMeasured: "tokens not measured",
    tokens: (n: number) => `~${n} tokens`,
    installedAlwaysOn: (name: string) =>
      `${name} is ${added}, so it is always ${loaded}. Move it to the ${library} to unload it.`,
    bulkFailed: (label: string, ok: number, failed: number, names: string) =>
      `${label}: ${ok} done, ${failed} failed (${names})`,
    bulkDone: (label: string, ok: number) => `${label}: ${ok} done`,
    turnOn: "Load",
    turnOff: "Unload",
    turnedOn: "Loaded",
    turnedOff: "Unloaded",
    shelved: `Moved to the ${library}`,
    moved: "Moved",
    removed: "Removed",
    path: "Path",
    cost: "Cost",
    group: capital(bundle),
    state: "State",
    brokenLink: "broken link",
    shelve: `Move to the ${library}`,
    unshelve: `Move out of the ${library}`,
    onlyThisProject: `Only ${thisProject}`,
    allProjects: capital(allProjects),
    note: (configDir: string | undefined, backupsDir: string | undefined) =>
      `Changes apply to ${configDir ?? "~/.claude"} or ${thisProject}. Every removal keeps a copy under ${backupsDir ?? "the backups folder"} that Backups can restore.`,
    addFromCatalog: "Add from catalog",
    columns: {
      on: capital(loaded),
      name: "Name",
      group: capital(bundle),
      scope: "Status",
    },
    turnAria: (name: string, currentlyOn: boolean) =>
      `${currentlyOn ? "Unload" : "Load"} ${name}`,
    turnGroupAria: (name: string, currentlyOn: boolean) =>
      `${currentlyOn ? "Unload" : "Load"} ${bundle} ${name}`,
    detailsLabel: "Skill details",
    selectOne: "a skill",
    emptyNone: "No skills yet. Add one from the catalog.",
    emptyNoMatch: "No skills match.",
    filters: { all: "All", on: capital(loaded) },
    hint: `↑↓ move · space ${loaded}/${notLoaded} · g ${allProjects} · * mark · m move · x remove (copy kept) · X delete (no copy) · / search`,
    nowPressStar:
      "Marking all rows now uses the checkbox in the header; * marks one row.",
    move: "Move",
    moveDialogDescription: `Pick where it goes. Moving to the ${library} asks for a ${bundle} next.`,
    moveNone: "Nothing to move here: plugin skills move with their plugin.",
    deleteTitle: (what: string) => `Delete ${what}?`,
    deleteDescription: (what: string) =>
      `This deletes ${what} and keeps no copy. It cannot be restored from Backups.`,
    searchPlaceholder: "Search skills",
    summary: (all: number, loadedCount: number, inLibrary: number) =>
      `${all} skills · ${loadedCount} ${loaded} · ${inLibrary} in the ${library}`,
    title: "Skills",
    groupsAria: `${capital(library)} ${bundle}s`,
    groups: `${capital(bundle)}s`,
    bulkAria: "Bulk actions",
    selected: (n: number) => `${n} selected`,
    count: (n: number) => `${n} skills`,
    shelveTitle: (what: string) => `Move ${what} to the ${library}`,
    shelveDescription: `The skill moves to the ${library}, ${notLoaded}. Pick an existing ${bundle} or type a new name.`,
    shelveGroupAria: `${capital(library)} ${bundle}`,
    groupPlaceholder: `${capital(bundle)} name`,
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
    install: "Add",
    installed: capital(added),
    addedIn: (where: string) => `${capital(added)} in ${where}`,
    title: (action: string, name: string) => `${action} ${name}`,
    note: `Skills go to the ${library}, ${notLoaded}. An update keeps a copy of the old one in the backups.`,
    removeAgentTitle: (name: string) => `Remove agent ${name}`,
    deleteAgentTitle: (name: string) => `Delete agent ${name} (no copy)`,
    addChoiceDescription: `Where should it go? ${capital(allProjects)}, or ${thisProject} only.`,
    heading: "Catalog",
    summary: (n: number) =>
      `${n} items from agentry-labs, ready to add to ${thisProject} or ${allProjects}`,
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
    empty: "No agents.",
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
    hint: "↑↓ move · x remove (copy kept) · X delete (no copy) · / search",
    deleteTitle: (label: string) => `Delete ${label} (no copy)`,
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
      `Turn hook ${event} ${currentlyOn ? off : on}`,
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
    hint: `↑↓ move · space ${off}/${on} · x remove (undo: agentry fix --undo) · / search`,
    searchPlaceholder: "Search hooks",
    summary: (n: number, onCount: number) => `${n} hooks · ${onCount} ${on}`,
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
      `Turn ${id} ${currentlyOn ? off : on}`,
    plugin: "Plugin",
    version: (version: string) => ` · ${version}`,
    cellTokens: (n: number) => ` · ~${n} tokens`,
    id: "Id",
    versionLabel: "Version",
    skills: "Skills",
    skillTokens: (n: number) => `~${n} tokens`,
    turnedOnBy: `Turned ${on} by`,
    selectOne: "a plugin",
    detailsLabel: "Plugin details",
    empty: "No plugins.",
    hint: `↑↓ move · space ${off}/${on} · a install plugin · x uninstall · / search`,
    searchPlaceholder: "Search plugins",
    summary: (n: number, onCount: number) => `${n} plugins · ${onCount} ${on}`,
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
    hint: "↑↓ move · u restore · X delete (no copy) · d delete 30+ days old · / search",
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
    findings: (n: number) => `${n} findings in ~/.claude and ${thisProject}`,
    undo: "Undo last fix",
    hint: "u undo last fix",
    noFix: "No automatic fix. Change it by hand.",
    fixIt: "Fix it",
  },
  mcp: {
    parkedSource: "parked in agentry's config",
    managedElsewhere: (name: string, source: string) =>
      `${name} is managed in ${source}. Only servers for ${allProjects} can be turned off here.`,
    turnTitle: (enable: boolean, name: string) =>
      `${enable ? "Add back" : "Turn off"} ${name}`,
    removeTitle: (name: string) => `Remove ${name}`,
    removeNote: "A backup of ~/.claude.json is made first.",
    addTitle: (name: string) => `Add ${name}`,
    editTitle: (name: string) => `Edit ${name}`,
    addServer: "Add server",
    turnAria: (name: string, currentlyOn: boolean) =>
      `Turn ${name} ${currentlyOn ? off : on}`,
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
    hint: `↑↓ move · space ${off}/${on} · a add server · s edit env/args · x remove (undo: agentry fix --undo) · / search`,
    searchPlaceholder: "Search servers",
    summary: (n: number, onCount: number) => `${n} servers · ${onCount} ${on}`,
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
    groups: { library: "Setup", discover: "Discover", health: "Health" },
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
    scopeGlobal: capital(allProjects),
    scopeProject: capital(thisProject),
    shortcutsAria: "Keyboard shortcuts",
  },
  list: {
    filterAria: "Filter",
    selectAllAria: "Select all shown",
    selectAria: (label: string) => `Select ${label}`,
  },
  help: {
    // Keys that work the same on every screen.
    shared: [
      ["↑ ↓", "move between rows"],
      ["/", "search the rows"],
      ["y / n", "apply or cancel a previewed change"],
      ["?", "this help"],
    ] as [string, string][],
    // Keys that only work on one screen, by section id (the route name).
    screens: {
      skills: [
        [
          "space",
          `${loaded}/${notLoaded} the selected skill, in the scope chosen in the sidebar`,
        ],
        ["g", `${loaded}/${notLoaded} for ${allProjects}`],
        ["*", "mark a row; the next key then applies to all marked rows"],
        ["esc", "clear the marks"],
        ["m", `move: ${allProjects}, ${thisProject} only, or the ${library}`],
        ["x", "remove (a copy is kept in the backups)"],
        ["X", "delete (no copy kept)"],
      ],
      mcp: [
        ["a", "add a server"],
        ["space", `turn a server ${off} (saved) or add it back`],
        ["s", `edit env/args of a server for ${allProjects}`],
        ["x", "remove a server (undo: agentry fix --undo)"],
      ],
      hooks: [
        ["space", `turn a hook ${off} (saved) or ${on} again`],
        ["x", "remove a hook (undo: agentry fix --undo)"],
      ],
      plugins: [
        ["space", `${on}/${off} (applies to new sessions)`],
        ["a", "install a plugin"],
        ["x", "uninstall the plugin"],
      ],
      rules: [
        ["x", "remove the file (a copy is kept in the backups)"],
        ["X", "delete the file (no copy kept)"],
      ],
      agents: [],
      catalog: [
        [
          "a",
          `add the item; agents and MCP ask ${allProjects} or ${thisProject}`,
        ],
        ["u", "update an outdated item"],
        ["x", `remove an ${added} agent (a copy is kept in the backups)`],
        ["X", `delete an ${added} agent (no copy kept)`],
        ["f", "fetch the latest catalog"],
      ],
      doctor: [["u", "undo the last fix"]],
      backups: [
        ["u", "restore a removed skill or an updated copy"],
        ["X", "delete a backup (no copy kept)"],
        ["d", "delete the backups 30+ days old"],
      ],
    } as Record<string, [string, string][]>,
    forScreen: (name: string) =>
      `Keys for ${name}, then the keys every screen shares.`,
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
    // x and X have no short form: the footer drops keys before it drops these words.
    removeCopyKept: "remove (copy kept)",
    removeNoCopy: "delete (no copy)",
    remove: "remove",
    update: "update",
    footer: { sidebar: "sidebar", help: "help" },
    skills: {
      projectToggle: `${thisProject} ${loaded}/${notLoaded}`,
      projectToggleShort: thisProject,
      globalToggle: `${allProjects} ${loaded}/${notLoaded}`,
      globalToggleShort: allProjects,
      expand: "expand",
      move: "move",
      pluginToggle: "enable/disable plugin",
      pluginToggleShort: `${on}/${off}`,
    },
    catalog: {
      fetch: "fetch catalog",
      fetchShort: "fetch",
      addToLibrary: `add to the ${library}`,
      addMenu: `add (${allProjects} or ${thisProject})`,
      addRule: `add to ${allProjects} (~/.claude/rules)`,
      addClaudeMd: `add as ${thisProject}'s CLAUDE.md`,
      add: "add",
      updateCatalog: "fetch latest catalog",
    },
    backups: {
      prune: "delete 30+ days old",
      pruneShort: "delete old",
      restore: "restore",
    },
    mcp: {
      add: "add server",
      addShort: "add",
      edit: "edit env/args",
      turnOnHere: "turn on here",
      addBack: "add back",
      turnOffHere: "turn off here",
      turnOffSaved: "turn off (saved)",
      on,
      off,
    },
    hooks: {
      turnOn: "turn on",
      turnOffSaved: "turn off (saved)",
      on,
      off,
    },
    plugins: {
      toggle: "enable/disable",
      toggleShort: `${on}/${off}`,
      install: "install plugin",
      installShort: "install",
      uninstall: "uninstall",
    },
    doctor: {
      previewFix: "preview fix",
      previewFixShort: "preview",
      undo: "undo last fix",
      undoShort: "undo",
    },
  },
  help: {
    title: "Keys (? or esc to close)",
    // Keys that work the same on every tab.
    shared: [
      ["tab", "switch between the sidebar and the list"],
      ["← / →, 1-9", "switch section"],
      ["↑ / ↓", "move between rows"],
      ["/", "search the rows (enter keeps it)"],
      ["*", "mark a row; the next key then applies to all marked rows"],
      ["esc", "clear the search or the marks"],
      ["e", "open the selected row's file in $EDITOR"],
      ["y / n", "confirm or cancel a previewed change (c copies it)"],
      ["r", "refresh"],
      ["p", "switch project"],
      ["?", "this help"],
      ["q", "quit"],
    ] as [string, string][],
    // Keys that only work on one tab, by tab name.
    tabs: {
      Skills: [
        [
          "space",
          `${loaded}/${notLoaded} for ${thisProject}; plugin: ${on}/${off}`,
        ],
        ["g", `${loaded}/${notLoaded} for ${allProjects}`],
        ["m", `move: ${allProjects}, ${thisProject} only, or the ${library}`],
        ["x", "remove (a copy is kept in the backups)"],
        ["X", "delete (no copy kept)"],
        ["enter", `expand a ${bundle}, show details`],
      ],
      MCP: [
        ["a", "add a server"],
        ["space", `turn a server ${off} (saved) or add it back`],
        ["s", `edit env/args of a server for ${allProjects}`],
        ["x", "remove a server (undo: agentry fix --undo)"],
      ],
      Hooks: [
        ["space", `turn a hook ${off} (saved) or ${on} again`],
        ["x", "remove a hook (undo: agentry fix --undo)"],
      ],
      Plugins: [
        ["space", `${on}/${off} (applies to new sessions)`],
        ["a", "install a plugin"],
        ["x", "uninstall the plugin"],
      ],
      Rules: [
        ["x", "remove the file (a copy is kept in the backups)"],
        ["X", "delete the file (no copy kept)"],
      ],
      Agents: [["enter", "show details (read only; e opens the file)"]],
      Catalog: [
        [
          "a",
          `add the item; agents and MCP ask ${allProjects} or ${thisProject}`,
        ],
        ["u", "update an outdated item"],
        ["x", `remove an ${added} item (a copy is kept in the backups)`],
        ["X", `delete an ${added} item (no copy kept)`],
        ["f", "fetch the latest catalog"],
      ],
      Doctor: [
        ["enter", "preview a fix"],
        ["u", "undo the last fix"],
      ],
      Backups: [
        ["u", "restore a removed skill or an updated copy"],
        ["X", "delete a backup (no copy kept)"],
        ["d", "delete the backups 30+ days old"],
      ],
    } as Record<string, [string, string][]>,
    legend: [
      `● ${loaded} / active green, ○ ${notLoaded} / disabled gray, ◐ partial yellow.`,
      "Cost: dim < 100, yellow < 500, red 500+. No colour: set NO_COLOR.",
      "Plugin changes apply to new sessions (undo: agentry fix --undo).",
    ] as string[],
  },
  // The dim status line under a list.
  listStatus: {
    marked: (n: number) => `${n} marked (space/x apply to all, esc clears)`,
    filter: (query: string, shown: number, total: number) =>
      `filter "${query}": ${shown} of ${total} (/ edit, esc clear)`,
  },
  skills: {
    notices: {
      badGroupName: (name: string) =>
        `Not a usable ${bundle} name: "${name}" (no slash, no leading dot, not "agents")`,
      shelvePreviewTitle: `Move to the ${library}: preview (dry run)`,
      shelved: (skill: string, name: string) =>
        `Moved ${skill} into the ${library} ${bundle} ${name}; it is ${notLoaded}, toggle it with space.`,
      newGroupTitle: (skill: string) =>
        `Move ${skill} to the ${library}: new ${bundle}`,
      newGroupLabel: `${capital(bundle)} name`,
      newGroupIntro: `Type the name of the new ${library} ${bundle}.`,
      chooseTitle: (skill: string) =>
        `Move ${skill} to the ${library}: choose a ${bundle}`,
      chooseIntro: (skill: string) =>
        `Move ${skill} to the ${library}, in which ${bundle}?`,
      unshelvePreviewTitle: `Move out of the ${library}: preview (dry run)`,
      unshelved: (target: string) =>
        `Moved ${target} out of the ${library} into ~/.claude/skills.`,
      agentsSwitch: `Agents switch with their ${bundle}: toggle the ${bundle} row.`,
      markedNotSwitchable: `Marked rows are not ${library} ${bundle}s or skills: nothing to switch.`,
      whereGlobal: `for ${allProjects}`,
      whereProject: `for ${thisProject}`,
      turnTitle: (isOn: boolean, where: string) =>
        `${isOn ? "Load" : "Unload"} ${where}`,
      link: (isOn: boolean, target: string | undefined, where: string) =>
        `${isOn ? "Link" : "Unlink"} ${target} ${where}.`,
      turned: (isOn: boolean, where: string) =>
        `${isOn ? "Loaded" : "Unloaded"} ${where}`,
      markedNotRemovable: `Marked rows cannot be removed here (only skills in the ${library}, for ${allProjects} or for ${thisProject} only).`,
      moveHint: `m moves a skill between ${allProjects}, ${thisProject} only and the ${library}: select a skill or a skill folder.`,
      nowPressM: "Moves now live under m: press m to move this skill.",
      moveTitle: (skill: string) => `Move ${skill}`,
      moveIntro: (skill: string) => `Where should ${skill} go?`,
      moveToLibrary: `Move to the ${library}`,
      moveOutOfLibrary: `Move out of the ${library} (to ${allProjects})`,
      moveToAll: `Move to ${allProjects} (~/.claude/skills)`,
      moveToProject: `Move to ${thisProject} only`,
      removeHint: `x removes a skill folder from the ${library}, ${allProjects} or ${thisProject} only (X keeps no copy): select one.`,
      projectLabel: (skill: string | undefined) => `${skill} (${thisProject})`,
      globalLabel: (skill: string | undefined) => `${skill} (${allProjects})`,
    },
    headers: {
      shelf: capital(library),
      skills: "Skills",
      cost: "Cost",
      project: capital(thisProject),
      global: capital(allProjects),
    },
    noGroups: `  (no ${library} ${bundle}s)`,
    noGroupsDetail: `${capital(library)} skills live in <config dir>/skill-shelf/<${bundle}>/<skill>.`,
    count: (n: number) => `${n} skills`,
    agentWord: "agent",
    agentSuffix: " (agent)",
    group: {
      title: (name: string) => `${library} ${bundle}: ${name} (opt-in)`,
      thisProject: (state: string) => `${thisProject}: ${state}`,
      allProjects: (state: string) => `${allProjects}: ${state}`,
      contains: (skills: number, agents: number) =>
        `contains: ${skills} skills${agents > 0 ? `, ${agents} agent${agents > 1 ? "s" : ""}` : ""}`,
      cost: (tokens: string) => `cost when ${loaded}: ${tokens} tokens`,
      toggle: `space = ${thisProject}, g = ${allProjects}; enter expands`,
    },
    item: {
      title: (isSkill: boolean, name: string) =>
        `${isSkill ? "skill" : "agent"}: ${name}`,
      bundle: (name: string) => `${bundle}: ${name}`,
      toggleSkill: `${library} skill (opt-in): space = ${thisProject}, g = ${allProjects}; m moves it out of the ${library}`,
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
      project: `skill for ${thisProject} (this repo's .claude/skills): e opens it, m moves it to the ${library} or ${allProjects}`,
      global: `Folder in ~/.claude/skills, loaded in ${allProjects}. m moves it to the ${library} or ${thisProject} only.`,
      broken: "broken skill: see the Doctor tab",
      symlink: `skill for ${allProjects} is a symlink, not a folder: only folders move to the ${library}`,
    },
    sections: {
      global: skillsForAll,
      project: skillsForProject,
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
      project: (n: number) => `in ${thisProject}: ~${n}`,
      plugins: (n: number) => `from plugins: ~${n}`,
      note: `counts skills that are ${loaded} (${library} skills under the scope they are linked in); ${notLoaded} skills, MCP, hooks and rule files cost 0 here (rule files: Rules tab).`,
    },
  },
  catalog: {
    notices: {
      added: {
        skill: `to the ${library}, ${notLoaded}. Load it from the Skills tab`,
        agent: "as an agent",
        rule: "to ~/.claude/rules",
        claudeMd: `as ${thisProject}'s CLAUDE.md`,
        mcp: "as an MCP server. It applies to sessions started after this",
      },
      outdatedCount: (n: number) => `${n} outdated (u updates)`,
      fetching: "Fetching the catalog...",
      addSkillTitle: (name: string) =>
        `Add ${name} to the ${library} (preview)`,
      addTitle: (item: string | undefined, project: boolean) =>
        `Add ${item}${project ? ` to ${thisProject}` : ""} (preview)`,
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
      nowPressA:
        "Adding now uses a (agents and MCP servers ask all projects or this project): press a to add this item.",
      addTitleMenu: (item: string | undefined) => `Add ${item}`,
      addIntro: (item: string | undefined) => `Where should ${item} go?`,
      addAllProjects: `Add to ${allProjects}`,
      addThisProject: `Add to ${thisProject}`,
      upToDate: (item: string | undefined) => `${item} is up to date.`,
    },
    toggle: {
      skillInstalled: "x removes it (a copy is kept in the backups)",
      skill: `a copies it into the ${library}, ${notLoaded}; load it from the Skills tab`,
      agent: `a copies it to ~/.claude/agents (${allProjects}) or ${thisProject}'s .claude/agents; never overwrites`,
      rule: `a copies it to ~/.claude/rules (${allProjects}); never overwrites`,
      claudeMd: `a copies it to ${thisProject} as CLAUDE.md, only when the ${thisProject} has none`,
      mcp: `a adds it to your config for ${allProjects} (claude mcp add-json) or to ${thisProject}'s .mcp.json; the preview masks secrets`,
      removeSuffix: "; x removes it (a copy is kept in the backups)",
      outdatedMcp:
        "; u sets the catalog's args and any env key you lack (masked preview, backed up, undoable)",
      outdated: `; u overwrites the ${added} copy with the catalog's (previewed, the old copy is saved first)`,
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
      // Where an added item lives: the catalog's install labels (shelf/<bundle>, project, global) in the glossary words.
      where: (label: string) =>
        label
          .split(", ")
          .map((one) =>
            one.startsWith("shelf/")
              ? `${library}/${one.slice(6)}`
              : one === "project"
                ? thisProject
                : one === "global"
                  ? allProjects
                  : one
          )
          .join(", "),
      installed: (outdated: boolean, where: string) =>
        `${added}: ${outdated ? "◐" : "●"} ${where}${outdated ? ", outdated" : ""}`,
      notInstalled: `${added}: ○ ${notAdded}`,
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
      local: `local-scope server: this tool only handles servers for ${allProjects}`,
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
      toggleUser: `space turns it ${off} (removes it from ${allProjects}, config saved), s edits env and args; undo with agentry fix --undo`,
      toggleOther: `space turns it ${off} for ${thisProject} only (disabledMcpServers in ~/.claude.json); space again turns it ${on}`,
      notManaged: "not managed here",
      parkedState: (badge: string) => `state: ${badge} (config saved)`,
      config: (summary: string) => `config: ${summary}`,
      turnedOff: (when: string) => `turned ${off}: ${when}`,
      parkedToggle: `space adds it back to ${allProjects} (claude mcp add-json from the saved copy)`,
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
      toggle: `space turns it ${off} (moved to ~/.claude/agentry/parked-hooks.json), x removes it; undo with agentry fix --undo`,
      parkedState: (badge: string) => `state: ${badge} (saved copy)`,
      turnedOff: (when: string) => `turned ${off}: ${when}`,
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
        `install: ${scope}${projectPath ? ` ${projectPath}` : ""}${here ? "" : " (another project)"}`,
      enabledBy: (source: string) => `enabled by: ${source}`,
      notInstalled,
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
    emptyNote: `the Catalog tab can add an agent (~/.claude/agents, or o for ${thisProject} only).`,
    headers: { agents: "Agents", cost: "Cost", model: "Model" },
    detail: {
      agent: (name: string) => `agent: ${name}`,
      description: (text: string) => `description: ${text}`,
      model: (model: string) => `model: ${model}`,
      tools: (tools: string) => `tools: ${tools}`,
      tokens: "(name and description; the body loads when the agent runs)",
      note: "add or remove agents from the Catalog tab; e opens the file.",
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
      nowPressX: "Deleting a backup now uses X: press X to delete this backup.",
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
    groups: { library: "SETUP", discover: "DISCOVER", health: "HEALTH" },
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
        `${promote ? "Move to all projects" : `Move to ${thisProject} only`}: ${skill} (preview)`,
      done: (promote: boolean, skill: string) =>
        promote
          ? `${skill} now lives in ~/.claude/skills and loads in every project.`
          : `${skill} now lives in ${thisProject}'s .claude/skills only.`,
    },
    remove: {
      title: (label: string | undefined) => `Remove ${label} (preview)`,
      done: (label: string | undefined, backup: boolean) =>
        backup
          ? `Removed ${label}; a copy is in ~/.claude/backups/agentry/removed/ (Backups tab restores it).`
          : `Removed ${label}; no copy was kept.`,
    },
    hook: {
      toggleTitle: (isOff: boolean, hook: string | undefined) =>
        `Turn ${isOff ? on : off} hook ${hook}`,
      toggled: (hook: string | undefined, isOff: boolean) =>
        `Hook ${hook} is ${isOff ? `back ${on}` : `${off} (saved)`}. ${appliesUndo}.`,
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
        `${name} ${enable ? `is back in ${allProjects}` : `is turned ${off}`}. ${appliesUndo}.`,
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
          `${allProjects} (claude mcp add-json)`,
          `${thisProject} (this repo's .mcp.json)`,
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
      notOneScope: `${capital(notInstalled)} at exactly one scope here: uninstall it on its own.`,
      removeOrUninstall: "Remove or uninstall",
      switch: "Switch",
      removedDone: `Removed. ${appliesUndo}`,
      switchedDone: `Switched. ${appliesUndo}`,
      notInstalledHere: `Not installed for ${thisProject}: nothing to uninstall here.`,
      nowPressA: "Installing a plugin now uses a: press a to install one.",
    },
  },
  core: {
    scopeNames: { user: allProjects, desktop: "desktop" },
    scopeTitle: { user: capital(allProjects), project: capital(thisProject) },
    columns: { state: "STATE", scope: "SCOPE" },
    // Detail-line labels whose value is drawn in its state colour.
    stateLabels: ["state", `${thisProject}`, allProjects],
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
        `all unloaded in ${base}: ${count} of ${total} ${dryRun ? "would change" : "changed"}.`,
      statusLine: (name: string, state: string) =>
        `${name.padEnd(16)} ${state}`,
      scopeHeading: (scope: string, base: string) => `\n${scope} (${base})`,
      nothingFromShelf: `  nothing from the ${library}`,
      itemLine: (group: string, name: string, agent: boolean) =>
        `  ${group}/${name}${agent ? " (agent)" : ""}`,
      brokenLine: (kind: string, name: string, target: string) =>
        `  BROKEN ${kind}/${name} -> ${target} (missing)`,
      noProjectScope: (dir: string) =>
        `This folder's .claude is the config folder for ${allProjects} (${dir}), so there is no separate scope for ${thisProject}.`,
      noProjectScopeToMove: (dir: string) =>
        `This folder's .claude is the config folder for ${allProjects} (${dir}), so there is no separate scope for ${thisProject} to move between.`,
      notSkillFolder: (from: string) =>
        `${from} is not a skill folder (symlinks are not moved)`,
      cannotShelve: (skill: string, group: string) =>
        `Cannot move "${skill}" into the ${library} ${bundle} "${group}"`,
      alreadyExists: (to: string) => `${to} already exists; not overwriting`,
      linkNamed: (skill: string, links: string) =>
        `A ${library} link named ${skill} exists: ${links}. Unload it first.`,
      wouldShelve: (skill: string, group: string, from: string, to: string) =>
        `would move ${skill} into the ${library} ${bundle} ${group}: ${from} -> ${to}`,
      shelved: (skill: string, group: string) =>
        `moved ${skill} into the ${library} ${bundle} ${group}`,
      unshelveNeedsSkill: (target: string) =>
        `"${target}" is a ${bundle}; moving a skill out of the ${library} takes a skill name or ${bundle}/skill`,
      stillLinked: (label: string, links: string) =>
        `${label} is still linked: ${links}. Unload it first.`,
      wouldUnshelve: (label: string, dir: string, from: string, to: string) =>
        `would move ${label} out of the ${library} into ${dir}: ${from} -> ${to}`,
      unshelved: (label: string, dir: string) =>
        `moved ${label} out of the ${library} into ${dir}`,
      badSkillName: (skill: string) => `Not a usable skill name: "${skill}"`,
      isLink: (from: string, scopeName: string) =>
        `${from} is a link, not a ${scopeName} skill folder (links belong to the ${library}; unload it instead)`,
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
        `${target} is a link into the ${library}, not a skill folder for ${thisProject}. Unload it instead.`,
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
        `added ${name} to ${library} ${bundle} ${group} (${notLoaded}); load it with agentry shelf on ${group}/${name}`,
      whereProjectAgents: `${thisProject}'s .claude/agents`,
      whereClaudeMd: `${thisProject} as CLAUDE.md`,
      refusedClaudeMd: (existing: string, source: string) =>
        `refused: ${thisProject} already has ${existing}; not overwriting it. Merge ${source} into it by hand.`,
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
        `${id} is ${notAdded} ${project ? `in ${thisProject}` : "in ~/.claude/agents"}${project ? "" : `; --project removes the copy for ${thisProject}`}.`,
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
        `${name} is added to ${scope} scope.${scope === "project" ? " Claude Code asks you to approve a project server the first time it loads." : ""} ${appliesNewSessions}`,
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
        `${name} is already turned ${off} in ${thisProject}.`,
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
        `${name} is ${enable ? on : off} for ${key}. ${appliesNewSessions}`,
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
        `${selector} is a hook of plugin ${plugin}, which manages it; turn the plugin ${off} with agentry plugin disable ${plugin}.`,
      alreadyOff: (selector: string, described: string) =>
        `${selector} is already ${off} (${described}).`,
      alreadyOn: (selector: string, scope: string) =>
        `${selector} is already ${on} (${scope} settings).`,
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
        `hook ${id} is ${off} (saved in ${file}, mode 0600). Switch it back with agentry hook enable ${id}. ${appliesNewSessions}`,
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
        `${id} is ${otherProjects ? `${installed} only for other projects, so it does not load in this folder` : notInstalled}; install it with claude plugin install first.`,
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
        `No ${installed} plugin "${name}". ${capital(installed)}: ${ids || "none"}`,
      onlyOtherProjects: (id: string) =>
        `${id} is ${installed} only for other projects; run this in one of them.`,
      severalScopes: (id: string, scopes: string) =>
        `${id} is ${installed} at several scopes here (${scopes}); pick one with --scope.`,
      alreadyInstalled: (id: string, scope: string) =>
        `refused: ${id} is already ${installed} at ${scope} scope.`,
      notInstalledAt: (id: string, scope: string) =>
        `refused: ${id} is ${notInstalled} at ${scope} scope.`,
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
  // Sharing Claude user items with GitHub Copilot (copilot-share.ts). Sharing is global: it applies to all projects.
  copilot: {
    states: {
      shared: capital(shared),
      notShared: capital(notShared),
      other: "Something else is there",
      setup: "Added by setup",
      repoWins: "This repo's own wins",
    },
    kinds: { skill: "skill", agent: "agent", rule: "rule", mcp: "MCP server" },
    // What the UIs show around the share state: column, per-repo switch, signed-out note, why a row cannot be shared, preview titles.
    column: "Copilot",
    repoLabel: "Copilot in this repo",
    repoState: { on: capital(on), off: capital(off) },
    signedOut: "Not signed in to Copilot",
    whyNot: {
      projectOnly:
        "A project item: Copilot already loads this repo's own folder.",
      plugin: "A plugin item: plugin items are not shared.",
      libraryOnly: "In the library only: turn it on first.",
      setup:
        "Added by setup: remove it with setup.sh uninstall --only copilot.",
      other: "Something else is already there; agentry will not touch it.",
      repoWins:
        "This repo has its own item of that name; Copilot uses it here.",
    },
    preview: {
      share: (kind: string, name: string) =>
        `Share the ${kind} ${name} with Copilot for ${allProjects}`,
      unshare: (kind: string, name: string) =>
        `Stop sharing the ${kind} ${name} with Copilot`,
      trust: "Trust this folder in Copilot",
      untrust: "Stop trusting this folder in Copilot",
    },
    forAllProjects: `${capital(shared)} with Copilot for ${allProjects}`,
    describeShare: (kind: string, name: string, path: string) =>
      `share the ${kind} ${name} with Copilot for ${allProjects}: ${path}`,
    describeUnshare: (kind: string, name: string, path: string) =>
      `stop sharing the ${kind} ${name} with Copilot: ${path}`,
    describeRecord: (file: string) => `record what agentry shared in ${file}`,
    sharedDone: (kind: string, name: string) =>
      `${capital(shared)} the ${kind} ${name} with Copilot for ${allProjects}. Undo with agentry fix --undo.`,
    unsharedDone: (kind: string, name: string) =>
      `The ${kind} ${name} is no longer ${shared} with Copilot. Undo with agentry fix --undo.`,
    alreadyShared: (kind: string, name: string) =>
      `The ${kind} ${name} is already ${shared} with Copilot; nothing to do.`,
    alreadyNotShared: (kind: string, name: string) =>
      `The ${kind} ${name} is ${notShared} with Copilot; nothing to do.`,
    noCopilot: (dir: string) =>
      `Copilot not found (${dir} does not exist); nothing written.`,
    badName: (name: string) => `"${name}" is not a valid name.`,
    noUserSkill: (name: string, dir: string) =>
      `No skill ${name} in ${dir} (or its link is broken).`,
    kindNotYet: (kind: string) =>
      `Sharing a ${kind} with Copilot is not available yet.`,
    taken: (path: string) =>
      `${path} already exists and agentry did not create it; not touching it.`,
    sharedElsewhere: (path: string, target: string) =>
      `${path} is agentry's link to ${target}; unshare it first.`,
    changed: (path: string) =>
      `${path} changed since agentry shared it; not touching it.`,
    setupOwned: (path: string) =>
      `${path} was added by setup; remove it with setup.sh uninstall --only copilot.`,
    insideClaude: (path: string) =>
      `${path} resolves into Claude's own folder; not touching it.`,
    outsideCopilot: (path: string) =>
      `${path} is outside Copilot's folder; not touching it.`,
    missingSource: (path: string) =>
      `${path} does not exist; nothing to share.`,
    repoWins: (kind: string, name: string) =>
      `This repo has its own ${kind} ${name}; Copilot uses that one in this repo.`,
    noUserAgent: (name: string, dir: string) => `No agent ${name} in ${dir}.`,
    noUserRule: (name: string, dir: string) => `No rule ${name} in ${dir}.`,
    // A plugin or project item is not user-level: Copilot loads the repo's own folder already.
    notUserSkill: (name: string) =>
      `The skill ${name} is not a user skill. Copilot already loads this repo's .claude/skills; plugin skills are not shared.`,
    notUserAgent: (name: string) =>
      `The agent ${name} is not a user agent. Copilot already loads this repo's .claude/agents; plugin agents are not shared.`,
    repoAgent: (name: string) =>
      `This repo has its own agent ${name}; not sharing a user agent of the same name.`,
    // MCP servers (copilot-mcp.ts). Values are never quoted: only names of servers, keys, headers and variables.
    mcp: {
      noUserServer: (name: string, file: string) =>
        `No MCP server ${name} in the user servers (mcpServers) of ${file}.`,
      notUserServer: (name: string) =>
        `The MCP server ${name} is not a user server. Copilot already loads this repo's .mcp.json; project and plugin servers are not shared.`,
      notObject: (name: string) =>
        `The MCP server ${name} is not an object; nothing to share.`,
      badType: (name: string, type: string) =>
        `The MCP server ${name} has type ${type}; Copilot takes stdio (local), http and sse.`,
      noCommand: (name: string) =>
        `The MCP server ${name} has no command; nothing to share.`,
      noUrl: (name: string) =>
        `The MCP server ${name} has no url; nothing to share.`,
      badField: (name: string, field: string) =>
        `The ${field} of the MCP server ${name} is not in a shape Copilot takes; not sharing it.`,
      badKey: (name: string, key: string) =>
        `The env key ${key} of the MCP server ${name} is not a variable name, so it cannot become \${${key}}; not sharing it.`,
      withDefault: (name: string, field: string) =>
        `The ${field} of the MCP server ${name} uses \${VAR:-default}, which Copilot is not known to expand; use a plain \${VAR} first.`,
      refNotExpanded: (name: string, field: string) =>
        `The ${field} of the MCP server ${name} uses \${VAR}, which Copilot is not known to expand there; not sharing it.`,
      secretInCommand: (name: string) =>
        `The command of the MCP server ${name} looks like it holds a secret; move it to env or an argument first.`,
      secretInUrl: (name: string, part: string) =>
        `The url of the MCP server ${name} holds a secret in its ${part}; Copilot does not expand \${VAR} in a url, so it would be written as is. Move it to a header first.`,
      urlUserinfo: "user info (user:password@)",
      urlQuery: (key: string) => `query value (${key})`,
      urlPath: "path",
      urlOther: "text",
      notRegular: (file: string) =>
        `${file} is not a regular file (a link?); not touching it.`,
      notJson: (file: string) =>
        `${file} is not strict JSON with an mcpServers object; not touching it.`,
      taken: (name: string, file: string) =>
        `The MCP server ${name} already exists in ${file} and agentry did not add it; not touching it.`,
      sharedDiffers: (name: string) =>
        `agentry already shared the MCP server ${name} with other settings; unshare it first.`,
      changed: (name: string, file: string) =>
        `The MCP server ${name} in ${file} changed since agentry shared it; not touching it.`,
      setupOwned: (name: string) =>
        `The MCP server ${name} was added by setup; remove it with setup.sh uninstall --only copilot.`,
      dropped: (keys: string) =>
        `Not copied (Copilot does not take them): ${keys}.`,
      exportTitle:
        "Copilot reads these variables from its own environment; export them before you start it:",
      exportVar: (variable: string, what: string) => `  ${variable}  (${what})`,
      noVars: "No variables to export: the entry holds no values.",
      guiNote:
        "VS Code started from the Dock or Finder does not read shell rc files (~/.zshrc, ~/.bashrc); set the variables where it sees them (launchctl setenv on macOS) or start it from a terminal.",
      whatEnv: (key: string) => `env ${key}`,
      whatHeader: (header: string) => `header ${header}`,
      whatArg: (index: number, masked: string) =>
        `argument ${index}: ${masked}`,
    },
    // `agentry copilot ...` and the Copilot lines of `agentry status`.
    cli: {
      noItem: (name: string) =>
        `No skill, agent, rule or MCP server named ${name} among your Claude user items.`,
      ambiguous: (name: string, kinds: string) =>
        `${name} is more than one kind of item (${kinds}); add --kind <kind>.`,
      badKind: (kind: string) =>
        `--kind takes skill, agent, rule or mcp, not ${kind}.`,
      notFolder: (dir: string) => `Not a folder: ${dir}`,
      jsonNeedsYes: "--json needs --yes or --dry-run with this subcommand.",
      yesAndDryRun: "--yes and --dry-run cannot be used together",
      home: (dir: string, signedIn: boolean) =>
        `Copilot: ${dir} (${signedIn ? "signed in" : "not signed in"})`,
      sharedLine: (counts: {
        agents: number;
        mcp: number;
        rules: number;
        skills: number;
      }) =>
        `Shared with Copilot: ${counts.skills} skill${counts.skills === 1 ? "" : "s"}, ${counts.agents} agent${counts.agents === 1 ? "" : "s"}, ${counts.rules} rule${counts.rules === 1 ? "" : "s"}, ${counts.mcp} MCP server${counts.mcp === 1 ? "" : "s"}`,
      noItems: "No Claude user skills, agents, rules or MCP servers found.",
    },
    trust: {
      explain: "Lets Copilot run this repo's hooks and MCP servers.",
      title: "Trust this folder",
      untrustTitle: "Stop trusting this folder",
      describe: (dir: string, file: string) =>
        `trust the folder ${dir} in ${file}`,
      describeUntrust: (dir: string, file: string) =>
        `stop trusting the folder ${dir} in ${file}`,
      done: (dir: string) =>
        `Copilot now trusts ${dir}. Undo with agentry fix --undo.`,
      undone: (dir: string) =>
        `Copilot no longer trusts ${dir}. Undo with agentry fix --undo.`,
      already: (dir: string) => `Copilot already trusts ${dir}; nothing to do.`,
      alreadyNot: (dir: string) =>
        `${dir} is not in Copilot's trusted folders; nothing to do.`,
      noConfig: (file: string) =>
        `${file} does not exist; start Copilot once, then try again.`,
      running:
        "Copilot is running; quit it first so it does not overwrite the change.",
      parentTrusted: (dir: string, parent: string) =>
        `${dir} stays trusted: its parent ${parent} is trusted too.`,
      parentAlready: (dir: string, parent: string) =>
        `${parent} already trusts ${dir}; nothing to do.`,
      unreadable: (file: string, why: string) =>
        `${file} could not be edited safely (${why}); not touching it.`,
    },
  },
};
