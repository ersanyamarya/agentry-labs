// Opens a file in $EDITOR with the terminal handed over: raw mode off, stdio inherited, raw mode back on afterwards.
// $EDITOR may carry arguments ("code -w"); it is split on spaces and run without a shell.

import { spawnSync } from "node:child_process";

export const openInEditor = (file, { env = process.env, spawn = spawnSync, setRawMode = () => {} } = {}) => {
	const editor = (env.EDITOR ?? "").trim();
	if (!editor) {
		return { ok: false, message: "$EDITOR is not set. Set it (for example: export EDITOR=vim) and start agentry again." };
	}
	if (!file) {
		return { ok: false, message: "This row has no source file." };
	}
	const [command, ...args] = editor.split(/\s+/);
	setRawMode(false);
	let result;
	try {
		result = spawn(command, [...args, file], { stdio: "inherit" });
	} finally {
		setRawMode(true);
	}
	if (result?.error || (result?.status ?? 0) !== 0) {
		return { ok: false, message: `${command} ${result?.error ? `could not start (${result.error.code ?? "error"})` : `exited with ${result.status}`}` };
	}
	return { ok: true, message: `Closed ${command}; refreshed.` };
};
