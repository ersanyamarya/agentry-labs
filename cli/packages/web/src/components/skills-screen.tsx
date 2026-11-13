// Skills: shelved skills (from the shelf groups), skills installed in ~/.claude or this project, and plugin skills.
// Every write calls the same core function the terminal UI calls, so the same backups are made.

import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useShortcuts } from "../hooks/use-shortcuts.js";
import { useAppData, useReload } from "../lib/app-data.js";
import { orpc } from "../lib/orpc.js";
import { useScope } from "../lib/scope.js";
import {
  type Filter,
  filterCounts,
  filterRows,
  isOn,
  type SkillRow,
  scopeLabel,
  skillRows,
} from "../lib/skill-rows.js";
import { ListScreen } from "./list-screen.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog.js";
import { Badge } from "./ui/badge.js";
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
import { Switch } from "./ui/switch.js";

const SCOPE_BADGE: Record<string, string> = {
  Global: "bg-on-bg text-on",
  "This project": "bg-project-bg text-project",
  "Global + project": "bg-on-bg text-on",
  Shelf: "bg-muted text-muted-text",
  Plugin: "bg-muted text-muted-text",
};

const ScopeBadge = ({ row }: { row: SkillRow }) => {
  const label = scopeLabel(row);
  return (
    <Badge
      className={`rounded-full border-0 font-medium ${SCOPE_BADGE[label]}`}
      variant="outline"
    >
      {label}
    </Badge>
  );
};

const tokensText = (tokens: number | null) =>
  tokens === null ? "tokens not measured" : `~${tokens} tokens`;

