// Helpers shared by the inventory readers: safe JSON reads and the settings files a session in a folder loads.
// Settings locations and precedence: cli/docs/claude-config-sources.md ("Settings and env").

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Paths } from "../paths.js";
import type {
  ClaudeJson,
  ReadError,
  SettingsJson,
  SettingsLayer,
} from "../types.js";

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

// Node's JSON.parse message quotes the file's text, which may hold a secret, so it is never passed on.
// `T` is what the caller expects to find; the parsed value is not validated against it, so narrow with isObject/list.
export const readJson = <T = unknown>(
  file: string,
  errors: ReadError[]
): T | undefined => {
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    errors.push({
      source: file,
      message:
        error instanceof SyntaxError
          ? "invalid JSON"
          : `unreadable (${(error as NodeJS.ErrnoException).code ?? "error"})`,
    });
    return undefined;
  }
};

// Removes // and /* */ comments outside strings, and a comma before } or ].
const stripJsonc = (text: string): string => {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        j += text[j] === "\\" ? 2 : 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      if (ch === "}" || ch === "]") {
        out = out.replace(/,(\s*)$/, "$1");
      }
      out += ch;
      i += 1;
    }
  }
  return out;
};

// Like readJson for a file that may hold comments and trailing commas (Copilot's config.json). Read-only: never write it back.
export const readJsonc = <T = unknown>(
  file: string,
  errors: ReadError[]
): T | undefined => {
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    return JSON.parse(stripJsonc(readFileSync(file, "utf8")));
  } catch (error) {
    errors.push({
      source: file,
      message:
        error instanceof SyntaxError
          ? "invalid JSON"
          : `unreadable (${(error as NodeJS.ErrnoException).code ?? "error"})`,
    });
    return undefined;
  }
};

// The folders a session started in `cwd` reads project settings from: the working-tree root and `cwd` itself.
// Which of the two Claude Code really uses for hooks and enabledPlugins is unverified; both are read.
export const projectDirs = (
  paths: Pick<Paths, "projectRoot">,
  cwd: string
): string[] => [...new Set([paths.projectRoot(resolve(cwd)), resolve(cwd)])];

// Settings files that exist, lowest precedence first: user, project, local (later wins for scalars and per-key maps).
export const settingsLayers = (
  paths: Pick<Paths, "configDir" | "projectRoot">,
  cwd: string,
  errors: ReadError[]
): SettingsLayer[] => {
  const layers: SettingsLayer[] = [];
  const add = (scope: SettingsLayer["scope"], file: string): void => {
    const json = readJson(file, errors);
    if (json !== undefined) {
      layers.push({
        scope,
        source: file,
        json: isObject(json) ? (json as SettingsJson) : {},
      });
    }
  };
  add("user", join(paths.configDir, "settings.json"));
  const dirs = projectDirs(paths, cwd);
  for (const dir of dirs) {
    add("project", join(dir, ".claude", "settings.json"));
  }
  for (const dir of dirs) {
    add("local", join(dir, ".claude", "settings.local.json"));
  }
  return layers;
};

// The project's entry in .claude.json (keyed by the main checkout root) tells whether the folder is trusted.
export const isTrusted = (
  paths: Pick<Paths, "claudeJson" | "repoKey">,
  cwd: string,
  errors: ReadError[]
): boolean => {
  const project = readJson<ClaudeJson>(paths.claudeJson, errors)?.projects?.[
    paths.repoKey(resolve(cwd))
  ];
  return isObject(project) && project.hasTrustDialogAccepted === true;
};

// Readers that share settings files hit the same unreadable file more than once; report it once.
export const uniqueErrors = (errors: ReadError[]): ReadError[] =>
  errors.filter(
    (error, index) =>
      errors.findIndex(
        (other) =>
          other.source === error.source && other.message === error.message
      ) === index
  );
