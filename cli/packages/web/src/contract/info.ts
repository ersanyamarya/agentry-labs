// `info`: where agentry ui was started and which version is running. The browser needs the folder before it can call
// `load`, because every call names its project folder; the server's working directory is the one `agentry ui` ran in.

import { z } from "zod";
import { base } from "./shared.js";

export const info = base
  .input(z.object({}).optional())
  .output(z.object({ dir: z.string(), version: z.string() }));