export const SkillsScreen = () => {
  const { data, dir } = useAppData();
  const { scope } = useScope();
  const reload = useReload();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shelving, setShelving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [group, setGroup] = useState("");

  const all = useMemo(() => (data ? skillRows(data) : []), [data]);
  const rows = useMemo(
    () => filterRows(all, filter, query),
    [all, filter, query]
  );
  const counts = filterCounts(all);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];

  const done = (result: { ok: boolean; text: string }) => {
    const first =
      result.text.split("\n").find(Boolean) ??
      (result.ok ? "Done." : "Failed.");
    (result.ok ? toast.success : toast.error)(first);
    reload();
  };
  const options = {
    onSuccess: done,
    onError: (error: Error) => toast.error(error.message),
  };
  const toggle = useMutation(orpc.skills.toggleShelf.mutationOptions(options));
  const shelve = useMutation(orpc.skills.shelveSkill.mutationOptions(options));
  const unshelve = useMutation(
    orpc.skills.unshelveSkill.mutationOptions(options)
  );
  const promote = useMutation(
    orpc.skills.promoteSkill.mutationOptions(options)
  );
  const demote = useMutation(orpc.skills.demoteSkill.mutationOptions(options));
  const remove = useMutation(orpc.skills.removeSkill.mutationOptions(options));

  const flip = (row: SkillRow) => {
    if (row.kind !== "shelf") {
      toast.message(
        `${row.name} is installed, so it is always on. Shelve it to turn it off.`
      );
      return;
    }
    toggle.mutate({
      dir,
      target: row.target,
      on: !isOn(row, scope),
      global: scope === "global",
    });
  };
  const canShelve = (row?: SkillRow) =>
    row?.kind === "global" || row?.kind === "project";
  const canRemove = (row?: SkillRow) =>
    row !== undefined && row.kind !== "plugin";

  const move = (step: number) => {
    const index = rows.findIndex((row) => row.id === selected?.id);
    const next = rows[Math.min(Math.max(index + step, 0), rows.length - 1)];
    if (next) {
      setSelectedId(next.id);
    }
  };
  const busy = shelving || removing;
  useShortcuts(
    {
      down: (event) => {
        event.preventDefault();
        move(1);
      },
      up: (event) => {
        event.preventDefault();
        move(-1);
      },
      space: (event) => {
        event.preventDefault();
        if (selected) {
          flip(selected);
        }
      },
      "/": (event) => {
        event.preventDefault();
        searchRef.current?.focus();
      },
      s: () => canShelve(selected) && setShelving(true),
      x: () => canRemove(selected) && setRemoving(true),
    },
    !busy
  );

  const details = selected ? (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex-1 font-mono text-base font-semibold break-all">
          {selected.group ? `${selected.group}/` : ""}
          {selected.name}
        </span>
        <ScopeBadge row={selected} />
      </div>
      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Path</dt>
        <dd className="text-body font-mono text-xs break-all">
          {selected.source}
        </dd>
        <dt className="text-muted-foreground">Cost</dt>
        <dd className="text-body">{tokensText(selected.tokens)}</dd>
        {selected.group ? (
          <>
            <dt className="text-muted-foreground">Group</dt>
            <dd className="text-body font-mono text-xs">{selected.group}</dd>
          </>
        ) : null}
        {selected.broken ? (
          <>
            <dt className="text-muted-foreground">State</dt>
            <dd className="text-error">broken link</dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        {canShelve(selected) ? (
          <Button
            className="h-11 flex-1"
            onClick={() => setShelving(true)}
            variant="outline"
          >
            Shelve <Kbd>s</Kbd>
          </Button>
        ) : null}
        {selected.kind === "shelf" ? (
          <Button
            className="h-11 flex-1"
            onClick={() => unshelve.mutate({ dir, target: selected.target })}
            variant="outline"
          >
            Unshelve
          </Button>
        ) : null}
        {selected.kind === "global" ? (
          <Button
            className="h-11 flex-1"
            onClick={() => demote.mutate({ dir, skill: selected.name })}
            variant="outline"
          >
            Only this project
          </Button>
        ) : null}
        {selected.kind === "project" ? (
          <Button
            className="h-11 flex-1"
            onClick={() => promote.mutate({ dir, skill: selected.name })}
            variant="outline"
          >
            All projects
          </Button>
        ) : null}
        {canRemove(selected) ? (
          <Button
            className="border-error-border text-error hover:text-error h-11 flex-1"
            onClick={() => setRemoving(true)}
            variant="outline"
          >
            Remove <Kbd className="text-error">x</Kbd>
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Changes apply to {data?.paths.configDir ?? "~/.claude"} or this project.
        Every removal keeps a copy under{" "}
        {data?.paths.backupsDir ?? "the backups folder"} that Backups can
        restore.
      </p>
    </div>
  ) : (
    <p className="text-muted-text text-sm">
      Select a skill to see its details.
    </p>
  );

  return (
    <>
      <ListScreen<SkillRow>
        action={
          <Button asChild className="h-11 px-4">
            <a href="/catalog">
              <PlusIcon aria-hidden="true" className="size-4" />
              Add from catalog
            </a>
          </Button>
        }
        columns={[
          {
            header: "On",
            className: "w-14",
            cell: (row) => (
              <Switch
                aria-label={`Turn ${row.name} ${isOn(row, scope) ? "off" : "on"}`}
                checked={isOn(row, scope)}
                disabled={row.kind !== "shelf"}
                onCheckedChange={() => flip(row)}
                onClick={(event) => event.stopPropagation()}
              />
            ),
          },
          {
            header: "Name",
            cell: (row) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-medium">
                  {row.name}
                </span>
                <span className="text-muted-text truncate text-xs">
                  {row.group ? `${row.group} · ` : ""}
                  {tokensText(row.tokens)}
                </span>
              </div>
            ),
          },
          {
            header: "Scope",
            className: "w-36",
            cell: (row) => <ScopeBadge row={row} />,
          },
        ]}
        details={details}
        detailsLabel="Skill details"
        empty={
          all.length === 0
            ? "No skills yet. Add one from the catalog."
            : "No skills match."
        }
        filter={{
          value: filter,
          onChange: (value) => setFilter(value as Filter),
          options: [
            { value: "all", label: "All", count: counts.all },
            { value: "on", label: "On", count: counts.on },
            { value: "project", label: "This project", count: counts.project },
            { value: "shelf", label: "Shelf", count: counts.shelf },
          ],
        }}
        hint="↑↓ move · space toggle · s shelve · x remove · / search"
        onSelect={setSelectedId}
        rowId={(row) => row.id}
        rows={rows}
        search={{
          inputRef: searchRef,
          value: query,
          onChange: setQuery,
          placeholder: "Search skills",
        }}
        selectedId={selected?.id}
        setSheetOpen={setSheetOpen}
        sheetOpen={sheetOpen}
        summary={`${all.length} skills · ${counts.on} on · ${counts.shelf} on the shelf`}
        title="Skills"
      />
      <Dialog onOpenChange={setShelving} open={shelving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shelve {selected?.name}</DialogTitle>
            <DialogDescription>
              The skill moves to the shelf, off. Pick an existing group or type
              a new name.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Shelf group"
            list="shelf-groups"
            onChange={(event) => setGroup(event.target.value)}
            placeholder="Group name"
            value={group}
          />
          <datalist id="shelf-groups">
            {(data?.groups.items ?? []).map((item) => (
              <option key={item.name} value={item.name} />
            ))}
          </datalist>
          <DialogFooter>
            <Button
              className="h-11"
              disabled={group.trim() === "" || selected === undefined}
              onClick={() => {
                if (selected) {
                  shelve.mutate({
                    dir,
                    skill: selected.name,
                    group: group.trim(),
                    project: selected.kind === "project",
                  });
                }
                setShelving(false);
              }}
            >
              Shelve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setRemoving} open={removing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selected?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {selected?.source}. A copy is kept under{" "}
              {data?.paths.backupsDir}, and Backups can restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              onClick={() => {
                if (selected) {
                  remove.mutate({
                    dir,
                    target:
                      selected.kind === "shelf"
                        ? selected.target
                        : selected.name,
                    project: selected.kind === "project",
                    backup: true,
                  });
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
