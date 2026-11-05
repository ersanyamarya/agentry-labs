// @ts-nocheck
// Doctor tab: findings by severity. enter previews the fix (dry run, masked), y applies it through the fix engine
// (backup, write, verify), n or esc cancels, u previews undoing the last fix set. Nothing is written without y.

import React from "react";
import { Box, Text, useInput } from "ink";
import { doctorRows } from "../rows.js";
import { useList } from "../use-list.js";
import { SEVERITY, useStyle } from "../theme.js";
import { Panes } from "./list.js";

const h = React.createElement;

export const DoctorTab = ({ data, api, dir, active, height, layout, notify, reload, lock, openFile, copy }) => {
	const all = React.useMemo(() => doctorRows(data), [data]);
	const list = useList({ rows: all, lock, marks: false });
	const { rows, cursor, row, move } = list;
	// null | { kind: "fix" | "undo", finding?, text, appliable } waiting for y/n | { kind: "result", ok, text }
	const [step, setStep] = React.useState(null);
	const waiting = step && step.kind !== "result";
	React.useEffect(() => lock(Boolean(waiting)), [waiting]);

	const preview = async () => {
		if (row?.kind !== "finding") {
			return;
		}
		const result = await api.previewFix({ dir, finding: row.finding });
		setStep({ kind: "fix", finding: row.finding, ...result });
	};
	const previewUndo = async () => {
		const result = await api.previewUndo({ dir });
		setStep({ kind: "undo", ...result });
	};
	const confirm = async () => {
		const current = step;
		setStep({ kind: "result", ok: true, text: "Working..." });
		const result = current.kind === "undo" ? await api.applyUndo({ dir }) : await api.applyFix({ dir, finding: current.finding });
		setStep({ kind: "result", ...result });
		notify(result.ok ? (current.kind === "undo" ? "Undone." : "Fix applied and verified.") : "Finished with errors; see the output on the right.");
		await reload();
	};

	useInput(
		(input, key) => {
			if (!waiting && list.handleKey(input, key)) {
				return;
			}
			if (input === "c" && step) {
				copy(step.text);
				return;
			}
			if (waiting) {
				if (input === "y" && step.appliable) {
					confirm();
				} else if (input === "n" || key.escape) {
					setStep(null);
					notify("Cancelled; nothing written.");
				}
				return;
			}
			if (key.upArrow || key.downArrow) {
				setStep(null);
				move(key.upArrow ? -1 : 1);
			} else if (key.return) {
				preview();
			} else if (input === "u") {
				previewUndo();
			} else if (input === "e") {
				openFile(row?.file);
			}
		},
		{ isActive: active },
	);

	const lines = step
		? step.kind === "result"
			? step.text.split("\n")
			: [...step.text.split("\n"), "", step.appliable ? `${step.kind === "undo" ? "Restore" : "Apply"} this? y = yes, n = cancel, c = copy` : "Nothing can be applied here. n = close, c = copy"]
		: undefined;
	const title = step ? (step.kind === "result" ? (step.ok ? "Result (c = copy)" : "Result (errors, c = copy)") : step.kind === "undo" ? "Undo preview" : "Fix preview (dry run)") : "Details";
	const style = useStyle();
	const { error, warning, info } = data.doctor.summary;
	return h(
		Box,
		{ flexDirection: "column" },
		h(Text, null, h(Text, style(SEVERITY.error.style), `${error} errors`), ", ", h(Text, style(SEVERITY.warning.style), `${warning} warnings`), ", ", h(Text, style(SEVERITY.info.style), `${info} info`)),
		h(Panes, { rows, cursor, height, row, lines, title, layout, status: list.status }),
	);
};
