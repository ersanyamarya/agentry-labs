// Plugins: turn one on or off (enabledPlugins in settings) and install or uninstall through `claude plugin`. Each write is
// core's preview/apply pair, and a change reaches new sessions only.

import { messages } from "@agentry/core/messages";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData } from "../lib/app-data.js";
import { client } from "../lib/orpc.js";
import { ActionButton } from "./action-button.js";
import { DetailsPanel, NoSelection } from "./details-panel.js";
import { ListScreen } from "./list-screen.js";
import { Pill, stateTone } from "./pill.js";
import { usePreviewFlow } from "./preview-flow.js";
import { Button } from "./ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";
import { Switch } from "./ui/switch.js";

const m = messages();
const t = m.web.plugins;

export const PLUGIN_NOTE = t.note;

type PluginRow = LoadData["status"]["plugins"]["items"][number];

const FILTERS = {
  all: () => true,
  on: (row: PluginRow) => row.state === "active",
  off: (row: PluginRow) => row.state !== "active",
};

export const PluginsScreen = () => {
  const { data, dir } = useAppData();
  const flow = usePreviewFlow();
  const [installing, setInstalling] = useState(false);
  const [name, setName] = useState("");
  const rows = useMemo(() => data?.status.plugins.items ?? [], [data]);

  const turn = (target: PluginRow | undefined) => {
    if (!target) {
      return;
    }
    const input = { dir, id: target.id, enable: target.state !== "active" };
    flow.start({
      title: t.turnTitle(
        input.enable ? m.web.common.turnOn : m.web.common.turnOff,
        target.id
      ),
      preview: () => client.plugins.previewPlugin(input),
      apply: () => client.plugins.applyPlugin(input),
      note: PLUGIN_NOTE,
    });
  };
  const uninstall = (target: PluginRow | undefined) => {
    if (!target) {
      return;
    }
    const input = { dir, action: "uninstall" as const, name: target.id };
    flow.start({
      title: t.uninstallTitle(target.id),
      preview: () => client.plugins.previewPluginInstall(input),
      apply: () => client.plugins.applyPluginInstall(input),
      note: PLUGIN_NOTE,
    });
  };
  const install = () => {
    const input = { dir, action: "install" as const, name: name.trim() };
    flow.start({
      title: t.installTitle(input.name),
      preview: () => client.plugins.previewPluginInstall(input),
      apply: () => client.plugins.applyPluginInstall(input),
      note: PLUGIN_NOTE,
    });
    setInstalling(false);
  };

  const list = useListState(rows, {
    id: (item) => item.id,
    text: (item) => `${item.name} ${item.marketplace}`,
    filters: FILTERS,
    paused: installing,
    keys: {
      space: (item, event) => {
        event.preventDefault();
        turn(item);
      },
      x: uninstall,
      i: () => setInstalling(true),
    },
  });
  const current = list.selected;

  return (
    <>
      <ListScreen<PluginRow>
        action={
          <Button
            className="h-11 px-4"
            onClick={() => {
              setName("");
              setInstalling(true);
            }}
          >
            <PlusIcon aria-hidden="true" className="size-4" /> {t.installPlugin}
          </Button>
        }
        columns={[
          {
            header: m.web.common.on,
            className: "w-14",
            cell: (item) => (
              <Switch
                aria-label={t.turnAria(item.id, item.state === "active")}
                checked={item.state === "active"}
                onCheckedChange={() => turn(item)}
                onClick={(event) => event.stopPropagation()}
              />
            ),
          },
          {
            header: t.plugin,
            cell: (item) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-medium">
                  {item.name}
                </span>
                <span className="text-muted-text truncate text-xs">
                  {item.marketplace}
                  {item.version ? t.version(item.version) : ""}
                  {t.cellTokens(item.skillTokens)}
                </span>
              </div>
            ),
          },
          {
            header: m.web.common.state,
            className: "w-40",
            cell: (item) => (
              <Pill tone={stateTone(item.state)}>{item.state}</Pill>
            ),
          },
        ]}
        details={
          current ? (
            <DetailsPanel
              actions={
                <>
                  <ActionButton keyHint="space" onClick={() => turn(current)}>
                    {current.state === "active"
                      ? m.web.common.turnOff
                      : m.web.common.turnOn}
                  </ActionButton>
                  <ActionButton
                    danger
                    keyHint="x"
                    onClick={() => uninstall(current)}
                  >
                    {t.uninstall}
                  </ActionButton>
                </>
              }
              badge={
                <Pill tone={stateTone(current.state)}>{current.state}</Pill>
              }
              fields={[
                [
                  t.id,
                  <span className="font-mono text-xs" key="i">
                    {current.id}
                  </span>,
                ],
                [t.versionLabel, current.version ?? "-"],
                [t.skills, t.skillTokens(current.skillTokens)],
                [
                  t.turnedOnBy,
                  `${current.enabledBy.scope}: ${String(current.enabledBy.value)}`,
                ],
              ]}
              note={PLUGIN_NOTE}
              title={current.name}
            />
          ) : (
            <NoSelection what={t.selectOne} />
          )
        }
        detailsLabel={t.detailsLabel}
        empty={t.empty}
        filter={{
          value: list.filter,
          onChange: list.setFilter,
          options: [
            {
              value: "all",
              label: m.web.common.all,
              count: list.counts.all ?? 0,
            },
            { value: "on", label: m.web.common.on, count: list.counts.on ?? 0 },
            {
              value: "off",
              label: m.web.common.off,
              count: list.counts.off ?? 0,
            },
          ],
        }}
        hint={t.hint}
        onSelect={list.setSelectedId}
        rowId={(item) => item.id}
        rows={list.shown}
        search={{
          inputRef: list.searchRef,
          value: list.query,
          onChange: list.setQuery,
          placeholder: t.searchPlaceholder,
        }}
        selectedId={list.selectedId}
        setSheetOpen={list.setSheetOpen}
        sheetOpen={list.sheetOpen}
        summary={t.summary(rows.length, list.counts.on ?? 0)}
        title={t.title}
      />
      <Dialog onOpenChange={setInstalling} open={installing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plugin-name">{t.plugin}</Label>
            <Input
              id="plugin-name"
              onChange={(event) => setName(event.target.value)}
              placeholder={t.namePlaceholder}
              value={name}
            />
          </div>
          <DialogFooter>
            <Button
              className="h-11"
              disabled={!/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test(name.trim())}
              onClick={install}
            >
              {t.preview}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {flow.dialog}
    </>
  );
};
