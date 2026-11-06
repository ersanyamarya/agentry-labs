// `agentry plugin enable|disable <name>`: flips the plugin's `enabledPlugins` entry in the settings file of the right scope.
// It edits the file text with lib/json-edit.mjs (formatting stays) and runs the edit through the fix engine (lib/fix.mjs),
// so the preview is the engine's masked diff, a backup set is written first, and `agentry fix --undo` restores it.
// Why files and not `claude plugin enable|disable`: that command picks its scope by "auto-detect" and runs a process the
// engine cannot back up or preview, while the settings file is what the Plugins reader (and Claude Code) read anyway.
// Scopes: user <config>/settings.json, project <repo>/.claude/settings.json, local <repo>/.claude/settings.local.json;
// local > project > user. Without --scope the file of the layer that decides today is edited, else the install scope's.
// Refused (exit 1, nothing written): not installed or not installed for this folder, managed settings name the plugin,
// or a higher scope also names it (the edit would be overridden); macOS MDM (`com.anthropic.claudecode`) counts as managed. Exit 2: ambiguous bare name. The change applies to
// sessions started afterwards.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createFix } from "./fix.js";
import { isObject, readJson, settingsLayers } from "./inventory/common.js";
import { createPluginsReader } from "./inventory/plugins.js";
import { createJsonEdit } from "./json-edit.js";
import type { Paths } from "./paths.js";
import type {
  DoctorLike,
  Finding,
  FixOptions,
  FixRegistry,
  ReadError,
  Scope,
  SettingsJson,
} from "./types.js";

export const SCOPES: Scope[] = ["user", "project", "local"];

const isScope = (value: unknown): value is Scope =>
  SCOPES.includes(value as Scope);
export const APPLIES_NOTE =
  "Applies to sessions started after this; a running session keeps its plugins until restarted.";

const RULE = "plugin-toggle";
export const MDM_DOMAIN = "com.anthropic.claudecode";

// macOS MDM / configuration profile: the `com.anthropic.claudecode` managed preferences domain holds the same top-level keys
// as managed-settings.json (nested settings are dictionaries). `defaults read <domain> enabledPlugins` prints the old-style
// plist text, one `"id" = 1;` line per plugin; nothing printed (domain or key missing, or not macOS) means no MDM policy.
export type ReadDefaults = (domain: string, key: string) => string | undefined;

