// A small prompt flow shown in the details pane: pick one of some options, type a name, preview and confirm, show the result.
// A step is { kind, title, ... }:
//   pick:    options[], onPick(option) → step | null, onNew?() → step     ↑/↓ choose, enter picks, n types a new name
//   name:    onSubmit(text) → step | null                                 typed text, enter submits, esc cancels
//   confirm: text, appliable, apply() → { ok, text }, done               y applies (only if appliable), n or esc cancels
//   result:  ok, text                                                     not modal: any move or action clears it
// While a modal step is open `lock` is true (false when closed, "typing" while a name is typed), so the app keeps
// quit/tab keys away from it. Nothing is written without a y on a confirm step.

import React from "react";

export const useFlow = ({ lock, notify, reload, copy }) => {
	const [step, setStep] = React.useState(null);
	const [at, setAt] = React.useState(0);
	const [text, setText] = React.useState("");
	const modal = Boolean(step && step.kind !== "result");
	React.useEffect(() => lock(!modal ? false : step.kind === "name" ? "typing" : true), [modal, step?.kind]);

	// Locks at once rather than from the effect below, so a key pressed right after the prompt opens is already guarded.
	const begin = (next) => {
		notify("");
		lock(!next || next.kind === "result" ? false : next.kind === "name" ? "typing" : true);
		setAt(0);
		setText("");
		setStep(next);
	};
	const cancel = () => {
		setStep(null);
		notify("Cancelled; nothing changed.");
	};
	const advance = async (next) => {
		const resolved = await next;
		begin(resolved ?? null);
	};

	const confirm = async () => {
		const current = step;
		setStep({ kind: "result", ok: true, text: "Working..." });
		const result = await current.apply();
		setStep({ kind: "result", ...result });
		notify(result.ok ? current.done : "Finished with errors; see the output on the right.");
		await reload();
	};

	// Returns true when the key was used by an open step.
	const handleKey = (input, key) => {
		if (input === "c" && copy && (step?.kind === "confirm" || step?.kind === "result")) {
			copy(step.text);
			return true;
		}
		if (!modal) {
			return false;
		}
		if (step.kind === "pick") {
			if (key.upArrow) {
				setAt(Math.max(0, at - 1));
			} else if (key.downArrow) {
				setAt(Math.min(step.options.length - 1, at + 1));
			} else if (key.return && step.options.length > 0) {
				advance(step.onPick(step.options[at]));
			} else if (input === "n" && step.onNew) {
				begin(step.onNew());
			} else if (key.escape) {
				cancel();
			}
		} else if (step.kind === "name") {
			if (key.return) {
				advance(step.onSubmit(text.trim()));
			} else if (key.escape) {
				cancel();
			} else if (key.backspace || key.delete) {
				setText(text.slice(0, -1));
			} else if (input && !key.ctrl && !key.meta) {
				setText(text + input);
			}
		} else if (input === "y" && step.appliable) {
			confirm();
		} else if (input === "n" || key.escape) {
			cancel();
		}
		return true;
	};

	let lines;
	if (step?.kind === "pick") {
		lines = [...(step.intro ?? []), "", ...step.options.map((option, index) => `${index === at ? ">" : " "} ${option}`), "", step.onNew ? "↑/↓ choose, enter select, n new group, esc cancel" : "↑/↓ choose, enter select, esc cancel"];
	} else if (step?.kind === "name") {
		lines = [...(step.intro ?? []), "", `${step.label}: ${text}_`, "", "enter confirm, esc cancel"];
	} else if (step?.kind === "confirm") {
		lines = [...step.text.split("\n"), "", step.appliable ? "Apply this? y = yes, n = cancel, c = copy" : "Nothing can be applied here. n = close, c = copy"];
	} else if (step?.kind === "result") {
		lines = step.text.split("\n");
	}
	const title = step ? (step.kind === "result" ? (step.ok ? "Result (c = copy)" : "Result (errors, c = copy)") : step.title) : undefined;
	return { step, lines, title, modal, begin, handleKey, clear: () => setStep(null) };
};
