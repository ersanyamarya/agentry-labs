// Skills: shelved skills (from the shelf groups), skills installed in ~/.claude or this project, and plugin skills.
// Every write calls the same core function the terminal UI calls, so the same backups are made.

import { messages } from "@agentry/core/messages";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useShortcuts } from "../hooks/use-shortcuts.js";
import { useAppData, useReload } from "../lib/app-data.js";
import { client, orpc } from "../lib/orpc.js";
import { useScope } from "../lib/scope.js";
import {
  type Filter,
  filterCounts,
  filterRows,
  groupSummaries,
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

const m = messages();
const t = m.web.skills;

const SCOPE_BADGE: Record<string, string> = {
  [t.scope.global]: "bg-on-bg text-on",
  [t.scope.project]: "bg-project-bg text-project",
  [t.scope.globalAndProject]: "bg-on-bg text-on",
  [t.scope.library]: "bg-muted text-muted-text",
  [t.scope.plugin]: "bg-muted text-muted-text",
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

function canShelve(row?: SkillRow) {
  return row?.kind === "global" || row?.kind === "project";
}

// The moves that apply to a row, as in the terminal UI's menu: a library skill goes to all projects, a folder in
// ~/.claude/skills to the library or this project only, a project folder to the library or all projects.
type Move = "library" | "all" | "project";
const MOVES: Record<string, Move[]> = {
  shelf: ["all"],
  global: ["library", "project"],
  project: ["library", "all"],
};
const movesFor = (row?: SkillRow): Move[] =>
  row ? (MOVES[row.kind] ?? []) : [];
function canRemove(row?: SkillRow) {
  return row !== undefined && row.kind !== "plugin";
}

const MOVE_LABELS: Record<Move, string> = {
  library: m.skills.notices.moveToLibrary,
  all: m.skills.notices.moveToAll,
  project: m.skills.notices.moveToProject,
};

const tokensText = (tokens: number | null) =>
  tokens === null ? t.tokensNotMeasured : t.tokens(tokens);

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
  const [keepCopy, setKeepCopy] = useState(true);
  const [moving, setMoving] = useState(false);
  const [group, setGroup] = useState("");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());

  const all = useMemo(() => (data ? skillRows(data) : []), [data]);
  const rows = useMemo(
    () => filterRows(all, filter, query),
    [all, filter, query]
  );
  const counts = filterCounts(all);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  const groups = useMemo(() => groupSummaries(all, scope), [all, scope]);
  const checkedRows = all.filter((row) => checked.has(row.id));
  // Bulk actions apply to the ticked rows; with none ticked, to the row selected in the list.
  const targets =
    checkedRows.length > 0 ? checkedRows : selected ? [selected] : [];
  const shelvable = targets.filter(canShelve);
  const removable = targets.filter(canRemove);
  const flippable = targets.filter((row) => row.kind === "shelf");
  // Only the moves that apply to at least one target; each runs on the targets it applies to.
  const moves = (["library", "all", "project"] as const).filter((kind) =>
    targets.some((row) => movesFor(row).includes(kind))
  );
  const shownIds = rows.map((row) => row.id);
  const toggleChecked = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  const allChecked =
    shownIds.length > 0 && shownIds.every((id) => checked.has(id));
  const toggleAll = () =>
    setChecked(allChecked ? new Set() : new Set(shownIds));

  const done = (result: { ok: boolean; text: string }) => {
    const first =
      result.text.split("\n").find(Boolean) ??
      (result.ok ? m.web.common.done : m.web.common.failed);
    (result.ok ? toast.success : toast.error)(first);
    reload();
  };
  const options = {
    onSuccess: done,
    onError: (error: Error) => toast.error(error.message),
  };
  const toggle = useMutation(orpc.skills.toggleShelf.mutationOptions(options));
  const shelve = useMutation(orpc.skills.shelveSkill.mutationOptions(options));
  const remove = useMutation(orpc.skills.removeSkill.mutationOptions(options));

  // forceGlobal is the g key: always for all projects, whatever scope the sidebar shows.
  const flip = (row: SkillRow, forceGlobal = false) => {
    if (row.kind !== "shelf") {
      toast.message(t.installedAlwaysOn(row.name));
      return;
    }
    const global = forceGlobal || scope === "global";
    toggle.mutate({
      dir,
      target: row.target,
      on: !isOn(row, global ? "global" : "project"),
      global,
    });
  };
  const askRemove = (copy: boolean) => {
    if (removable.length > 0) {
      setKeepCopy(copy);
      setRemoving(true);
    }
  };
  const askMove = () => {
    if (moves.length === 0) {
      toast.message(t.moveNone);
      return;
    }
    setMoving(true);
  };
  const runMove = (kind: Move) => {
    setMoving(false);
    if (kind === "library") {
      setShelving(true);
      return;
    }
    const applies = targets.filter((row) => movesFor(row).includes(kind));
    const [only] = applies;
    const call = (row: SkillRow) =>
      kind === "all"
        ? row.kind === "shelf"
          ? client.skills.unshelveSkill({ dir, target: row.target })
          : client.skills.promoteSkill({ dir, skill: row.name })
        : client.skills.demoteSkill({ dir, skill: row.name });
    if (applies.length === 1 && only && checkedRows.length === 0) {
      call(only).then(done, (error: Error) => toast.error(error.message));
    } else {
      runBulk(t.moved, applies, call);
    }
  };

  // One call per row, in order; a failure on one row does not stop the rest.
  const runBulk = async (
    label: string,
    items: SkillRow[],
    call: (row: SkillRow) => Promise<{ ok: boolean; text: string }>
  ) => {
    const failed: string[] = [];
    for (const row of items) {
      try {
        if (!(await call(row)).ok) {
          failed.push(row.name);
        }
      } catch {
        failed.push(row.name);
      }
    }
    const okCount = items.length - failed.length;
    if (failed.length > 0) {
      toast.error(
        t.bulkFailed(
          label,
          okCount,
          failed.length,
          failed.slice(0, 3).join(", ")
        )
      );
    } else {
      toast.success(t.bulkDone(label, okCount));
    }
    setChecked(new Set());
    reload();
  };
  const bulkFlip = (on: boolean) =>
    runBulk(on ? t.turnedOn : t.turnedOff, flippable, (row) =>
      client.skills.toggleShelf({
        dir,
        target: row.target,
        on,
        global: scope === "global",
      })
    );
  const groupFlip = (name: string, on: boolean) =>
    client.skills
      .toggleShelf({ dir, target: name, on, global: scope === "global" })
      .then(done, (error: Error) => toast.error(error.message));

  const move = (step: number) => {
    const index = rows.findIndex((row) => row.id === selected?.id);
    const next = rows[Math.min(Math.max(index + step, 0), rows.length - 1)];
    if (next) {
      setSelectedId(next.id);
    }
  };
  const deleteSelected = () => askRemove(false);
  const busy = shelving || removing || moving;
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
      g: () => selected && flip(selected, true),
      x: () => askRemove(true),
      X: deleteSelected,
      m: askMove,
      "*": () => selected && toggleChecked(selected.id),
      s: () => toast.message(m.skills.notices.nowPressM),
      o: () => toast.message(m.skills.notices.nowPressM),
      u: () => toast.message(m.skills.notices.nowPressM),
      a: () => toast.message(t.nowPressStar),
      esc: () => setChecked(new Set()),
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
        <dt className="text-muted-foreground">{t.path}</dt>
        <dd className="text-body font-mono text-xs break-all">
          {selected.source}
        </dd>
        <dt className="text-muted-foreground">{t.cost}</dt>
        <dd className="text-body">{tokensText(selected.tokens)}</dd>
        {selected.group ? (
          <>
            <dt className="text-muted-foreground">{t.group}</dt>
            <dd className="text-body font-mono text-xs">{selected.group}</dd>
          </>
        ) : null}
        {selected.broken ? (
          <>
            <dt className="text-muted-foreground">{t.state}</dt>
            <dd className="text-error">{t.brokenLink}</dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        {movesFor(selected).length > 0 ? (
          <Button className="h-11 flex-1" onClick={askMove} variant="outline">
            {t.move} <Kbd>m</Kbd>
          </Button>
        ) : null}
        {canRemove(selected) ? (
          <Button
            className="border-error-border text-error hover:text-error h-11 flex-1"
            onClick={() => askRemove(true)}
            variant="outline"
          >
            {m.web.common.remove} <Kbd className="text-error">x</Kbd>
          </Button>
        ) : null}
        {canRemove(selected) ? (
          <Button
            className="border-error-border text-error hover:text-error h-11 flex-1"
            onClick={() => askRemove(false)}
            variant="outline"
          >
            {m.web.common.deleteNoCopy} <Kbd className="text-error">X</Kbd>
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t.note(data?.paths.configDir, data?.paths.backupsDir)}
      </p>
    </div>
  ) : (
    <p className="text-muted-text text-sm">
      {m.web.common.noSelection(t.selectOne)}
    </p>
  );

  return (
    <>
      <ListScreen<SkillRow>
        action={
          <Button asChild className="h-11 px-4">
            <a href="/catalog">
              <PlusIcon aria-hidden="true" className="size-4" />
              {t.addFromCatalog}
            </a>
          </Button>
        }
        columns={[
          {
            header: t.columns.on,
            className: "w-14",
            cell: (row) => (
              <Switch
                aria-label={t.turnAria(row.name, isOn(row, scope))}
                checked={isOn(row, scope)}
                disabled={row.kind !== "shelf"}
                onCheckedChange={() => flip(row)}
                onClick={(event) => event.stopPropagation()}
              />
            ),
          },
          {
            header: t.columns.name,
            cell: (row) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-medium">
                  {row.name}
                </span>
                <span className="text-muted-text truncate text-xs">
                  {tokensText(row.tokens)}
                </span>
              </div>
            ),
          },
          {
            header: t.columns.group,
            className: "w-40",
            cell: (row) =>
              row.group ? (
                <span className="text-body truncate font-mono text-xs">
                  {row.group}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">-</span>
              ),
          },
          {
            header: t.columns.scope,
            className: "w-56",
            cell: (row) => <ScopeBadge row={row} />,
          },
        ]}
        details={details}
        detailsLabel={t.detailsLabel}
        empty={all.length === 0 ? t.emptyNone : t.emptyNoMatch}
        filter={{
          value: filter,
          onChange: (value) => setFilter(value as Filter),
          options: [
            { value: "all", label: t.filters.all, count: counts.all },
            { value: "on", label: t.filters.on, count: counts.on },
            {
              value: "project",
              label: m.core.scopeTitle.project,
              count: counts.project,
            },
            {
              value: "shelf",
              label: m.skills.headers.shelf,
              count: counts.shelf,
            },
          ],
        }}
        hint={t.hint}
        onSelect={setSelectedId}
        rowId={(row) => row.id}
        rows={rows}
        search={{
          inputRef: searchRef,
          value: query,
          onChange: setQuery,
          placeholder: t.searchPlaceholder,
        }}
        selectedId={selected?.id}
        selection={{
          allChecked,
          checked,
          label: (id) => all.find((row) => row.id === id)?.name ?? id,
          onToggle: toggleChecked,
          onToggleAll: toggleAll,
        }}
        setSheetOpen={setSheetOpen}
        sheetOpen={sheetOpen}
        summary={t.summary(all.length, counts.on, counts.shelf)}
        title={t.title}
        toolbar={
          <>
            {groups.length > 0 ? (
              <fieldset
                aria-label={t.groupsAria}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-muted-foreground text-xs tracking-[0.06em] uppercase">
                  {t.groups}
                </span>
                {groups.map((item) => (
                  <span
                    className={`flex h-11 items-center gap-2.5 rounded-lg border px-3 ${filter === `group:${item.name}` ? "bg-selected" : ""}`}
                    key={item.name}
                  >
                    <button
                      className="font-mono text-sm"
                      onClick={() =>
                        setFilter(
                          filter === `group:${item.name}`
                            ? "all"
                            : `group:${item.name}`
                        )
                      }
                      type="button"
                    >
                      {item.name}{" "}
                      <span className="text-muted-text">{item.count}</span>
                    </button>
                    <Switch
                      aria-label={t.turnGroupAria(item.name, item.on)}
                      checked={item.on}
                      onCheckedChange={(on) => groupFlip(item.name, on)}
                    />
                  </span>
                ))}
              </fieldset>
            ) : null}
            {checkedRows.length > 0 ? (
              <div
                aria-label={t.bulkAria}
                className="bg-selected flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
                role="toolbar"
              >
                <span className="mr-2 text-sm">
                  {t.selected(checkedRows.length)}
                </span>
                <Button
                  className="h-11"
                  disabled={flippable.length === 0}
                  onClick={() => bulkFlip(true)}
                  variant="outline"
                >
                  {t.turnOn}
                </Button>
                <Button
                  className="h-11"
                  disabled={flippable.length === 0}
                  onClick={() => bulkFlip(false)}
                  variant="outline"
                >
                  {t.turnOff}
                </Button>
                <Button
                  className="h-11"
                  disabled={moves.length === 0}
                  onClick={askMove}
                  variant="outline"
                >
                  {t.move}
                </Button>
                <Button
                  className="border-error-border text-error hover:text-error h-11"
                  disabled={removable.length === 0}
                  onClick={() => askRemove(true)}
                  variant="outline"
                >
                  {m.web.common.remove}
                </Button>
                <Button
                  className="h-11"
                  onClick={() => setChecked(new Set())}
                  variant="ghost"
                >
                  {m.web.common.clear}
                </Button>
              </div>
            ) : null}
          </>
        }
      />
      <Dialog onOpenChange={setMoving} open={moving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {m.skills.notices.moveTitle(
                targets.length === 1
                  ? (targets[0]?.name ?? "")
                  : t.count(targets.length)
              )}
            </DialogTitle>
            <DialogDescription>{t.moveDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {moves.map((kind) => (
              <Button
                className="h-11 justify-start"
                key={kind}
                onClick={() => runMove(kind)}
                variant="outline"
              >
                {kind === "all" && targets.every((row) => row.kind === "shelf")
                  ? m.skills.notices.moveOutOfLibrary
                  : MOVE_LABELS[kind]}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setShelving} open={shelving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.shelveTitle(
                shelvable.length === 1
                  ? (shelvable[0]?.name ?? "")
                  : t.count(shelvable.length)
              )}
            </DialogTitle>
            <DialogDescription>{t.shelveDescription}</DialogDescription>
          </DialogHeader>
          <Input
            aria-label={t.shelveGroupAria}
            list="shelf-groups"
            onChange={(event) => setGroup(event.target.value)}
            placeholder={t.groupPlaceholder}
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
              disabled={group.trim() === "" || shelvable.length === 0}
              onClick={() => {
                const name = group.trim();
                const [only] = shelvable;
                if (
                  shelvable.length === 1 &&
                  only &&
                  checkedRows.length === 0
                ) {
                  shelve.mutate({
                    dir,
                    skill: only.name,
                    group: name,
                    project: only.kind === "project",
                  });
                } else {
                  runBulk(t.shelved, shelvable, (row) =>
                    client.skills.shelveSkill({
                      dir,
                      skill: row.name,
                      group: name,
                      project: row.kind === "project",
                    })
                  );
                }
                setShelving(false);
              }}
            >
              {t.shelve}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setRemoving} open={removing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(keepCopy ? t.removeTitle : t.deleteTitle)(
                removable.length === 1
                  ? (removable[0]?.name ?? "")
                  : t.count(removable.length)
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {keepCopy
                ? t.removeDescription(
                    removable.length === 1
                      ? (removable[0]?.source ?? "")
                      : t.folders(removable.length),
                    removable.length === 1,
                    data?.paths.backupsDir
                  )
                : t.deleteDescription(
                    removable.length === 1
                      ? (removable[0]?.source ?? "")
                      : t.folders(removable.length)
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">
              {m.web.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              onClick={() => {
                const input = (row: SkillRow) => ({
                  dir,
                  target: row.kind === "shelf" ? row.target : row.name,
                  project: row.kind === "project",
                  backup: keepCopy,
                });
                const [only] = removable;
                if (
                  removable.length === 1 &&
                  only &&
                  checkedRows.length === 0
                ) {
                  remove.mutate(input(only));
                } else {
                  runBulk(t.removed, removable, (row) =>
                    client.skills.removeSkill(input(row))
                  );
                }
              }}
            >
              {keepCopy ? m.web.common.remove : m.web.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
