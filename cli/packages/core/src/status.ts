// `agentry status`: what a Claude Code session in a folder loads (skills, MCP servers, hooks, plugins), where each comes
// from and what it costs. Costs are measured only where they can be read offline: a skill's description. MCP tool lists
// and hook output are reported as not measured (null), never guessed.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { uniqueErrors } from "./inventory/common.js";
import { createCopilotReader } from "./inventory/copilot.js";
import { createHooksReader } from "./inventory/hooks.js";
import { createMcpReader } from "./inventory/mcp.js";
import { createPluginsReader } from "./inventory/plugins.js";
import { createSkillsReader } from "./inventory/skills.js";
import type { Paths } from "./paths.js";
import type {
  CopilotInventory,
  CopilotStatus,
  HookItem,
  MarketplaceItem,
  McpServerItem,
  PluginItem,
  ReadError,
  SkillItem,
  SkippedSkills,
} from "./types.js";

const NOT_MEASURED = ["MCP tool lists", "hook output"];

const clip = (text: string): string =>
  text.length > 110 ? `${text.slice(0, 107)}...` : text;

const withoutErrors = ({
  errors: _errors,
  ...rest
}: CopilotInventory): Omit<CopilotInventory, "errors"> => rest;

const loads = (skill: SkillItem): boolean => skill.state === "active";

/** The `agentry status --json` document. */
export interface StatusData {
  /** What Copilot loads here; null when there is no Copilot home. */
  copilot: CopilotStatus | null;
  errors: ReadError[];
  hooks: { items: (HookItem & { tokens: null })[]; disableAllHooks: boolean };
  mcp: { servers: (McpServerItem & { tokens: null })[] };
  plugins: {
    items: (PluginItem & { skillTokens: number })[];
    marketplaces: MarketplaceItem[];
  };
  project: { cwd: string; root: string; repoKey: string; trusted: boolean };
  skills: { items: SkillItem[]; skipped: SkippedSkills[] };
  tokens: { measured: number; unit: string; notMeasured: string[] };
  version: 1;
}

export interface StatusOptions {
  err?: (text: string) => void;
  out?: (text: string) => void;
  platform?: NodeJS.Platform;
}

