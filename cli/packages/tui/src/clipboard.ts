// Copies text to the system clipboard: pbcopy, clip, wl-copy or xclip when one exists, else the OSC 52 escape
// (most terminals accept it, including over ssh).

import { spawnSync } from "node:child_process";

const COMMANDS: Record<string, string[][]> = {
  darwin: [["pbcopy"]],
  win32: [["clip"]],
  linux: [["wl-copy"], ["xclip", "-selection", "clipboard"]],
};

export interface CopyOptions {
  platform?: NodeJS.Platform;
  spawn?: (
    command: string,
    args: string[],
    options: { input: string }
  ) => { error?: Error; status?: number | null } | undefined;
  write?: (data: string) => unknown;
}

export const copyText = (
  text: string,
  {
    platform = process.platform,
    spawn = spawnSync,
    write = (data: string) => process.stdout.write(data),
  }: CopyOptions = {}
) => {
  for (const [command, ...args] of COMMANDS[platform] ?? COMMANDS.linux) {
    const result = spawn(command, args, { input: text });
    if (!result?.error && (result?.status ?? 0) === 0) {
      return { ok: true, message: "Copied to the clipboard." };
    }
  }
  write(`\u001B]52;c;${Buffer.from(text).toString("base64")}\u0007`);
  return {
    ok: true,
    message:
      "Sent to the clipboard through the terminal; if nothing pastes, the terminal blocks it.",
  };
};
