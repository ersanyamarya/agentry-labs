// Translate a Claude user MCP server (top-level `mcpServers` in ~/.claude.json) into a Copilot entry for
// <ch>/mcp-config.json that holds no literal value. Decisions: docs/decisions.md.
// Copilot facts: cli/docs/copilot-config-sources.md ("MCP", "${VAR} expansion").
//
//   local   { type: "local", command, args?, env?, tools: ["*"] }       (Claude: stdio or no type)
//   remote  { type: "http" | "sse", url, headers?, tools: ["*"] }       (Claude: http, streamable-http, sse)
//
// Copilot expands ${VAR} in args, env and headers (probed: a whole arg, an env value, "Bearer ${KEY}"); not in command
// or url. So:
//   env     every value that is not only ${VAR} references becomes ${<KEY>}
//   header  a literal value becomes ${<SERVER>_<HEADER>} (upper snake), an auth scheme ("Bearer ") is kept in front
//   arg     an arg the preview would mask (mask.ts maskArgs: tokens, values after secret-named flags, KEY=secret,
//           Authorization:, URLs with secrets) becomes ${<SERVER>_ARG_<n>}, n counted from 1
//   command, url   anything the preview would mask, and any ${VAR}, is refused (it would be written as is)
// ${VAR:-default} (or any ${...} that is not a plain ${NAME}) is refused everywhere: Copilot is not known to expand it.
// Only the fields above are copied (never `...raw`): another key (oauth, headersHelper, ...) is dropped and named.
// Nothing here returns or prints a value: refusals name the server, the field and the key, never what it holds.
//
// The engine (copilot-share.ts) writes the entry with json-edit.ts (strict JSON, every other byte kept) and records
// sha256(JSON.stringify(entry)), so unshare removes the entry only while the parsed entry still hashes the same.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isObject, readJson } from "./inventory/common.js";
import { createJsonEdit } from "./json-edit.js";
import {
  AUTH_SCHEME,
  looksSecret,
  maskArgs,
  maskCommand,
  maskUrl,
} from "./mask.js";
import { messages } from "./messages.js";
import type { Paths } from "./paths.js";

const words = messages().copilot.mcp;

export interface CopilotLocalEntry {
  args?: string[];
  command: string;
  env?: Record<string, string>;
  tools: string[];
  type: "local";
}

export interface CopilotRemoteEntry {
  headers?: Record<string, string>;
  tools: string[];
  type: "http" | "sse";
  url: string;
}

export type CopilotMcpEntry = CopilotLocalEntry | CopilotRemoteEntry;

/** A variable Copilot needs in its own environment, and what it stands for (a field name, never a value). */
export interface McpVar {
  name: string;
  what: string;
}

export interface McpTranslation {
  /** Keys of the Claude entry that were not copied. */
  dropped: string[];
  entry: CopilotMcpEntry;
  vars: McpVar[];
}

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLAIN_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const ONLY_REFS = /^(\$\{[A-Za-z_][A-Za-z0-9_]*\})+$/;
const LOCAL_KEYS = new Set(["type", "command", "args", "env"]);
const REMOTE_KEYS = new Set(["type", "url", "headers"]);

// A ${...} that is not a plain ${NAME}: ${NAME:-default}, ${NAME-x}, ${NAME:=x}, ...
const oddRef = (text: string): boolean =>
  text.replace(PLAIN_REF, "").includes("${");

const refsIn = (text: string): string[] =>
  [...text.matchAll(PLAIN_REF)].map((match) => match[1] as string);

/** `<ch>/mcp-config.json`, Copilot's user MCP file. */
export const mcpConfigPath = (paths: Pick<Paths, "copilotDir">): string =>
  join(paths.copilotDir, "mcp-config.json");

// Sorted keys, so the hash is of the parsed value and not of how the file is formatted.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : isObject(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])])
        )
      : value;

/** sha256 of an entry's parsed value (what the store records; the entry itself is never stored). */
export const entryHash = (entry: unknown): string =>
  createHash("sha256")
    .update(String(JSON.stringify(canonical(entry))))
    .digest("hex");

/** The Claude user servers: top-level `mcpServers` of `paths.claudeJson` (raw, never shown). */
export const claudeUserServers = (
  paths: Pick<Paths, "claudeJson">
): Record<string, unknown> => {
  const json = readJson(paths.claudeJson, []);
  return isObject(json) && isObject(json.mcpServers) ? json.mcpServers : {};
};

