// MCP servers: park/add back (toggle), remove, add and set, each as core's preview*/apply* pair. A pair shares one input
// schema; apply has no dryRun (core's apply* accepts one, but apply here always means apply).
// add and set carry env values from the browser in plain text: they go to core only, which masks every preview.

import { z } from "zod";
import { base, dirSchema, outcomeSchema, previewSchema } from "./shared.js";

// The server name core looks up (toggle, remove, set) or validates against its own NAME pattern (add).
const serverName = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_.:-]+$/, "not a usable server name");
const text = z.string().max(8192);
const list = z.array(text).max(200);

const toggleInput = z.object({
  dir: dirSchema,
  name: serverName,
  enable: z.boolean(),
});
const removeInput = z.object({ dir: dirSchema, name: serverName });
// Same fields as `agentry mcp add`: a command server (command, args, env "K=V") or a url server (url, headers "K: V").
// scope "project" writes this project's .mcp.json; core picks the file from dir, never from the browser.
const addInput = z.object({
  dir: dirSchema,
  name: serverName,
  scope: z.enum(["user", "project"]).optional(),
  command: text.optional(),
  args: list.optional(),
  env: list.optional(),
  url: text.optional(),
  headers: list.optional(),
});
// env "K=V" pairs to add or change, unsetEnv keys to drop, args to replace (user scope only, core's rule).
const setInput = z.object({
  dir: dirSchema,
  name: serverName,
  args: list.optional(),
  env: list.optional(),
  unsetEnv: list.optional(),
});

export const mcpContract = {
  previewMcp: base.input(toggleInput).output(previewSchema),
  applyMcp: base.input(toggleInput).output(outcomeSchema),
  previewMcpRemove: base.input(removeInput).output(previewSchema),
  applyMcpRemove: base.input(removeInput).output(outcomeSchema),
  previewMcpAdd: base.input(addInput).output(previewSchema),
  applyMcpAdd: base.input(addInput).output(outcomeSchema),
  previewMcpSet: base.input(setInput).output(previewSchema),
  applyMcpSet: base.input(setInput).output(outcomeSchema),
};
