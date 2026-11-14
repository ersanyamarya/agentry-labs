// The subagents Claude Code can start, one markdown file each (name, description, optional model and tools in the
// frontmatter).
//   user:    ~/.claude/agents/**/*.md
//   project: <root>/.claude/agents/**/*.md
// The token cost is the name and description, which Claude lists in every session; the body loads only when the agent
// runs. Read-only: install or remove agents with `agentry catalog add|remove agent/<name>`. Agents that plugins ship are
// not listed yet.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Paths } from "./paths.js";
import { estimateTokens } from "./tokens.js";

export interface AgentEntry {
  bytes: number;
  description: string;
  id: string;
  label: string;
  model?: string;
  name: string;
  path: string;
  scope: "user" | "project";
  tokens: number;
  tools?: string;
}

export interface AgentsOptions {
  out?: (text: string) => void;
}

const markdownIn = (dir: string, depth = 0): string[] => {
  if (!existsSync(dir) || depth > 3) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? markdownIn(join(dir, entry.name), depth + 1)
        : entry.name.endsWith(".md")
          ? [join(dir, entry.name)]
          : []
    );
};

const unquote = (value: string): string =>
  value.replace(/^(["'])(.*)\1$/, "$2").trim();

// The frontmatter's top-level `key: value` lines. A list written over several lines (`- item`) is joined with commas;
// `[a, b]` loses its brackets. Anything the file does not say is left out.
export const frontmatter = (
  text: string
): Record<string, string | undefined> => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }
  const fields: Record<string, string | undefined> = {};
  let key = "";
  for (const line of (match[1] as string).split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (pair) {
      key = pair[1] as string;
      const value = (pair[2] as string).trim();
      fields[key] = unquote(value.replace(/^\[(.*)\]$/, "$1"));
    } else if (key && /^\s+-\s+/.test(line)) {
      const item = unquote(line.replace(/^\s+-\s+/, ""));
      fields[key] = fields[key] ? `${fields[key]}, ${item}` : item;
    }
  }
  return fields;
};

export const createAgents = (
  paths: Paths,
  { out = console.log }: AgentsOptions = {}
) => {
  const tilde = (text: string): string =>
    paths.home ? text.replaceAll(`${paths.home}/`, "~/") : text;

  // User agents, then this project's; only files that exist.
  const entries = (): AgentEntry[] => {
    const root = paths.projectRoot();
    const sets: ["user" | "project", string][] = [
      ["user", join(paths.configDir, "agents")],
      ["project", join(root, ".claude", "agents")],
    ];
    return sets.flatMap(([scope, dir]) =>
      markdownIn(dir).map((file): AgentEntry => {
        const text = readFileSync(file, "utf8");
        const fields = frontmatter(text);
        const inside = relative(dir, file);
        const name =
          fields.name ||
          (inside.split("/").at(-1) ?? inside).replace(/\.md$/, "");
        const description = fields.description ?? "";
        return {
          id: `${scope}:${inside}`,
          scope,
          name,
          description,
          ...(fields.model && { model: fields.model }),
          ...(fields.tools && { tools: fields.tools }),
          label: scope === "user" ? tilde(file) : relative(root, file),
          path: file,
          tokens: estimateTokens(`${name} ${description}`),
          bytes: Buffer.byteLength(text),
        };
      })
    );
  };

  const list = ({ json = false }: { json?: boolean } = {}): number => {
    const all = entries();
    if (json) {
      out(JSON.stringify(all, null, 2));
      return 0;
    }
    if (all.length === 0) {
      out("No agents found for this project or the user.");
      return 0;
    }
    for (const entry of all) {
      out(
        `${entry.scope.padEnd(8)} ${entry.name.padEnd(28)} ${(entry.model ?? "-").padEnd(8)} ~${String(entry.tokens).padStart(4)} tokens  ${entry.label}`
      );
    }
    return 0;
  };

  return { entries, list };
};
