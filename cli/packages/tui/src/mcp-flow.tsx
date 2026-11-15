// Confirm step for turning off a user-scope MCP server or adding a parked one back. The preview is src/lib/mcp-toggle.ts's dry
// run (secrets masked); nothing changes until y. `agentry fix --undo` restores ~/.claude.json afterwards.

import { messages } from "@agentry/core/messages";
import type { Api, Row } from "./types.js";
import type { Step, useFlow } from "./use-flow.js";

const msg = messages().flows.mcp;
const { add, set } = msg;

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
    title: msg.toggleTitle(enable, name),
    text: preview.text,
    appliable: preview.appliable,
    apply: () => api.applyMcp({ dir, name, enable }),
    done: msg.toggled(name, enable),
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
    title: msg.removeTitle(name),
    text: preview.text,
    appliable: preview.appliable,
    apply: () => api.applyMcpRemove({ dir, name }),
    done: msg.removed(name),
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
        title: add.previewTitle(config.name),
        text: preview.text,
        appliable: preview.appliable,
        apply: () => api.applyMcpAdd(args),
        done: add.done(config.name),
      }));
    };
  const scopeStep = (config: AddConfig): Step => ({
    kind: "pick",
    title: add.scopeTitle(config.name),
    intro: [add.scopeIntro],
    options: add.scopeOptions,
    onPick: finish(config),
  });
  flow.begin({
    kind: "name",
    title: add.nameTitle,
    label: add.nameLabel,
    intro: [add.nameIntro],
    onSubmit: (name) => {
      if (!/^[A-Za-z0-9_.:-]+$/.test(name)) {
        return failed(add.badName);
      }
      return {
        kind: "pick",
        title: add.typeTitle(name),
        intro: [add.typeIntro],
        options: add.typeOptions,
        onPick: (option) =>
          option === add.typeOptions[0]
            ? {
                kind: "name",
                title: add.commandTitle(name),
                label: add.commandLabel,
                intro: [add.commandIntro],
                onSubmit: (text) =>
                  text
                    ? {
                        kind: "name",
                        title: add.envTitle(name),
                        label: add.envLabel,
                        intro: [add.envIntro],
                        display: hideValues,
                        onSubmit: (envText) => {
                          const [command, ...args] = words(text);
                          return scopeStep({
                            name,
                            rest: { command, args, env: words(envText) },
                          });
                        },
                      }
                    : failed(add.needCommand),
              }
            : {
                kind: "name",
                title: add.urlTitle(name),
                label: add.urlLabel,
                intro: [add.urlIntro],
                onSubmit: (url) =>
                  /^https?:\/\/\S+$/.test(url)
                    ? {
                        kind: "name",
                        title: add.headersTitle(name),
                        label: add.headersLabel,
                        intro: [add.headersIntro],
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
                    : failed(add.badUrl),
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
    title: set.envTitle(name),
    label: set.envLabel,
    intro: [set.envIntro],
    display: hideValues,
    onSubmit: (envText) => ({
      kind: "name",
      title: set.argsTitle(name),
      label: set.argsLabel,
      intro: [set.argsIntro],
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
          title: set.previewTitle(name),
          text: preview.text,
          appliable: preview.appliable,
          apply: () => api.applyMcpSet(args),
          done: set.done(name),
        };
      },
    }),
  });
};
