// Opens a file in $EDITOR with the terminal handed over: raw mode off, stdio inherited, raw mode back on afterwards.
// $EDITOR may carry arguments ("code -w"); it is split on spaces and run without a shell.

import { spawnSync } from "node:child_process";

export interface EditorOptions {
  env?: NodeJS.ProcessEnv;
  setRawMode?: (on: boolean) => void;
  spawn?: (
    command: string,
    args: string[],
    options: { stdio: "inherit" }
  ) =>
    | {
        error?: (Error & { code?: string }) | undefined;
        status?: number | null;
      }
    | undefined;
}

export const openInEditor = (
  file: string | undefined,
  {
    env = process.env,
    spawn = spawnSync,
    setRawMode = () => undefined,
  }: EditorOptions = {}
) => {
  const editor = (env.EDITOR ?? "").trim();
  if (!editor) {
    return {
      ok: false,
      message:
        "$EDITOR is not set. Set it (for example: export EDITOR=vim) and start agentry again.",
    };
  }
  if (!file) {
    return { ok: false, message: "This row has no source file." };
  }
  const [command, ...args] = editor.split(/\s+/) as [string, ...string[]];
  setRawMode(false);
  let result: ReturnType<NonNullable<EditorOptions["spawn"]>>;
  try {
    result = spawn(command, [...args, file], { stdio: "inherit" });
  } finally {
    setRawMode(true);
  }
  if (result?.error || (result?.status ?? 0) !== 0) {
    return {
      ok: false,
      message: `${command} ${result?.error ? `could not start (${result.error.code ?? "error"})` : `exited with ${result?.status}`}`,
    };
  }
  return { ok: true, message: `Closed ${command}; refreshed.` };
};
