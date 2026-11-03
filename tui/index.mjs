// Terminal UI entry. bin/agentry.mjs imports this only for `agentry ui` (and bare `agentry` in a terminal), so Ink and
// React never load for other commands. Placeholder: the UI is written on top of the lib/ functions in a later change.

import React from "react";
import { render, Text, useApp, useInput } from "ink";

const h = React.createElement;

export const App = () => {
	const { exit } = useApp();
	useInput((input) => {
		if (input === "q") {
			exit();
		}
	});
	return h(Text, null, "agentry ui: not built yet. Press q to quit.");
};

export const run = async ({ io = {} } = {}) => {
	const { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = io;
	if (!stdin.isTTY) {
		stderr.write("agentry ui needs an interactive terminal.\n");
		return 2;
	}
	const instance = render(h(App), { stdin, stdout, stderr });
	await instance.waitUntilExit();
	return 0;
};
