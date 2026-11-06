// Confirm step for turning off a user-scope MCP server or adding a parked one back. The preview is lib/mcp-toggle.mjs's dry
// run (secrets masked); nothing changes until y. `agentry fix --undo` restores ~/.claude.json afterwards.

import type { Api, Row } from "./types.js";
import type { Step, useFlow } from "./use-flow.js";

type Flow = ReturnType<typeof useFlow>;
interface Ctx {
  api: Api;
  dir: string;
  flow: Flow;
}

export const startMcpToggle = async ({
  api,
  dir,
  flow,
  row,
}: Ctx & { row: Row }) => {
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const name = row.mcp!;
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const enable = row.mcpEnable!;
  const preview = await api.previewMcp({ dir, name, enable });
  flow.begin({
    kind: "confirm",
    title: `${enable ? "Add back" : "Turn off"} ${name} (preview)`,
    text: preview.text,
    appliable: preview.appliable,
    apply: () => api.applyMcp({ dir, name, enable }),
    done: `${name} ${enable ? "is back in user scope" : "is turned off"}. Applies to new sessions; undo with agentry fix --undo.`,
  });
};

// Confirm step for deleting an MCP server for good (user, local or project .mcp.json scope, or a parked copy).
export const startMcpRemove = async ({
  api,
  dir,
  flow,
  row,
}: Ctx & { row: Row }) => {
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const name = row.mcp!;
  const preview = await api.previewMcpRemove({ dir, name });
  flow.begin({
    kind: "confirm",
    title: `Remove ${name} (preview)`,
    text: preview.text,
    appliable: preview.appliable,
    apply: () => api.applyMcpRemove({ dir, name }),
    done: `${name} is removed. Applies to new sessions; undo with agentry fix --undo.`,
  });
};

// Typed text shows its secrets as ****: everything after an "=" or a ":" up to the next separator.
const hideValues = (text: string) => text.replace(/([=:])[^\s;]*/g, "$1****");
const words = (text: string) => text.split(/\s+/).filter(Boolean);
const failed = (text: string): Step => ({ kind: "result", ok: false, text });

// Add form: name → command or url → env or headers → scope → masked preview → y. Typing is plain text split on spaces
// (headers on ";"), so arguments with spaces need `agentry mcp add` instead.
export const startMcpAdd = ({ api, dir, flow }: Ctx) => {
  interface AddConfig {
    name: string;
    rest:
      | { command: string | undefined; args: string[]; env: string[] }
      | { url: string; headers: string[] };
  }
  const finish =
    (config: AddConfig) =>
    (scope: string): Promise<Step> => {
      const args = {
        dir,
        name: config.name,
        scope: scope.split(" ")[0],
        ...config.rest,
      };
      return api.previewMcpAdd(args).then((preview) => ({
        kind: "confirm",
        title: `Add ${config.name} (preview)`,
        text: preview.text,
        appliable: preview.appliable,
        apply: () => api.applyMcpAdd(args),
        done: `${config.name} is added. Applies to new sessions; undo with agentry fix --undo.`,
      }));
    };
  const scopeStep = (config: AddConfig): Step => ({
    kind: "pick",
    title: `Add ${config.name}: scope`,
    intro: ["Where should the server live?"],
    options: [
      "user (claude mcp add-json, every project)",
      "project (this repo's .mcp.json)",
    ],
    onPick: finish(config),
  });
  flow.begin({
    kind: "name",
    title: "Add MCP server",
    label: "Server name",
    intro: ["Letters, digits, . _ : - only."],
    onSubmit: (name) => {
      if (!/^[A-Za-z0-9_.:-]+$/.test(name)) {
        return failed(
          "Not a valid name: use letters, digits and . _ : - only."
        );
      }
      return {
        kind: "pick",
        title: `Add ${name}: type`,
        intro: ["How does the server run?"],
        options: ["command (stdio)", "url (http)"],
        onPick: (option) =>
          option.startsWith("command")
            ? {
                kind: "name",
                title: `Add ${name}: command`,
                label: "Command and args",
                intro: ["Space separated, e.g. npx -y @scope/server"],
                onSubmit: (text) =>
                  text
                    ? {
                        kind: "name",
                        title: `Add ${name}: env`,
                        label: "Env (KEY=VALUE ...)",
                        intro: [
                          "Space separated; values are hidden as you type. Blank for none.",
                        ],
                        display: hideValues,
                        onSubmit: (envText) => {
                          const [command, ...args] = words(text);
                          return scopeStep({
                            name,
                            rest: { command, args, env: words(envText) },
                          });
                        },
                      }
                    : failed("A command is needed."),
              }
            : {
                kind: "name",
                title: `Add ${name}: url`,
                label: "URL",
                intro: ["https://..."],
                onSubmit: (url) =>
                  /^https?:\/\/\S+$/.test(url)
                    ? {
                        kind: "name",
                        title: `Add ${name}: headers`,
                        label: "Headers (Name: value; ...)",
                        intro: [
                          "Separated by ';'; values are hidden as you type. Blank for none.",
                        ],
                        display: hideValues,
                        onSubmit: (headerText) =>
                          scopeStep({
                            name,
                            rest: {
                              url,
                              headers: headerText
                                .split(";")
                                .map((one) => one.trim())
                                .filter(Boolean),
                            },
                          }),
                      }
                    : failed("The URL must start with http:// or https://."),
              },
      };
    },
  });
};

// Edit form for a user server: env changes, then new args; blank keeps. Preview is the engine's masked diff.
export const startMcpSet = ({ api, dir, flow, row }: Ctx & { row: Row }) => {
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const name = row.mcp!;
  flow.begin({
    kind: "name",
    title: `Edit ${name}: env`,
    label: "Env changes",
    intro: [
      "KEY=VALUE sets, -KEY removes; space separated; values hidden as you type. Blank keeps env.",
    ],
    display: hideValues,
    onSubmit: (envText) => ({
      kind: "name",
      title: `Edit ${name}: args`,
      label: "New args",
      intro: [
        "Replaces the whole args list, space separated. Blank keeps args.",
      ],
      onSubmit: async (argsText) => {
        const items = words(envText);
        const args = {
          dir,
          name,
          env: items.filter((item) => !item.startsWith("-")),
          unsetEnv: items
            .filter((item) => item.startsWith("-"))
            .map((item) => item.slice(1)),
          ...(argsText ? { args: words(argsText) } : {}),
        };
        const preview = await api.previewMcpSet(args);
        return {
          kind: "confirm",
          title: `Edit ${name} (preview)`,
          text: preview.text,
          appliable: preview.appliable,
          apply: () => api.applyMcpSet(args),
          done: `${name} is updated. Applies to new sessions; undo with agentry fix --undo.`,
        };
      },
    }),
  });
};
