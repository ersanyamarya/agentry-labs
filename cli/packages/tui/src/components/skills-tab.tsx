// Skills tab: shelf groups (expand to skills, toggle on/off for this project or globally) and what else loads.

import { messages } from "@agentry/core/messages";
import { Box, useInput } from "ink";
import React from "react";
import { startBulk } from "../bulk-flow.js";
import { startScopeMove } from "../move-flow.js";
import { startPluginToggle } from "../plugin-flow.js";
import { startRemove } from "../remove-flow.js";
import { skillKeys, skillRows } from "../rows.js";
import type { Row, TabProps } from "../types.js";
import { useFlow } from "../use-flow.js";
import { useList } from "../use-list.js";
import { Panes } from "./list.js";

const { flows, skills } = messages();
const text = skills.notices;

export const SkillsTab = ({
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
  setKeys,
  copy,
}: TabProps) => {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const all = React.useMemo(() => skillRows(data, expanded), [data, expanded]);
  const list = useList({ rows: all, lock });
  const { rows, cursor, row, move } = list;

  const flow = useFlow({ lock, notify, reload, copy });
  // The footer follows the selected row.
  const keys = skillKeys(row);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect is meant to run only when the listed value changes
  React.useEffect(() => {
    if (active) {
      setKeys(keys);
    }
  }, [active, keys.join()]);

  const badName = (name: string) =>
    name === "" ||
    name.includes("/") ||
    name.startsWith(".") ||
    name === "agents"
      ? text.badGroupName(name)
      : undefined;

  // shelve: choose a group (or type a new one), preview with the shelf's own dry run, move on y.
  const previewShelve = async (
    skill: string,
    group: string,
    project: boolean
  ) => {
    const preview = await api.shelveSkill({
      dir,
      skill,
      group,
      project,
      dryRun: true,
    });
    return {
      kind: "confirm" as const,
      title: text.shelvePreviewTitle,
      text: preview.text,
      appliable: preview.ok,
      apply: () => api.shelveSkill({ dir, skill, group, project }),
      done: text.shelved(skill, group),
    };
  };
  const startShelve = (project: boolean) => {
    const skill = row?.skill ?? "";
    const groups = data.groups.map((group) => group.name);
    const typeName = () => ({
      kind: "name" as const,
      title: text.newGroupTitle(skill),
      label: text.newGroupLabel,
      intro: [text.newGroupIntro],
      onSubmit: (name: string) =>
        badName(name)
          ? { kind: "result" as const, ok: false, text: badName(name) ?? "" }
          : previewShelve(skill, name, project),
    });
    flow.begin(
      groups.length === 0
        ? typeName()
        : {
            kind: "pick",
            title: text.chooseTitle(skill),
            intro: [text.chooseIntro(skill)],
            options: groups,
            onPick: (group: string) => previewShelve(skill, group, project),
            onNew: typeName,
          }
    );
  };
  const startUnshelve = async () => {
    const target = `${row?.group}/${row?.skill}`;
    const preview = await api.unshelveSkill({ dir, target, dryRun: true });
    flow.begin({
      kind: "confirm",
      title: text.unshelvePreviewTitle,
      text: preview.text,
      appliable: preview.ok,
      apply: () => api.unshelveSkill({ dir, target }),
      done: text.unshelved(target),
    });
  };

  // space toggles the row in this project, g globally; plugin rows toggle the plugin either way.
  const toggle = async (global = false) => {
    if (row?.plugin) {
      await startPluginToggle({ api, dir, flow, row });
      return;
    }
    if (row?.why) {
      notify(row.why);
      return;
    }
    if (row?.kind === "agent") {
      notify(text.agentsSwitch);
      return;
    }
    if (row?.kind !== "group" && row?.kind !== "skill") {
      return;
    }
    const on = !(global ? row.globalOn : row.projectOn);
    const result = await api.toggleShelf({
      dir,
      target: row.target ?? "",
      on,
      global,
    });
    notify(result.message);
    await reload();
  };

  // Marked rows (m): one combined preview and one y for the whole set, through the same lib calls as a single row.
  const bulkToggle = (global: boolean) => {
    const items = list.marked.filter(
      (one) => one.kind === "group" || one.kind === "skill"
    );
    if (items.length === 0) {
      return notify(text.markedNotSwitchable);
    }
    const on = !items.every((one) => (global ? one.globalOn : one.projectOn));
    const where = global ? text.whereGlobal : text.whereProject;
    return startBulk({
      flow,
      title: text.turnTitle(on, where),
      items,
      preview: (one) => ({
        appliable: true,
        text: text.link(on, one.target, where),
      }),
      apply: async (one) => {
        const result = await api.toggleShelf({
          dir,
          target: one.target ?? "",
          on,
          global,
        });
        return { ok: result.ok, text: result.message };
      },
      done: text.turned(on, where),
    });
  };
  const removeArgs = (
    one: Row
  ): { target: string; project?: boolean } | undefined =>
    one.kind === "skill"
      ? { target: one.target ?? "" }
      : one.projectOnly
        ? { target: one.skill ?? "", project: true }
        : one.shelvable
          ? { target: one.skill ?? "" }
          : undefined;
  const bulkRemove = (backup: boolean) => {
    const items = list.marked.filter(removeArgs);
    return items.length === 0
      ? notify(text.markedNotRemovable)
      : startBulk({
          flow,
          title: flows.removeSkills,
          items,
          preview: async (one) => {
            const result = await api.removeSkill({
              dir,
              // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
              ...removeArgs(one)!,
              backup,
              dryRun: true,
            });
            return { appliable: result.ok, text: result.text };
          },
          // biome-ignore lint/style/noNonNullAssertion: the caller only reaches this path when the field is set
          apply: (one) => api.removeSkill({ dir, ...removeArgs(one)!, backup }),
          done: flows.removedMany(backup),
        });
  };

  useInput(
    (input, key) => {
      if (flow.handleKey(input, key) || list.handleKey(input, key)) {
        return;
      }
      if (key.upArrow || key.downArrow) {
        flow.clear();
        move(key.upArrow ? -1 : 1);
      } else if (input === "s") {
        if (row?.shelvable || row?.projectOnly) {
          startShelve(Boolean(row.projectOnly));
        } else {
          notify(
            row?.kind === "global"
              ? (row.why ?? "")
              : row?.kind === "skill"
                ? text.alreadyShelved
                : text.shelveHint
          );
        }
      } else if (input === "u") {
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        row?.kind === "skill" ? startUnshelve() : notify(text.unshelveHint);
      } else if (key.return && row?.kind === "group") {
        setExpanded((open) => {
          const next = new Set(open);
          const group = row.group ?? "";
          // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
          next.has(group) ? next.delete(group) : next.add(group);
          return next;
        });
      } else if ((input === " " || input === "g") && list.marked.length > 0) {
        bulkToggle(input === "g");
      } else if ((input === "x" || input === "X") && list.marked.length > 0) {
        bulkRemove(input === "x");
      } else if (input === " ") {
        toggle();
      } else if (input === "g") {
        toggle(true);
      } else if (input === "x" || input === "X") {
        const backup = input === "x";
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        row?.kind === "skill"
          ? startRemove({
              api,
              dir,
              flow,
              backup,
              target: row.target ?? "",
              label: row.target,
            })
          : row?.projectOnly
            ? startRemove({
                api,
                dir,
                flow,
                backup,
                target: row.skill ?? "",
                project: true,
                label: text.projectLabel(row.skill),
              })
            : row?.shelvable
              ? startRemove({
                  api,
                  dir,
                  flow,
                  backup,
                  target: row.skill ?? "",
                  label: text.globalLabel(row.skill),
                })
              : notify(text.removeHint);
      } else if (input === "a" || input === "o") {
        const promote = input === "a";
        // biome-ignore lint/suspicious/noUnusedExpressions: short-circuit or ternary used as a statement, kept as written
        (promote ? row?.projectOnly : row?.shelvable)
          ? startScopeMove({ api, dir, flow, skill: row?.skill ?? "", promote })
          : notify(promote ? text.moveToAllHint : text.moveToProjectHint);
      } else if (input === "e") {
        openFile(row?.file);
      }
    },
    { isActive: active }
  );

  return (
    <Box flexDirection="column">
      <Panes
        cursor={cursor}
        height={height}
        layout={layout}
        lines={flow.lines}
        marked={list.markedIds}
        row={row}
        rows={rows}
        status={list.status}
        title={flow.title}
      />
    </Box>
  );
};
