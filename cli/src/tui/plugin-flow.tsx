// Starts the confirm step for enabling or disabling a plugin: the preview is src/lib/plugin-toggle.ts's own dry run
// (diff, backup location, refusals), and nothing is written until y.

import type { Api, Row } from "./types.js";
import type { Step, useFlow } from "./use-flow.js";

type Flow = ReturnType<typeof useFlow>;
interface Ctx {
  api: Api;
  dir: string;
  flow: Flow;
}

export const startPluginToggle = async ({
  api,
  dir,
  flow,
  row,
}: Ctx & { row: Row }) => {
  const enable = !row.enabled;
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const plugin = row.plugin!;
  const preview = await api.previewPlugin({ dir, id: plugin, enable });
  flow.begin({
    kind: "confirm",
    title: `${enable ? "Enable" : "Disable"} ${plugin} (preview)`,
    text: preview.text,
    appliable: preview.appliable,
    apply: () => api.applyPlugin({ dir, id: plugin, enable }),
    done: `${plugin} ${enable ? "enabled" : "disabled"}. Applies to new sessions; undo with agentry fix --undo.`,
  });
};

const PLUGIN_ID = /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/;

// Confirm step for `claude plugin install|uninstall`: the preview is src/lib/plugin-install.ts's dry run (the command, the settings
// file it backs up); nothing runs until y. `fix --undo` restores the settings file only (see the lib header).
const confirmInstall = async ({
  api,
  dir,
  action,
  name,
  scope,
}: {
  api: Api;
  dir: string;
  action: "install" | "uninstall";
  name: string;
  scope: string;
}): Promise<Step> => {
  const args = { dir, action, name, scope };
  const preview = await api.previewPluginInstall(args);
  const verb = action === "install" ? "Install" : "Uninstall";
  return {
    kind: "confirm",
    title: `${verb} ${name} at ${scope} scope (preview)`,
    text: preview.text,
    appliable: preview.appliable,
    apply: () => api.applyPluginInstall(args),
    done: `${name} is ${action}ed at ${scope} scope. Applies to new sessions.`,
  };
};

// Install form: type name@marketplace → pick the scope → preview → y. The marketplace must already be added to claude.
export const startPluginInstall = ({ api, dir, flow }: Ctx) =>
  flow.begin({
    kind: "name",
    title: "Install plugin",
    label: "Plugin (name@marketplace)",
    intro: [
      "The marketplace must already be added to claude (claude plugin marketplace add).",
    ],
    onSubmit: (name) =>
      PLUGIN_ID.test(name)
        ? {
            kind: "pick",
            title: `Install ${name}: scope`,
            intro: ["Where should it be installed?"],
            options: ["user", "project", "local"],
            onPick: (scope) =>
              confirmInstall({ api, dir, action: "install", name, scope }),
          }
        : {
            kind: "result",
            ok: false,
            text: "Type it as name@marketplace, e.g. demo@market.",
          },
  });

// Uninstall: the plugin's installs that apply here; more than one asks which scope.
export const startPluginUninstall = async ({
  api,
  dir,
  flow,
  row,
}: Ctx & { row: Row }) => {
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const name = row.plugin!;
  // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
  const scopes = row.pluginScopes!;
  flow.begin(
    scopes.length === 1
      ? await confirmInstall({
          api,
          dir,
          action: "uninstall",
          name,
          scope: scopes[0],
        })
      : {
          kind: "pick",
          title: `Uninstall ${name}: scope`,
          intro: ["Installed at several scopes here; which one?"],
          options: scopes,
          onPick: (scope) =>
            confirmInstall({ api, dir, action: "uninstall", name, scope }),
        }
  );
};