/** The servers in a Copilot mcp-config.json; a missing or empty file has none. Refuses a link or non-strict JSON. */
export const readMcpServers = (
  file: string
):
  | { servers: Record<string, unknown>; error?: undefined }
  | { error: "notRegular" | "notJson" } => {
  try {
    if (!lstatSync(file).isFile()) {
      return { error: "notRegular" };
    }
  } catch {
    return { servers: {} };
  }
  try {
    const text = readFileSync(file, "utf8");
    if (text.trim() === "") {
      return { servers: {} };
    }
    createJsonEdit(text);
    const json: unknown = JSON.parse(text);
    if (!isObject(json)) {
      return { error: "notJson" };
    }
    if (json.mcpServers === undefined) {
      return { servers: {} };
    }
    return isObject(json.mcpServers)
      ? { servers: json.mcpServers }
      : { error: "notJson" };
  } catch {
    return { error: "notJson" };
  }
};

/** The file's text with `mcpServers[name]` set to `entry`; every other byte stays. */
export const addEntryText = (
  text: string | undefined,
  name: string,
  entry: CopilotMcpEntry
): string => {
  if (!text?.trim()) {
    return `${JSON.stringify({ mcpServers: { [name]: entry } }, null, 2)}\n`;
  }
  const doc = createJsonEdit(text);
  if (doc.get(["mcpServers"]) === undefined) {
    doc.set(["mcpServers"], { [name]: entry });
  } else {
    doc.set(["mcpServers", name], entry);
  }
  return doc.text;
};

/** The file's text without `mcpServers[name]`; throws when the entry no longer hashes to `sha256`. */
export const removeEntryText = (
  text: string | undefined,
  name: string,
  sha256: string
): string => {
  const doc = createJsonEdit(text ?? "");
  const current = doc.get(["mcpServers", name]);
  if (current === undefined || entryHash(current) !== sha256) {
    throw new Error("the entry changed since agentry shared it");
  }
  doc.deleteKey(["mcpServers", name]);
  return doc.text;
};

// Upper snake from parts ("my-api", "X-Api-Key" → MY_API_X_API_KEY), always a valid variable name.
const varName = (...parts: string[]): string => {
  const name = parts
    .join("_")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return /^[A-Z_]/.test(name) ? name : `MCP_${name}`;
};

// A generated variable name not used yet in this entry (NAME, NAME_2, ...).
const unique = (base: string, used: Set<string>): string => {
  let name = base;
  for (let n = 2; used.has(name); n += 1) {
    name = `${base}_${n}`;
  }
  used.add(name);
  return name;
};

