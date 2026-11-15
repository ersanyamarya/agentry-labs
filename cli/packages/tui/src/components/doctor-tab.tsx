// Doctor tab: findings by severity. enter previews the fix (dry run, masked), y applies it through the fix engine
// (backup, write, verify), n or esc cancels, u previews undoing the last fix set. Nothing is written without y.

import { messages } from "@agentry/core/messages";
import type { Finding } from "@agentry/core/types";
import { Box, useInput } from "ink";
import React from "react";
import { doctorRows } from "../rows.js";
import { SEVERITY, useIcons, useStyle } from "../theme.js";
import type { TabProps } from "../types.js";
import { failedText, PREVIEW_NOTE } from "../use-flow.js";
import { useList } from "../use-list.js";
import { Panes } from "./list.js";
import { Text } from "./text.js";

const text = messages().doctor.flow;

// null, or a preview waiting for y/n, or the result of applying it.
type Step =
  | { kind: "fix"; finding: Finding; text: string; appliable: boolean }
  | { kind: "undo"; text: string; appliable: boolean }
  | { kind: "result"; ok: boolean; text: string };

export const DoctorTab = ({
  data,
  api,
  dir,
  active,
  height,
  layout,
  notify,
  reload,
  lock,
  openFile,
  copy,
}: Omit<TabProps, "setKeys">) => {
  const icons = useIcons();
  const all = React.useMemo(() => doctorRows(data, icons), [data, icons]);
  const list = useList({ rows: all, lock, marks: false });
  const { rows, cursor, row, move } = list;
  const [step, setStep] = React.useState<Step | null>(null);
  const waiting = step && step.kind !== "result";
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is meant to run only when the listed value changes
  React.useEffect(() => lock(Boolean(waiting)), [waiting]);

  const preview = async () => {
    if (row?.kind !== "finding" || !row.finding) {
      return;
    }
    const result = await api.previewFix({ dir, finding: row.finding });
    setStep({ kind: "fix", finding: row.finding, ...result });
    notify(PREVIEW_NOTE);
  };
  const previewUndo = async () => {
    const result = await api.previewUndo({ dir });
    setStep({ kind: "undo", ...result });
    notify(PREVIEW_NOTE);
  };
  const confirm = async () => {
    const current = step;
    if (!current || current.kind === "result") {
      return;
    }
    setStep({ kind: "result", ok: true, text: messages().flows.working });
    const result =
      current.kind === "undo"
        ? await api.applyUndo({ dir })
        : await api.applyFix({ dir, finding: current.finding });
    setStep({
      kind: "result",
      ...result,
      text: result.ok
        ? result.text
        : failedText(
            current.kind === "undo"
              ? text.undoFailed
              : text.fixFailed(current.finding.id),
            result.text
          ),
    });
    notify(
      result.ok
        ? current.kind === "undo"
          ? text.undone
          : text.fixApplied
        : messages().flows.finishedWithErrors
    );
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
      if (step && step.kind !== "result") {
        if (input === "y" && step.appliable) {
          confirm();
        } else if (input === "n" || key.escape) {
          setStep(null);
          notify(text.cancelled);
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
    { isActive: active }
  );

  const lines = step
    ? step.kind === "result"
      ? step.text.split("\n")
      : [
          ...step.text.split("\n"),
          "",
          step.appliable
            ? step.kind === "undo"
              ? messages().flows.restorePrompt
              : messages().flows.applyPrompt
            : messages().flows.nothingToApply,
        ]
    : undefined;
  const title = step
    ? step.kind === "result"
      ? step.ok
        ? messages().flows.resultTitle
        : messages().flows.resultErrorsTitle
      : step.kind === "undo"
        ? text.undoTitle
        : text.fixTitle
    : text.details;
  const style = useStyle();
  const { error, warning, info } = data.doctor.summary;
  return (
    <Box flexDirection="column">
      <Text>
        <Text {...style(SEVERITY.error.style)}>{text.errors(error)}</Text>
        {", "}
        <Text {...style(SEVERITY.warning.style)}>{text.warnings(warning)}</Text>
        {", "}
        <Text {...style(SEVERITY.info.style)}>{text.info(info)}</Text>
      </Text>
      <Panes
        cursor={cursor}
        height={height}
        layout={layout}
        lines={lines}
        row={row}
        rows={rows}
        status={list.status}
        title={title}
      />
    </Box>
  );
};
