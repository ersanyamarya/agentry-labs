// Sharing Claude user items with Copilot, and "Copilot in this repo" (docs/decisions.md). One hook per screen:
// the Copilot column (a checkbox per row), the C and T keys, and the preview dialog both open. Nothing shows unless Copilot's
// folder exists and it is signed in. Sharing applies to all projects, and the preview says so; `agentry fix --undo` reverts.

import { messages } from "@agentry/core/messages";
import { toast } from "sonner";
import { useAppData } from "../lib/app-data.js";
import {
  type CopilotKind,
  copilotOf,
  type Share,
  shareOf,
} from "../lib/copilot.js";
import { client } from "../lib/orpc.js";
import type { Column } from "./list-screen.js";
import { usePreviewFlow } from "./preview-flow.js";

const m = messages();
const CP = m.copilot;
const t = m.web.copilot;

// The keys, named as in useShortcuts (an arrow under a capital key reads to the linter as a component).
export const SHARE_KEY = "C";
export const TRUST_KEY = "T";

export const useCopilot = () => {
  const { data, dir } = useAppData();
  const state = copilotOf(data);
  const flow = usePreviewFlow();

  // The item's own checkbox: share when it is not shared, unshare when it is; a row that cannot be shared says why.
  const share = (cell?: Share) => {
    if (!state) {
      return;
    }
    if (!(cell?.kind && cell.name)) {
      toast.message(cell?.why ?? CP.cannot);
      return;
    }
    const { kind, name } = cell;
    const action = cell.shared ? "unshare" : "share";
    const input = { dir, action, kind, name } as const;
    flow.start({
      title: CP.preview[action](CP.kinds[kind], name),
      preview: () => client.copilot.previewCopilot(input),
      apply: () => client.copilot.applyCopilot(input),
    });
  };

  // "Copilot in this repo": the repo root joins or leaves Copilot's trusted folders.
  const trust = () => {
    if (!state) {
      return;
    }
    const action = state.trusted ? "untrust" : "trust";
    const input = { dir, action } as const;
    flow.start({
      title: CP.preview[action],
      preview: () => client.copilot.previewCopilot(input),
      apply: () => client.copilot.applyCopilot(input),
      note: state.trusted ? undefined : CP.trust.explain,
    });
  };

  // The column for a screen's rows: `forRow` says what each row can do. Empty while Copilot is not shown.
  const column = <T,>(forRow: (row: T) => Share | undefined): Column<T>[] =>
    state
      ? [
          {
            header: CP.column,
            className: "w-32",
            cell: (row) => {
              const cell = forRow(row);
              const ok = Boolean(cell?.kind && cell.name);
              const label = ok
                ? cell?.shared
                  ? CP.states.shared
                  : CP.states.notShared
                : CP.cell[cell?.state ?? "none"];
              return (
                <span
                  className="flex items-center gap-2"
                  title={
                    ok
                      ? cell?.shared
                        ? t.sharedTip
                        : t.shareTip
                      : (cell?.why ?? CP.cannot)
                  }
                >
                  <input
                    aria-label={
                      ok && cell?.kind && cell.name
                        ? t.checkboxAria(
                            CP.kinds[cell.kind],
                            cell.name,
                            cell.shared
                          )
                        : (cell?.why ?? CP.cannot)
                    }
                    checked={Boolean(cell?.shared)}
                    className="accent-primary size-4"
                    disabled={!ok}
                    onChange={() => share(cell)}
                    onClick={(event) => event.stopPropagation()}
                    type="checkbox"
                  />
                  <span className="text-muted-text text-xs">{label}</span>
                </span>
              );
            },
          },
        ]
      : [];

  return {
    column,
    dialog: flow.dialog,
    // The key hint line of a screen, with the Copilot keys added while Copilot is shown.
    hint: (base: string) => (state ? `${base} · ${t.hint}` : base),
    // C on the selected row and T for the repo switch, in the shape useListState's `keys` take.
    keys: <T,>(
      forRow: (row: T) => Share | undefined
    ): Record<string, (row: T | undefined) => void> =>
      state
        ? {
            [SHARE_KEY]: (row) => {
              if (row !== undefined) {
                share(forRow(row));
              }
            },
            [TRUST_KEY]: trust,
          }
        : {},
    share,
    // The cell of one Claude item: its name among the user items, or why this row cannot be shared.
    shareOf: (kind: CopilotKind, name?: string, fallback?: string) =>
      shareOf(state, kind, name, fallback),
    state,
    trust,
  };
};
