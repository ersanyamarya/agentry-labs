// Lists the skills a Claude Code session in a folder loads: personal, project, shelf links and plugin skills.
// Each is a real folder (file), a symlink, or a broken link. Sources: docs/claude-config-sources.md ("Skills").
// Which folders count for project skills (start folder, git root, nested) is unverified; the start folder and the working-tree root are read.

import {
  existsSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Paths } from "../paths.js";
import { descriptionTokens } from "../tokens.js";
import type {
  PluginManifest,
  ReadError,
  SkillItem,
  SkillKind,
  SkillState,
  SkippedSkills,
} from "../types.js";
import { list, projectDirs, readJson, uniqueErrors } from "./common.js";
import { createPluginsReader } from "./plugins.js";

const subdirs = (dir: string): string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

export interface SkillsResult {
  errors: ReadError[];
  skills: SkillItem[];
  skipped: SkippedSkills[];
}

interface SkillFolder {
  kind: SkillKind;
  shelfGroup?: string;
  target?: string;
}

export const createSkillsReader = (
  paths: Pick<
    Paths,
    "configDir" | "projectRoot" | "repoKey" | "pluginsDir" | "shelfDir"
  >
) => {
  const pluginsReader = createPluginsReader(paths);

  // One skill folder entry: kind says what is on disk; a link whose target is gone, or a folder without SKILL.md, is broken.
  const inspect = (path: string): SkillFolder | undefined => {
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(path);
    } catch {
      return undefined;
    }
    const symlink = stat.isSymbolicLink();
    if (!(symlink || stat.isDirectory())) {
      return undefined;
    }
    const info: SkillFolder = { kind: symlink ? "symlink" : "file" };
    if (symlink) {
      info.target = resolve(dirname(path), readlinkSync(path));
      const underShelf =
        info.target === paths.shelfDir ||
        info.target.startsWith(paths.shelfDir + sep);
      if (underShelf) {
        info.shelfGroup = relative(paths.shelfDir, info.target).split(sep)[0];
      }
    }
    const valid =
      existsSync(join(path, "SKILL.md")) &&
      (!symlink || statSync(path, { throwIfNoEntry: false })?.isDirectory());
    if (!valid) {
      info.kind = "broken";
    }
    return info;
  };

  const read = ({
    cwd = process.cwd(),
  }: {
    cwd?: string;
  } = {}): SkillsResult => {
    const errors: ReadError[] = [];
    const skills: SkillItem[] = [];
    const skipped: SkippedSkills[] = [];

    const addFolder = (
      dir: string,
      meta: { scope: SkillItem["scope"]; plugin?: string; state?: SkillState },
      prefix = ""
    ): void => {
      for (const name of subdirs(dir)) {
        if (meta.scope === "user" && name === "synced") {
          skipped.push({
            path: join(dir, name),
            reason: "managed by claude.ai",
            count: subdirs(join(dir, name)).length,
          });
          continue;
        }
        const info = inspect(join(dir, name));
        if (!info) {
          continue;
        }
        const file = join(dir, name, "SKILL.md");
        skills.push({
          name: prefix + name,
          scope: meta.scope,
          source: join(dir, name),
          ...info,
          state: info.kind === "broken" ? "broken" : (meta.state ?? "active"),
          tokens: info.kind === "broken" ? null : descriptionTokens(file),
          ...(meta.plugin ? { plugin: meta.plugin } : {}),
        });
      }
    };

    addFolder(join(paths.configDir, "skills"), { scope: "user" });
    const seen = new Set<string>();
    for (const dir of projectDirs(paths, cwd)) {
      const skillsDir = join(dir, ".claude", "skills");
      if (!seen.has(skillsDir)) {
        seen.add(skillsDir);
        addFolder(skillsDir, { scope: "project" });
      }
    }

    const pluginResult = pluginsReader.read({ cwd });
    errors.push(...pluginResult.errors);
    for (const plugin of pluginResult.plugins) {
      if (!plugin.installPath) {
        continue;
      }
      const manifest: PluginManifest = plugin.manifestFile
        ? (readJson<PluginManifest>(plugin.manifestFile, errors) ?? {})
        : {};
      const extra = (
        typeof manifest.skills === "string"
          ? [manifest.skills]
          : list(manifest.skills)
      ).filter((item): item is string => typeof item === "string");
      const { installPath } = plugin;
      const dirs = new Set([
        join(installPath, "skills"),
        ...extra.map((item) => resolve(installPath, item)),
      ]);
      for (const dir of dirs) {
        addFolder(
          dir,
          { scope: "plugin", plugin: plugin.id, state: plugin.state },
          `${plugin.name}:`
        );
      }
    }
    return { skills, skipped, errors: uniqueErrors(errors) };
  };

  return { read };
};
