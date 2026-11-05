// @ts-nocheck
// Copies text to the system clipboard: pbcopy, clip, wl-copy or xclip when one exists, else the OSC 52 escape
// (most terminals accept it, including over ssh).

import { spawnSync } from "node:child_process";

const COMMANDS = { darwin: [["pbcopy"]], win32: [["clip"]], linux: [["wl-copy"], ["xclip", "-selection", "clipboard"]] };

export const copyText = (text, { platform = process.platform, spawn = spawnSync, write = (data) => process.stdout.write(data) } = {}) => {
	for (const [command, ...args] of COMMANDS[platform] ?? COMMANDS.linux) {
		const result = spawn(command, args, { input: text });
		if (!result?.error && (result?.status ?? 0) === 0) {
			return { ok: true, message: "Copied to the clipboard." };
		}
	}
	write(`\u001B]52;c;${Buffer.from(text).toString("base64")}\u0007`);
	return { ok: true, message: "Sent to the clipboard through the terminal; if nothing pastes, the terminal blocks it." };
};
