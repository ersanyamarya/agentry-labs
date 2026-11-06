// Terminal UI entry. bin/agentry.mjs imports this only for `agentry ui` (and bare `agentry` in a terminal), so Ink and
// React never load for other commands. All reads and actions go through tui/data.mjs, which calls the lib/ functions.

import { render } from "ink";
import { createDiscover } from "../lib/discover.js";
import { createPaths, type Paths } from "../lib/paths.js";
import { App } from "./app.js";
import { createData } from "./data.js";
import { createRecents } from "./recents.js";

export { App };

export interface RunOptions {
  io?: {
    stdin?: NodeJS.ReadStream;
    stdout?: NodeJS.WriteStream;
    stderr?: NodeJS.WriteStream;
  };
  makePaths?: (dir: string) => Paths;
  startDir?: string;
}

export const run = async ({
  io = {},
  makePaths = (dir) => createPaths({ cwd: dir }),
  startDir,
}: RunOptions = {}) => {
  const {
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
  } = io;
  if (!stdin.isTTY) {
    stderr.write("agentry ui needs an interactive terminal.\n");
    return 2;
  }
  const start = startDir ?? makePaths(process.cwd()).projectRoot();
  const finder = createDiscover();
  const props = {
    api: createData({ makePaths }),
    startDir: start,
    recents: createRecents(makePaths(start)),
    discover: (roots: string[]) => finder.find(roots, { depth: 2 }),
  };
  const instance = render(<App {...props} />, { stdin, stdout, stderr });
  await instance.waitUntilExit();
  return 0;
};
