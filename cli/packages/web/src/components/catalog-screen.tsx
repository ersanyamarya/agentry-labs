// The agentry-labs catalog: browse by bundle, install, update, and remove an installed agent. Installs and updates are
// previewed first (core's dry run). Fetching the catalog is a network call the page makes on request, never on its own.

import { DownloadIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData, useReload } from "../lib/app-data.js";
import { client } from "../lib/orpc.js";
import { Pill } from "./pill.js";
import { usePreviewFlow } from "./preview-flow.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Kbd } from "./ui/kbd.js";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.js";

type Entry = LoadData["catalog"]["entries"][number];

const BUNDLE_LABELS: Record<string, string> = { all: "All" };

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
        result.text.split("\n").find(Boolean) ?? "Done."
      );
      await reload();
    } catch (cause) {
      toast.error((cause as Error).message);
    }
  };

  const install = (entry: Entry | undefined) => {
    if (!entry || (entry.installed && !entry.outdated)) {
      return;
    }
    const names = [entry.id];
    flow.start({
      title: `${entry.outdated ? "Update" : "Add"} ${entry.name}`,
      preview: () =>
        asPreview(
          entry.outdated
            ? client.catalog.updateFromCatalog({ dir, names, dryRun: true })
            : client.catalog.addFromCatalog({ dir, names, dryRun: true })
        ),
      apply: () =>
        entry.outdated
          ? client.catalog.updateFromCatalog({ dir, names })
          : client.catalog.addFromCatalog({ dir, names }),
      note: "Skills go to the shelf, off. An update keeps a copy of the old one in the backups.",
    });
  };
  const removeAgent = (entry: Entry | undefined) => {
    if (entry?.kind !== "agent" || !entry.installed) {
      return;
    }
    const input = { dir, target: `agent/${entry.name}`, backup: true };
    flow.start({
      title: `Remove agent ${entry.name}`,
      preview: () =>
        asPreview(client.catalog.removeAgent({ ...input, dryRun: true })),
      apply: () => client.catalog.removeAgent(input),
    });
  };

  const list = useListState(entries, {
    id: (entry) => entry.id,
    text: (entry) => `${entry.name} ${entry.description}`,
    filters,
    keys: { i: install, u: install, x: removeAgent, f: () => fetchCatalog() },
  });

  const fetched = data?.catalog.fetched ?? false;

  return (
    <section className="flex flex-col gap-5 px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
          <p className="text-muted-text text-sm">
            {fetched
              ? `${entries.length} items from agentry-labs, ready to install into this project or globally`
              : "Not fetched yet."}
          </p>
        </div>
        <Button className="h-11 px-4" onClick={fetchCatalog} variant="outline">
          <DownloadIcon aria-hidden="true" className="size-4" />{" "}
          {fetched ? "Refresh" : "Fetch the catalog"} <Kbd>f</Kbd>
        </Button>
      </div>
      {fetched ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Search the catalog"
              className="h-11 max-w-sm flex-1 basis-64"
              onChange={(event) => list.setQuery(event.target.value)}
              placeholder="Search the catalog"
              ref={list.searchRef}
              value={list.query}
            />
            <ToggleGroup
              aria-label="Bundle"
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
                  {entry.tokens === null ? "" : ` · ~${entry.tokens} tokens`}
                </p>
                <div className="flex gap-2">
                  <Button
                    className="h-11 flex-1"
                    disabled={Boolean(entry.installed) && !entry.outdated}
                    onClick={() => install(entry)}
                    variant={
                      entry.installed && !entry.outdated ? "outline" : "default"
                    }
                  >
                    {entry.outdated
                      ? "Update"
                      : entry.installed
                        ? "Installed"
                        : "Install"}
                  </Button>
                  {entry.kind === "agent" && entry.installed !== undefined ? (
                    <Button
                      className="border-error-border text-error hover:text-error h-11"
                      onClick={() => removeAgent(entry)}
                      variant="outline"
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {list.shown.length === 0 ? (
            <p className="text-muted-text text-sm">Nothing matches.</p>
          ) : null}
        </>
      ) : null}
      {flow.dialog}
    </section>
  );
};
