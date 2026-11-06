// Skills tab: shelf groups (expand to skills, toggle on/off for this project or globally) and what else loads.

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
import { Legend } from "./legend.js";
import { Panes } from "./list.js";

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
      ? `Not a usable group name: "${name}" (no slash, no leading dot, not "agents")`
      : undefined;

  // shelve: choose a group (or type a new one), preview with the shelf's own dry run, move on y.
  const previewShelve = async (skill: string, group: string) => {
    const preview = await api.shelveSkill({ dir, skill, group, dryRun: true });
    return {
      kind: "confirm" as const,
      title: "Shelve preview (dry run)",
      text: preview.text,
      appliable: preview.ok,
      apply: () => api.shelveSkill({ dir, skill, group }),
      done: `Shelved ${skill} into ${group}; it is off, toggle it with space.`,
    };
  };
  const startShelve = () => {
    const skill = row?.skill ?? "";
    const groups = data.groups.map((group) => group.name);
    const typeName = () => ({
      kind: "name" as const,
      title: `Shelve ${skill}: new group`,
      label: "Group name",
      intro: ["Type the name of the new shelf group."],
      onSubmit: (name: string) =>
        badName(name)
          ? { kind: "result" as const, ok: false, text: badName(name) ?? "" }
          : previewShelve(skill, name),
    });
    flow.begin(
      groups.length === 0
        ? typeName()
        : {
            kind: "pick",
            title: `Shelve ${skill}: choose a group`,
            intro: [`Move ${skill} onto the shelf in which group?`],
            options: groups,
            onPick: (group: string) => previewShelve(skill, group),
            onNew: typeName,
          }
    );
  };
  const startUnshelve = async () => {
    const target = `${row?.group}/${row?.skill}`;
    const preview = await api.unshelveSkill({ dir, target, dryRun: true });
    flow.begin({
      kind: "confirm",
      title: "Unshelve preview (dry run)",
      text: preview.text,
      appliable: preview.ok,
      apply: () => api.unshelveSkill({ dir, target }),
      done: `Unshelved ${target} into ~/.claude/skills.`,
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
      notify("Agents switch with their group: toggle the group row.");
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
      return notify(
        "Marked rows are not shelf groups or skills: nothing to switch."
      );
    }
    const on = !items.every((one) => (global ? one.globalOn : one.projectOn));
    const where = global ? "globally" : "for this project";
    return startBulk({
      flow,
      title: `Turn ${on ? "on" : "off"} ${where}`,
      items,
      preview: (one) => ({
        appliable: true,
        text: `${on ? "Link" : "Unlink"} ${one.target} ${where}.`,
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
      done: `Turned ${on ? "on" : "off"} ${where}`,
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
      ? notify(
          "Marked rows cannot be removed here (shelved, global or project-only skills only)."
        )
      : startBulk({
          flow,
          title: "Remove skills",
          items,
          preview: async (one) => {
            const result = await api.removeSkill({
              dir,
              ...removeArgs(one)!,
              backup,
              dryRun: true,
            });
            return { appliable: result.ok, text: result.text };
          },
          apply: (one) => api.removeSkill({ dir, ...removeArgs(one)!, backup }),
          done: backup
            ? "Removed; copies are in ~/.claude/backups/agentry/removed/"
            : "Removed; no copies were kept",
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
        if (row?.shelvable) {
          startShelve();
        } else {
          notify(
            row?.kind === "global"
              ? (row.why ?? "")
              : row?.kind === "skill"
                ? "Already on the shelf; press u to move it back to ~/.claude/skills."
                : "s shelves a global skill: select one under Global skills."
          );
        }
      } else if (input === "u") {
        row?.kind === "skill"
          ? startUnshelve()
          : notify(
              "u unshelves a shelved skill: expand a group and select one."
            );
      } else if (key.return && row?.kind === "group") {
        setExpanded((open) => {
          const next = new Set(open);
          const group = row.group ?? "";
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
                label: `${row.skill} (project)`,
              })
            : row?.shelvable
              ? startRemove({
                  api,
                  dir,
                  flow,
                  backup,
                  target: row.skill ?? "",
                  label: `${row.skill} (global)`,
                })
              : notify(
                  "x removes a shelved, global or project-only skill folder (X keeps no copy): select one."
                );
      } else if (input === "a" || input === "o") {
        const promote = input === "a";
        (promote ? row?.projectOnly : row?.shelvable)
          ? startScopeMove({ api, dir, flow, skill: row?.skill ?? "", promote })
          : notify(
              promote
                ? "a moves a project-only skill to ~/.claude/skills (all projects): select one under This project only."
                : "o moves a global skill into this project only: select one under Global skills."
            );
      } else if (input === "e") {
        openFile(row?.file);
      }
    },
    { isActive: active }
  );

  return (
    <Box flexDirection="column">
      <Legend />
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