// The parts of a url that would be written as is although they hold a secret (a part word, never the value).
const urlSecretPart = (url: string): string | undefined => {
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(url)) {
    return words.urlUserinfo;
  }
  const queryAt = url.search(/[?#]/);
  const base = queryAt === -1 ? url : url.slice(0, queryAt);
  const query = queryAt === -1 ? "" : url.slice(queryAt + 1);
  const path = base.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  if (path.split("/").some((segment) => segment && looksSecret(segment))) {
    return words.urlPath;
  }
  for (const part of query.split(/[&#]/)) {
    const at = part.indexOf("=");
    const key = at === -1 ? part : part.slice(0, at);
    const value = at === -1 ? "" : part.slice(at + 1);
    if (looksSecret(key)) {
      return words.urlOther;
    }
    if (value !== "") {
      return words.urlQuery(key);
    }
  }
  return maskUrl(url) === url ? undefined : words.urlOther;
};

interface Refused {
  error: string;
}

const translateLocal = (
  name: string,
  raw: Record<string, unknown>
): { entry: CopilotLocalEntry; vars: McpVar[] } | Refused => {
  const vars: McpVar[] = [];
  const { command, args, env } = raw;
  if (typeof command !== "string" || command === "") {
    return { error: words.noCommand(name) };
  }
  if (command.includes("${")) {
    return {
      error: oddRef(command)
        ? words.withDefault(name, "command")
        : words.refNotExpanded(name, "command"),
    };
  }
  if (maskCommand(command) !== command) {
    return { error: words.secretInCommand(name) };
  }
  const entry: CopilotLocalEntry = { type: "local", command, tools: ["*"] };
  const used = new Set<string>(isObject(env) ? Object.keys(env) : []);
  if (env !== undefined) {
    if (!isObject(env)) {
      return { error: words.badField(name, "env") };
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== "string") {
        return { error: words.badField(name, `env ${key}`) };
      }
      if (oddRef(value)) {
        return { error: words.withDefault(name, `env ${key}`) };
      }
      if (value === "" || ONLY_REFS.test(value)) {
        out[key] = value;
        for (const ref of refsIn(value)) {
          vars.push({ name: ref, what: words.whatEnv(key) });
        }
        continue;
      }
      if (!VAR_NAME.test(key)) {
        return { error: words.badKey(name, key) };
      }
      out[key] = `\${${key}}`;
      vars.push({ name: key, what: words.whatEnv(key) });
    }
    entry.env = out;
  }
  if (args !== undefined) {
    if (
      !(Array.isArray(args) && args.every((arg) => typeof arg === "string"))
    ) {
      return { error: words.badField(name, "args") };
    }
    const masked = maskArgs(args);
    const out: string[] = [];
    for (const [index, arg] of (args as string[]).entries()) {
      if (oddRef(arg)) {
        return { error: words.withDefault(name, `argument ${index + 1}`) };
      }
      if (masked[index] !== arg || looksSecret(arg)) {
        const variable = unique(varName(name, "ARG", String(index + 1)), used);
        out.push(`\${${variable}}`);
        vars.push({
          name: variable,
          what: words.whatArg(index + 1, masked[index] ?? ""),
        });
        continue;
      }
      out.push(arg);
      for (const ref of refsIn(arg)) {
        vars.push({ name: ref, what: words.whatArg(index + 1, arg) });
      }
    }
    entry.args = out;
  }
  // Key order as Copilot's own examples: type, command, args, env, tools.
  return {
    entry: {
      type: "local",
      command,
      ...(entry.args && { args: entry.args }),
      ...(entry.env && { env: entry.env }),
      tools: entry.tools,
    },
    vars,
  };
};

const translateRemote = (
  name: string,
  raw: Record<string, unknown>,
  type: "http" | "sse"
): { entry: CopilotRemoteEntry; vars: McpVar[] } | Refused => {
  const vars: McpVar[] = [];
  const { url, headers } = raw;
  if (typeof url !== "string" || url === "") {
    return { error: words.noUrl(name) };
  }
  if (url.includes("${")) {
    return {
      error: oddRef(url)
        ? words.withDefault(name, "url")
        : words.refNotExpanded(name, "url"),
    };
  }
  const part = urlSecretPart(url);
  if (part !== undefined) {
    return { error: words.secretInUrl(name, part) };
  }
  let out: Record<string, string> | undefined;
  if (headers !== undefined) {
    if (!isObject(headers)) {
      return { error: words.badField(name, "headers") };
    }
    out = {};
    const used = new Set<string>();
    for (const [header, value] of Object.entries(headers)) {
      if (typeof value !== "string") {
        return { error: words.badField(name, `header ${header}`) };
      }
      if (oddRef(value)) {
        return { error: words.withDefault(name, `header ${header}`) };
      }
      const scheme = value.match(AUTH_SCHEME)?.[0] ?? "";
      const rest = value.slice(scheme.length);
      if ((rest === "" && scheme === "") || ONLY_REFS.test(rest)) {
        out[header] = value;
        for (const ref of refsIn(rest)) {
          vars.push({ name: ref, what: words.whatHeader(header) });
        }
        continue;
      }
      const variable = unique(varName(name, header), used);
      out[header] = `${scheme}\${${variable}}`;
      vars.push({ name: variable, what: words.whatHeader(header) });
    }
  }
  return {
    entry: { type, url, ...(out && { headers: out }), tools: ["*"] },
    vars,
  };
};

/**
 * The Copilot entry for the Claude server `name` (its raw entry), with every value replaced by a ${VAR} Copilot
 * expands, or `{ error }` (a reason that names fields, never values).
 */
export const translateMcp = (
  name: string,
  raw: unknown
): McpTranslation | Refused => {
  if (!isObject(raw)) {
    return { error: words.notObject(name) };
  }
  const claudeType = raw.type ?? "stdio";
  const type =
    claudeType === "stdio"
      ? "local"
      : claudeType === "http" || claudeType === "streamable-http"
        ? "http"
        : claudeType === "sse"
          ? "sse"
          : undefined;
  if (type === undefined) {
    return {
      error: words.badType(
        name,
        typeof claudeType === "string" ? claudeType : "?"
      ),
    };
  }
  const made =
    type === "local"
      ? translateLocal(name, raw)
      : translateRemote(name, raw, type);
  if ("error" in made) {
    return made;
  }
  const allowed = type === "local" ? LOCAL_KEYS : REMOTE_KEYS;
  const seen = new Set<string>();
  const vars = made.vars.filter((item) => {
    const key = `${item.name}\0${item.what}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return {
    entry: made.entry,
    vars,
    dropped: Object.keys(raw).filter((key) => !allowed.has(key)),
  };
};

/** What the preview says about a translation: dropped keys and the variables to export (names only). */
export const mcpNotes = ({ dropped, vars }: McpTranslation): string[] => [
  ...(dropped.length > 0 ? [words.dropped(dropped.join(", "))] : []),
  ...(vars.length > 0
    ? [
        words.exportTitle,
        ...vars.map((item) => words.exportVar(item.name, item.what)),
        words.guiNote,
      ]
    : [words.noVars]),
];