export const defaultReadDefaults: ReadDefaults = (domain, key) => {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    return execFileSync("defaults", ["read", domain, key], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {}
};

// The settings file of a scope: user <config>/settings.json, project <repo>/.claude/settings.json, local .../settings.local.json.
export const scopeSettingsFile = (
  paths: Pick<Paths, "configDir" | "projectRoot">,
  scope: Scope,
  cwd: string
): string =>
  scope === "user"
    ? join(paths.configDir, "settings.json")
    : join(
        paths.projectRoot(cwd),
        ".claude",
        scope === "project" ? "settings.json" : "settings.local.json"
      );

export interface PluginToggleOptions extends FixOptions {
  readDefaults?: ReadDefaults;
}

export interface ToggleArgs {
  dryRun?: boolean;
  enable: boolean;
  name: string;
  path?: string;
  scope?: string;
  yes?: boolean;
}

/** What `inspect` found: a refusal (with exit code), or where the edit goes (`already` is set when nothing needs changing). */
export type Inspected =
  | { refusal: string; code: number; already?: undefined }
  | {
      id: string;
      enable: boolean;
      scope: Scope;
      file: string;
      cwd: string;
      already?: string;
    };

export const createPluginToggle = (
  paths: Paths,
  {
    out = console.log,
    err = console.error,
    readDefaults = defaultReadDefaults,
    ...fixOptions
  }: PluginToggleOptions = {}
) => {
  const reader = createPluginsReader(paths);
  const tilde = (text: unknown): string =>
    paths.home ? String(text).replaceAll(`${paths.home}/`, "~/") : String(text);

  const managedFiles = () => {
    const dir = paths.managedDir;
    const dropIns = existsSync(join(dir, "managed-settings.d"))
      ? readdirSync(join(dir, "managed-settings.d"))
          .filter((name) => name.endsWith(".json"))
          .sort()
      : [];
    return [
      join(dir, "managed-settings.json"),
      ...dropIns.map((name) => join(dir, "managed-settings.d", name)),
    ];
  };

  // True when the MDM domain's enabledPlugins names the plugin id (as a quoted or bare dictionary key).
  const mdmNames = (id: string): boolean => {
    const text = readDefaults(MDM_DOMAIN, "enabledPlugins");
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      typeof text === "string" &&
      new RegExp(`^\\s*"?${escaped}"?\\s*=`, "m").test(text)
    );
  };

  const settingsFile = (scope: Scope, cwd: string): string =>
    scopeSettingsFile(paths, scope, cwd);

  // Everything that decides whether and where the edit can happen. → { id, enable, scope, file, already?, refusal?, code? }
  const inspect = ({
    name,
    enable,
    scope,
    path,
  }: Pick<ToggleArgs, "name" | "enable" | "scope" | "path">): Inspected => {
    const cwd = resolve(path ?? process.cwd());
    const refuse = (
      refusal: string,
      code = 1
    ): { refusal: string; code: number } => ({ refusal, code });
    if (scope !== undefined && !isScope(scope)) {
      return refuse(`--scope must be one of ${SCOPES.join(", ")}`, 2);
    }
    const errors: ReadError[] = [];
    const { plugins } = reader.read({ cwd });
    const matches = plugins.filter(
      (plugin) =>
        plugin.id === name || (!name.includes("@") && plugin.name === name)
    );
    if (matches.length === 0) {
      return refuse(
        `No plugin "${name}". Plugins: ${plugins.map((plugin) => plugin.id).join(", ") || "none"}`
      );
    }
    if (matches.length > 1) {
      return refuse(
        `"${name}" matches several plugins: ${matches.map((plugin) => plugin.id).join(", ")}. Use name@marketplace.`,
        2
      );
    }
    const [plugin] = matches;
    const verb = enable ? "enabled" : "disabled";
    if (plugin.state === "not-here" || plugin.state === "not-installed") {
      return refuse(
        `${plugin.id} is ${plugin.state === "not-here" ? "installed only for other projects, so it does not load in this folder" : "not installed"}; install it with claude plugin install first.`
      );
    }
    if (mdmNames(plugin.id)) {
      return refuse(
        `${plugin.id} is set by macOS MDM managed settings (${MDM_DOMAIN}), which this tool cannot change.`
      );
    }
    for (const file of managedFiles()) {
      const enabledPlugins = readJson<SettingsJson>(
        file,
        errors
      )?.enabledPlugins;
      if (isObject(enabledPlugins) && enabledPlugins[plugin.id] !== undefined) {
        return refuse(
          `${plugin.id} is set by managed settings (${tilde(file)}), which this tool cannot change.`
        );
      }
    }
    const named = settingsLayers(paths, cwd, errors)
      .filter(
        (layer) =>
          isObject(layer.json.enabledPlugins) &&
          layer.json.enabledPlugins[plugin.id] !== undefined
      )
      .map((layer) => ({
        scope: layer.scope,
        source: layer.source,
        value: layer.json.enabledPlugins?.[plugin.id] !== false,
      }));
    const chosen =
      scope ??
      named.at(-1)?.scope ??
      (isScope(plugin.installScope) ? plugin.installScope : "user");
    const higher = named.filter(
      (layer) => SCOPES.indexOf(layer.scope) > SCOPES.indexOf(chosen)
    );
    const top = higher.at(-1);
    if (top) {
      return refuse(
        `${top.scope} settings (${tilde(top.source)}) also set ${plugin.id} and win over ${chosen}; use --scope ${top.scope}.`
      );
    }
    const file =
      named.findLast((layer) => layer.scope === chosen)?.source ??
      settingsFile(chosen, cwd);
    if (!existsSync(dirname(file))) {
      return refuse(
        `${tilde(dirname(file))} does not exist, so ${chosen} settings cannot be created there.`
      );
    }
    const base = { id: plugin.id, enable, scope: chosen, file, cwd };
    if ((plugin.state === "active") === enable) {
      return {
        ...base,
        already: `${plugin.id} is already ${verb}${plugin.enabledBy.scope === "default" ? " (by default)" : ` (${plugin.enabledBy.scope} settings)`}.`,
      };
    }
    return base;
  };

  // The text after setting enabledPlugins[id]; a missing or empty file gets a fresh one with a tab indent.
  const editText = (
    text: string | undefined,
    id: string,
    enable: boolean
  ): string => {
    if (text === undefined || text.trim() === "") {
      return `${JSON.stringify({ enabledPlugins: { [id]: enable } }, null, "\t")}\n`;
    }
    const doc = createJsonEdit(text);
    if (doc.get(["enabledPlugins"]) === undefined) {
      doc.set(["enabledPlugins"], { [id]: enable });
    } else {
      doc.set(["enabledPlugins", id], enable);
    }
    return doc.text;
  };

  const run = async ({
    name,
    enable,
    scope,
    path,
    yes = false,
    dryRun = false,
  }: ToggleArgs): Promise<number> => {
    const found = inspect({ name, enable, scope, path });
    if ("refusal" in found) {
      err(`refused: ${found.refusal}`);
      return found.code;
    }
    if (found.already) {
      out(found.already);
      return 0;
    }
    const { id, file, cwd } = found;
    const message = `${id} should be ${enable ? "enabled" : "disabled"}`;
    const finding: Finding = { id: RULE, severity: "info", message, file };
    // A stand-in for doctor: reports the one finding until the plugin reads back in the wanted state.
    const doctor = (): DoctorLike => ({
      collect: () => ({
        project: { cwd, root: paths.projectRoot(cwd) },
        findings: inspect({ name: id, enable, scope: found.scope, path: cwd })
          .already
          ? []
          : [finding],
        errors: [],
      }),
    });
    const fixes: FixRegistry = {
      [RULE]: () => ({
        ruleId: RULE,
        file,
        describe: () =>
          `${enable ? "Enable" : "Disable"} ${id} in ${found.scope} settings`,
        apply: (text: string | undefined) => editText(text, id, enable),
      }),
    };
    const code = await createFix(paths, {
      out,
      err,
      doctor,
      fixes,
      ...fixOptions,
    }).run({ path: cwd, yes, dryRun });
    if (code === 0) {
      out(APPLIES_NOTE);
    }
    return code;
  };

  return { inspect, run };
};
