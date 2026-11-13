// Plugins: enable/disable (settings enabledPlugins) and install/uninstall (`claude plugin`), each as core's preview/apply pair.

import { z } from "zod";
import { base, dirSchema, outcomeSchema, previewSchema } from "./shared.js";

// "<name>@<marketplace>", the key of enabledPlugins; core edits the scope's settings file it picks itself.
const pluginId = z
  .string()
  .min(3)
  .max(400)
  .regex(/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/, "not a plugin id");
// Uninstall also takes a bare name core matches against the installed list.
const pluginName = z
  .string()
  .min(1)
  .max(400)
  .regex(/^[A-Za-z0-9_.-]+(@[A-Za-z0-9_.-]+)?$/, "not a plugin name");

const toggleInput = z.object({
  dir: dirSchema,
  id: pluginId,
  enable: z.boolean(),
});
const installInput = z.object({
  dir: dirSchema,
  action: z.enum(["install", "uninstall"]),
  name: pluginName,
  scope: z.enum(["user", "project", "local"]).optional(),
});

export const pluginsContract = {
  previewPlugin: base.input(toggleInput).output(previewSchema),
  applyPlugin: base.input(toggleInput).output(outcomeSchema),
  previewPluginInstall: base.input(installInput).output(previewSchema),
  applyPluginInstall: base.input(installInput).output(outcomeSchema),
};
