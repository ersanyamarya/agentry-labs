// The state every list screen shares: search, one segmented filter, the selected row, the details sheet and the keys that
// move the selection and focus the search box. The screen adds its own action keys through useShortcuts.

import { useMemo, useRef, useState } from "react";
import { useShortcuts } from "./use-shortcuts.js";

export interface ListStateOptions<T> {
  filters: Record<string, (row: T) => boolean>;
  id: (row: T) => string;
  // Keys other than the movement keys, named as in useShortcuts. They receive the selected row.
  keys?: Record<string, (row: T | undefined, event: KeyboardEvent) => void>;
  paused?: boolean;
  text: (row: T) => string;
}

export const useListState = <T>(
  rows: T[],
  { filters, id, keys = {}, paused = false, text }: ListStateOptions<T>
) => {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(Object.keys(filters)[0] ?? "all");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filters).map(([name, match]) => [
          name,
          rows.filter(match).length,
        ])
      ),
    [rows, filters]
  );
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = filters[filter] ?? (() => true);
    return rows.filter(
      (row) =>
        match(row) &&
        (needle === "" || text(row).toLowerCase().includes(needle))
    );
  }, [rows, filters, filter, query, text]);
  const selected = shown.find((row) => id(row) === selectedId) ?? shown[0];

  const move = (step: number) => {
    const index = shown.findIndex(
      (row) => id(row) === (selected === undefined ? undefined : id(selected))
    );
    const next = shown[Math.min(Math.max(index + step, 0), shown.length - 1)];
    if (next) {
      setSelectedId(id(next));
    }
  };

  const bound: Record<string, (event: KeyboardEvent) => void> = {
    down: (event) => {
      event.preventDefault();
      move(1);
    },
    up: (event) => {
      event.preventDefault();
      move(-1);
    },
    "/": (event) => {
      event.preventDefault();
      searchRef.current?.focus();
    },
  };
  for (const [key, handler] of Object.entries(keys)) {
    bound[key] = (event) => handler(selected, event);
  }
  useShortcuts(bound, !paused);

  return {
    counts,
    filter,
    query,
    searchRef,
    selected,
    selectedId: selected === undefined ? undefined : id(selected),
    setFilter,
    setQuery,
    setSelectedId,
    setSheetOpen,
    sheetOpen,
    shown,
  };
};