export const createStatus = (
  paths: Paths,
  {
    out = console.log,
    err = console.error,
    platform = process.platform,
  }: StatusOptions = {}
) => {
  const skillsReader = createSkillsReader(paths);
  const mcpReader = createMcpReader(paths, { platform });
  const hooksReader = createHooksReader(paths);
  const pluginsReader = createPluginsReader(paths);
  const copilotReader = createCopilotReader(paths);

  const collect = (cwd: string = process.cwd()): StatusData => {
    const start = resolve(cwd);
    const skillResult = skillsReader.read({ cwd: start });
    const mcpResult = mcpReader.read({ cwd: start });
    const hookResult = hooksReader.read({ cwd: start });
    const pluginResult = pluginsReader.read({ cwd: start });
    const copilotResult = copilotReader.read({ cwd: start });

    const skillTokens = skillResult.skills
      .filter(loads)
      .reduce((total, skill) => total + (skill.tokens ?? 0), 0);
    const plugins = pluginResult.plugins.map((plugin) => ({
      ...plugin,
      skillTokens: skillResult.skills
        .filter((skill) => skill.plugin === plugin.id && loads(skill))
        .reduce((total, skill) => total + (skill.tokens ?? 0), 0),
    }));
    const errors = uniqueErrors([
      ...skillResult.errors,
      ...mcpResult.errors,
      ...hookResult.errors,
      ...pluginResult.errors,
      ...(copilotResult.present ? copilotResult.errors : []),
    ]);

    return {
      version: 1,
      project: {
        cwd: start,
        root: paths.projectRoot(start),
        repoKey: paths.repoKey(start),
        trusted: hookResult.trusted,
      },
      skills: { items: skillResult.skills, skipped: skillResult.skipped },
      mcp: {
        servers: mcpResult.servers.map((server) => ({
          ...server,
          tokens: null,
        })),
      },
      hooks: {
        items: hookResult.hooks.map((hook) => ({ ...hook, tokens: null })),
        disableAllHooks: hookResult.disableAllHooks,
      },
      plugins: { items: plugins, marketplaces: pluginResult.marketplaces },
      tokens: {
        measured: skillTokens,
        unit: "estimated tokens (characters / 4) of skill descriptions",
        notMeasured: NOT_MEASURED,
      },
      errors,
      copilot: copilotResult.present
        ? { home: paths.copilotDir, ...withoutErrors(copilotResult) }
        : null,
    };
  };

  const printHuman = (data: StatusData): void => {
    const tilde = (path: string): string =>
      paths.home && path.startsWith(`${paths.home}/`)
        ? `~${path.slice(paths.home.length)}`
        : path;
    const { skills, mcp, hooks, plugins, tokens } = data;
    out(
      `Project: ${tilde(data.project.cwd)}${data.project.trusted ? "" : " (not trusted: project hooks and approvals do not apply)"}`
    );

    const own = skills.items.filter((skill) => skill.scope !== "plugin");
    out(
      `\nSkills: ${skills.items.length} (~${tokens.measured} tokens in every session)`
    );
    for (const skill of own) {
      const detail =
        skill.kind === "file"
          ? ""
          : skill.kind === "broken"
            ? ` BROKEN link to ${tilde(skill.target ?? skill.source)}`
            : ` -> ${skill.shelfGroup ? `shelf/${skill.shelfGroup}` : tilde(skill.target as string)}`;
      out(
        `  ${skill.name}  [${skill.scope}]  ${skill.tokens === null ? "-" : `~${skill.tokens}`}  ${tilde(skill.source)}${detail}`
      );
    }
    for (const plugin of plugins.items) {
      const mine = skills.items.filter((skill) => skill.plugin === plugin.id);
      if (mine.length > 0) {
        out(
          `  ${plugin.name}:* (${mine.length} skills, ${plugin.state})  ~${plugin.skillTokens}  ${tilde(plugin.installPath as string)}/skills`
        );
      }
    }
    for (const skipped of skills.skipped) {
      out(
        `  (skipped ${tilde(skipped.path)}: ${skipped.reason}, ${skipped.count} entries)`
      );
    }

    out(`\nMCP servers: ${mcp.servers.length} (tool lists not measured)`);
    for (const server of mcp.servers) {
      const target =
        server.url ?? [server.command, ...(server.args ?? [])].join(" ");
      out(
        `  ${server.name}  [${server.scope}, ${server.state}]  ${server.transport}  ${target}`
      );
      out(`    ${tilde(server.source)}`);
    }

    out(
      `\nHooks: ${hooks.items.length} (output not measured${hooks.disableAllHooks ? "; disableAllHooks is on" : ""})`
    );
    for (const hook of hooks.items) {
      out(
        `  ${hook.event}  ${hook.matcher}  [${hook.scope}${hook.plugin ? `: ${hook.plugin}` : ""}, ${hook.state}]  ${clip(hook.command ?? `(${hook.type})`)}`
      );
      out(`    ${tilde(hook.source)}`);
    }

    out(`\nPlugins: ${plugins.items.length}`);
    for (const plugin of plugins.items) {
      const where = plugin.installs
        .map(
          (install) =>
            `${install.scope}${install.projectPath ? ` ${tilde(install.projectPath)}` : ""}${install.appliesHere ? "" : " (other project)"}`
        )
        .join(", ");
      out(
        `  ${plugin.id}  ${plugin.version ?? ""}  [${plugin.state}]  ${where || "not installed"}`
      );
      out(`    ${tilde(plugin.installPath ?? plugin.enabledBy.source)}`);
    }
    if (plugins.marketplaces.length > 0) {
      out(
        `  Marketplaces: ${plugins.marketplaces.map((market) => `${market.name} (${market.source})`).join(", ")}`
      );
    }

    const { copilot } = data;
    if (copilot) {
      const names = (items: { name: string }[]): string =>
        items.map((item) => item.name).join(", ");
      out(
        `\nCopilot: ${tilde(copilot.home)}${copilot.trusted ? "" : " (folder not trusted: repo MCP servers and hooks do not load)"}`
      );
      out(
        `  Skills: ${copilot.skills.length}${copilot.skills.length > 0 ? ` (${names(copilot.skills)})` : ""}`
      );
      for (const skill of copilot.skills.filter(
        (item) => item.state === "broken"
      )) {
        out(`    BROKEN ${skill.name}: ${tilde(skill.target ?? skill.source)}`);
      }
      out(`  Instructions: ${copilot.instructions.length}`);
      for (const item of copilot.instructions) {
        out(
          `    ${tilde(item.file)}${item.applyTo ? `  applyTo ${item.applyTo}` : ""}`
        );
      }
      out(`  Hooks: ${copilot.hooks.length}`);
      for (const hook of copilot.hooks) {
        out(
          `    ${hook.event}  [${hook.scope}]  ${clip(hook.command ?? "(no command)")}`
        );
      }
      out(
        `  MCP servers: ${copilot.mcp.length}${copilot.mcp.length > 0 ? ` (${names(copilot.mcp)})` : ""}`
      );
      for (const server of copilot.mcp) {
        const target =
          server.url ?? [server.command, ...(server.args ?? [])].join(" ");
        out(
          `    ${server.name}  [${server.scope}${server.disabled ? ", disabled" : ""}]  ${server.transport}  ${target}`
        );
      }
      out(
        `  Agents: ${copilot.agents.length}${copilot.agents.length > 0 ? ` (${names(copilot.agents)})` : ""}`
      );
      out(
        `  Co-authored-by trailer: ${copilot.includeCoAuthoredBy ? "on" : "off"}`
      );
    }

    out(
      `\nMeasured: ~${tokens.measured} tokens (skill descriptions). Not measured: ${tokens.notMeasured.join(", ")}.`
    );
    for (const error of data.errors) {
      out(`warning: ${tilde(error.source)}: ${error.message}`);
    }
  };

  // Returns the exit code.
  const run = ({
    path,
    json = false,
  }: {
    path?: string;
    json?: boolean;
  } = {}): number => {
    const cwd = resolve(path ?? process.cwd());
    if (!(existsSync(cwd) && statSync(cwd).isDirectory())) {
      err(`Not a folder: ${cwd}`);
      return 1;
    }
    const data = collect(cwd);
    if (json) {
      out(JSON.stringify(data, null, 2));
    } else {
      printHuman(data);
    }
    return 0;
  };

  return { collect, run };
};
