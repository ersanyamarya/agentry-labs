// The agentry-labs catalog: browse by bundle, install, update, and remove an installed agent. Installs and updates are
// previewed first (core's dry run). Fetching the catalog is a network call the page makes on request, never on its own.

import { messages } from "@agentry/core/messages";
import { DownloadIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData, useReload } from "../lib/app-data.js";
import { client } from "../lib/orpc.js";
import { Pill } from "./pill.js";
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
import { Kbd } from "./ui/kbd.js";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.js";

type Entry = LoadData["catalog"]["entries"][number];

const m = messages();
const t = m.web.catalog;

const BUNDLE_LABELS: Record<string, string> = { all: t.all };

const asPreview = async (call: Promise<{ ok: boolean; text: string }>) => {
  const result = await call;
  return { appliable: result.ok, text: result.text };
};

export const CatalogScreen = () => {
  const { data, dir } = useAppData();
  const reload = useReload();
  const flow = usePreviewFlow();
  const entries = useMemo(() => data?.catalog.entries ?? [], [data]);
  const bundles = useMemo(
    () => [...new Set(entries.map((entry) => entry.bundle))].sort(),
    [entries]
  );
  const filters = useMemo(
    () => ({
      all: () => true,
      ...Object.fromEntries(
        bundles.map((bundle) => [
          bundle,
          (entry: Entry) => entry.bundle === bundle,
        ])
      ),
    }),
    [bundles]
  );

  const fetchCatalog = async () => {
    try {
      const result = await client.catalog.refreshCatalog({ dir });
      (result.ok ? toast.success : toast.error)(
        result.text.split("\n").find(Boolean) ?? m.web.common.done
      );
      await reload();
    } catch (cause) {
      toast.error((cause as Error).message);
    }
  };

  // The entry waiting for the all projects / this project choice (agents and MCP servers only).
  const [choosing, setChoosing] = useState<Entry | undefined>();

  const install = (entry: Entry | undefined, project?: boolean) => {
    if (!entry || (entry.installed && !entry.outdated)) {
      return;
    }
    const names = [entry.id];
    const where = project === undefined ? {} : { project };
    flow.start({
      title: t.title(entry.outdated ? t.update : t.add, entry.name),
      preview: () =>
        asPreview(
          entry.outdated
            ? client.catalog.updateFromCatalog({ dir, names, dryRun: true })
            : client.catalog.addFromCatalog({
                dir,
                names,
                ...where,
                dryRun: true,
              })
        ),
      apply: () =>
        entry.outdated
          ? client.catalog.updateFromCatalog({ dir, names })
          : client.catalog.addFromCatalog({ dir, names, ...where }),
      note: t.note,
    });
  };
  // a adds; agents and MCP servers first ask all projects or this project. An outdated item updates instead.
  const add = (entry: Entry | undefined) => {
    if (entry && !entry.installed && ["agent", "mcp"].includes(entry.kind)) {
      setChoosing(entry);
      return;
    }
    install(entry);
  };
  const update = (entry: Entry | undefined) => {
    if (entry && !entry.outdated) {
      toast.message(m.catalog.notices.upToDate(entry.name));
      return;
    }
    install(entry);
  };
  // x keeps a copy in the backups; X (keepCopy false) keeps none.
  const removeAgent = (entry: Entry | undefined, keepCopy = true) => {
    if (entry?.kind !== "agent" || !entry.installed) {
      return;
    }
    const input = { dir, target: `agent/${entry.name}`, backup: keepCopy };
    flow.start({
      title: keepCopy
        ? t.removeAgentTitle(entry.name)
        : t.deleteAgentTitle(entry.name),
      preview: () =>
        asPreview(client.catalog.removeAgent({ ...input, dryRun: true })),
      apply: () => client.catalog.removeAgent(input),
    });
  };

  const deleteAgent = (entry: Entry | undefined) => removeAgent(entry, false);

  const list = useListState(entries, {
    id: (entry) => entry.id,
    text: (entry) => `${entry.name} ${entry.description}`,
    filters,
    paused: choosing !== undefined,
    keys: {
      a: add,
      u: update,
      x: (entry) => removeAgent(entry),
      X: deleteAgent,
      f: () => fetchCatalog(),
      i: () => toast.message(m.catalog.notices.nowPressA),
      o: () => toast.message(m.catalog.notices.nowPressA),
    },
  });

  const fetched = data?.catalog.fetched ?? false;

  return (
    <section className="flex flex-col gap-5 px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
          <p className="text-muted-text text-sm">
            {fetched ? t.summary(entries.length) : t.notFetched}
          </p>
        </div>
        <Button className="h-11 px-4" onClick={fetchCatalog} variant="outline">
          <DownloadIcon aria-hidden="true" className="size-4" />{" "}
          {fetched ? t.refresh : t.fetch} <Kbd>f</Kbd>
        </Button>
      </div>
      {fetched ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label={t.search}
              className="h-11 max-w-sm flex-1 basis-64"
              onChange={(event) => list.setQuery(event.target.value)}
              placeholder={t.search}
              ref={list.searchRef}
              value={list.query}
            />
            <ToggleGroup
              aria-label={t.bundleAria}
              className="flex-wrap"
              onValueChange={(value) => value && list.setFilter(value)}
              type="single"
              value={list.filter}
              variant="outline"
            >
              {["all", ...bundles].map((bundle) => (
                <ToggleGroupItem
                  className="h-11 px-3"
                  key={bundle}
                  value={bundle}
                >
                  {BUNDLE_LABELS[bundle] ?? bundle}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-10">
            {list.shown.map((entry) => (
              <li
                className="border-row-border flex flex-col gap-3 border-t py-5"
                key={entry.id}
              >
                <div className="flex items-center gap-2.5">
                  <h2 className="min-w-0 flex-1 font-mono text-sm font-semibold break-all">
                    {entry.name}
                  </h2>
                  <Pill tone="muted">{entry.bundle}</Pill>
                </div>
                <p className="text-body flex-1 text-sm leading-relaxed">
                  {entry.description}
                </p>
                <p className="text-muted-foreground text-xs">
                  {entry.kind}
                  {entry.tokens === null ? "" : t.tokens(entry.tokens)}
                  {entry.installed
                    ? ` · ${t.addedIn(m.catalog.item.where(entry.installed))}`
                    : ""}
                </p>
                <div className="flex gap-2">
                  <Button
                    className="h-11 flex-1"
                    disabled={Boolean(entry.installed) && !entry.outdated}
                    onClick={() =>
                      entry.outdated ? install(entry) : add(entry)
                    }
                    variant={
                      entry.installed && !entry.outdated ? "outline" : "default"
                    }
                  >
                    {entry.outdated
                      ? t.update
                      : entry.installed
                        ? t.installed
                        : t.install}
                  </Button>
                  {entry.kind === "agent" && entry.installed !== undefined ? (
                    <Button
                      className="border-error-border text-error hover:text-error h-11"
                      onClick={() => removeAgent(entry)}
                      variant="outline"
                    >
                      {m.web.common.remove}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {list.shown.length === 0 ? (
            <p className="text-muted-text text-sm">{t.nothing}</p>
          ) : null}
        </>
      ) : null}
      <Dialog
        onOpenChange={(open) => !open && setChoosing(undefined)}
        open={choosing !== undefined}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {m.catalog.notices.addTitleMenu(choosing?.name)}
            </DialogTitle>
            <DialogDescription>{t.addChoiceDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {[
              [m.catalog.notices.addAllProjects, false],
              [m.catalog.notices.addThisProject, true],
            ].map(([label, project]) => (
              <Button
                className="h-11"
                key={String(label)}
                onClick={() => {
                  install(choosing, project as boolean);
                  setChoosing(undefined);
                }}
                variant="outline"
              >
                {label}
              </Button>
            ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {flow.dialog}
    </section>
  );
};
