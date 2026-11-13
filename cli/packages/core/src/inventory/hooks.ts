// Lists every hook a Claude Code session in a folder would run: user, project and local settings plus enabled plugins.
// Hooks merge, so each one is reported with its event, matcher, command and owner. Hook output is not measurable offline.
// Sources and shapes: cli/docs/claude-config-sources.md ("Hooks"). Commands are masked before they leave this module.

import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { maskShell } from "../mask.js";
import type { Paths } from "../paths.js";
import type {
  HookEntry,
  HookGroup,
  HookItem,
  HookState,
  PluginManifest,
  ReadError,
} from "../types.js";
import {
  isObject,
  isTrusted,
  list,
  readJson,
  settingsLayers,
  uniqueErrors,
} from "./common.js";
import { createPluginsReader } from "./plugins.js";

// The stable selector of a hook: a short hash of its event, its group's matcher and the raw hook entry (so the command, not
// its masked form). Same hook in two scopes → same id; `agentry hook` then asks for --scope.
export const hookId = (
  event: string,
  groupMatcher: unknown,
  hook: unknown
): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        event,
        typeof groupMatcher === "string" ? groupMatcher : "",
        hook,
      ])
    )
    .digest("hex")
    .slice(0, 8);

export interface HooksResult {
  disableAllHooks: boolean;
  errors: ReadError[];
  hooks: HookItem[];
  trusted: boolean;
}

// Where a group of hooks came from; `state` overrides "active" (untrusted project, disabled plugin).
interface HookMeta {
  plugin?: string;
  scope: HookItem["scope"];
  source: string;
  state?: HookState;
}

export const createHooksReader = (
  paths: Pick<
    Paths,
    "configDir" | "projectRoot" | "repoKey" | "pluginsDir" | "claudeJson"
  >
) => {
  const pluginsReader = createPluginsReader(paths);

  const read = ({
    cwd = process.cwd(),
  }: {
    cwd?: string;
  } = {}): HooksResult => {
    const errors: ReadError[] = [];
    const hooks: HookItem[] = [];
    const layers = settingsLayers(paths, cwd, errors);
    const trusted = isTrusted(paths, cwd, errors);
    const disableAll = layers.reduce<boolean>(
      (value, { json }) =>
        typeof json.disableAllHooks === "boolean"
          ? json.disableAllHooks
          : value,
      false
    );

    // `{ hooks: { Event: [...] } }`; some plugin hooks.json files omit the outer key.
    const addFrom = (json: unknown, meta: HookMeta, root?: string): void => {
      const events =
        isObject(json) && isObject(json.hooks)
          ? json.hooks
          : isObject(json) && !("hooks" in json)
            ? json
            : {};
      for (const [event, groups] of Object.entries(events)) {
        for (const rawGroup of list(groups)) {
          const group = (isObject(rawGroup) ? rawGroup : {}) as HookGroup;
          for (const rawHook of list(group.hooks)) {
            if (!isObject(rawHook)) {
              continue;
            }
            const hook = rawHook as HookEntry;
            const command =
              typeof hook.command === "string"
                ? maskShell(
                    root
                      ? hook.command.replaceAll("${CLAUDE_PLUGIN_ROOT}", root)
                      : hook.command
                  )
                : undefined;
            hooks.push({
              id: hookId(event, group.matcher, hook),
              event,
              matcher:
                typeof group.matcher === "string" && group.matcher !== ""
                  ? group.matcher
                  : "*",
              type: hook.type ?? "command",
              ...(command === undefined ? {} : { command }),
              scope: meta.scope,
              source: meta.source,
              ...(meta.plugin ? { plugin: meta.plugin } : {}),
              state: disableAll ? "disabled" : (meta.state ?? "active"),
            });
          }
        }
      }
    };

    for (const { scope, source, json } of layers) {
      // Project hooks run only in trusted folders (docs: glossary).
      addFrom(json, {
        scope,
        source,
        state: scope !== "user" && !trusted ? "untrusted" : "active",
      });
    }

    const pluginResult = pluginsReader.read({ cwd });
    errors.push(...pluginResult.errors);
    for (const plugin of pluginResult.plugins) {
      if (!plugin.installPath) {
        continue;
      }
      const meta = (source: string): HookMeta => ({
        scope: "plugin",
        source,
        plugin: plugin.id,
        state: plugin.state,
      });
      const manifest: PluginManifest = plugin.manifestFile
        ? (readJson<PluginManifest>(plugin.manifestFile, errors) ?? {})
        : {};
      const files = new Set([join(plugin.installPath, "hooks", "hooks.json")]);
      const inline: Record<string, unknown>[] = [];
      for (const item of typeof manifest.hooks === "string"
        ? [manifest.hooks]
        : list(manifest.hooks).length > 0
          ? (manifest.hooks as unknown[])
          : [manifest.hooks]) {
        if (typeof item === "string") {
          files.add(resolve(plugin.installPath, item));
        } else if (isObject(item)) {
          inline.push(item);
        }
      }
      for (const item of inline) {
        addFrom(item, meta(plugin.manifestFile ?? ""), plugin.installPath);
      }
      for (const file of files) {
        addFrom(readJson(file, errors), meta(file), plugin.installPath);
      }
    }
    errors.splice(0, errors.length, ...uniqueErrors(errors));
    return { hooks, disableAllHooks: disableAll, trusted, errors };
  };

  return { read };
};
