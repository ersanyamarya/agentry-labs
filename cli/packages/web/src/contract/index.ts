// The oRPC contract between the web screens and the local server: one group per section, mirroring core's createData()
// method names and argument shapes, plus `load`. The server implements it in src/server/router.ts; src/lib/orpc.ts is the
// typed client.

import type { ContractRouterClient } from "@orpc/contract";
import { backupsContract } from "./backups.js";
import { catalogContract } from "./catalog.js";
import { copilotContract } from "./copilot.js";
import { doctorContract } from "./doctor.js";
import { hooksContract } from "./hooks.js";
import { info } from "./info.js";
import { load } from "./load.js";
import { mcpContract } from "./mcp.js";
import { pluginsContract } from "./plugins.js";
import { rulesContract } from "./rules.js";
import { skillsContract } from "./skills.js";

export const contract = {
  info,
  load,
  skills: skillsContract,
  mcp: mcpContract,
  hooks: hooksContract,
  plugins: pluginsContract,
  rules: rulesContract,
  catalog: catalogContract,
  doctor: doctorContract,
  backups: backupsContract,
  copilot: copilotContract,
};

export type Contract = typeof contract;
export type Client = ContractRouterClient<Contract>;
export type { LoadData } from "./load.js";
export type { Outcome, Preview } from "./shared.js";
