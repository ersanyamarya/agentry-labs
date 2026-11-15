// The layout every list section shares (docs/web-ui-design.md "Layout → List screens"): a title and summary, an action,
// search and a segmented filter, the table, a key hint line, and a details column on the right. Below 1100px the details
// open in a Sheet instead. Content sits flat on the page and uses the whole width: no cards, no max width.

import { messages } from "@agentry/core/messages";
import { SearchIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useMediaQuery } from "../hooks/use-media-query.js";
import { useAppData } from "../lib/app-data.js";
import { whileLoading } from "../lib/format.js";
import { Input } from "./ui/input.js";
import { Kbd } from "./ui/kbd.js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table.js";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.js";

const t = messages().web.list;

export interface Column<T> {
  cell: (row: T) => ReactNode;
  className?: string;
  header: string;
}

export interface Selection {
  allChecked: boolean;
  checked: ReadonlySet<string>;
  label: (id: string) => string;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}

export interface ListScreenProps<T> {
  action?: ReactNode;
  columns: Column<T>[];
  details: ReactNode;
  detailsLabel: string;
  empty: string;
  filter: {
    onChange: (value: string) => void;
    options: { count: number; label: string; value: string }[];
    value: string;
  };
  hint: string;
  onSelect: (id: string) => void;
  rowId: (row: T) => string;
  rows: T[];
  search: {
    inputRef: RefObject<HTMLInputElement | null>;
    onChange: (value: string) => void;
    placeholder: string;
    value: string;
  };
  selectedId?: string;
  // Adds a checkbox column for bulk actions.
  selection?: Selection;
  setSheetOpen: (open: boolean) => void;
  sheetOpen: boolean;
  summary: string;
  title: string;
  // Extra controls under the filter row (groups, the bulk bar).
  toolbar?: ReactNode;
}

export const ListScreen = <T,>({
  action,
  columns,
  details,
  detailsLabel,
  empty,
  filter,
  hint,
  onSelect,
  rowId,
  rows,
  search,
  selectedId,
  selection,
  sheetOpen,
  setSheetOpen,
  summary,
  title,
  toolbar,
}: ListScreenProps<T>) => {
  const wide = useMediaQuery("(min-width: 1100px)");
  // Until `load` answers every list would read "0 rows"; say it is loading instead.
  const { loading } = useAppData();
  return (
    <section className="flex flex-col gap-5 px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-text text-sm">
            {whileLoading(loading, summary)}
          </p>
        </div>
        {action}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="border-input bg-card flex min-h-11 max-w-sm flex-1 basis-64 items-center gap-2.5 rounded-lg border px-3">
          <SearchIcon
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
          <Input
            aria-label={search.placeholder}
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            ref={search.inputRef}
            value={search.value}
          />
          <Kbd>/</Kbd>
        </label>
        <ToggleGroup
          aria-label={t.filterAria}
          className="flex-wrap"
          onValueChange={(value) => value && filter.onChange(value)}
          type="single"
          value={filter.value}
          variant="outline"
        >
          {filter.options.map((option) => (
            <ToggleGroupItem
              className="h-11 px-3"
              key={option.value}
              value={option.value}
            >
              {option.label} {option.count}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {toolbar}
      <div className="flex items-start gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {selection ? (
                  <TableHead className="w-10">
                    <input
                      aria-label={t.selectAllAria}
                      checked={selection.allChecked}
                      className="accent-primary size-4"
                      onChange={selection.onToggleAll}
                      type="checkbox"
                    />
                  </TableHead>
                ) : null}
                {columns.map((column) => (
                  <TableHead
                    className={`text-muted-foreground text-[12px] tracking-[0.06em] uppercase ${column.className ?? ""}`}
                    key={column.header}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="text-muted-text py-8"
                    colSpan={columns.length + (selection ? 1 : 0)}
                  >
                    {whileLoading(loading, empty)}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const id = rowId(row);
                  return (
                    <TableRow
                      aria-selected={id === selectedId}
                      className="border-row-border data-[state=selected]:bg-selected h-14 cursor-pointer"
                      data-state={id === selectedId ? "selected" : undefined}
                      key={id}
                      onClick={() => {
                        onSelect(id);
                        setSheetOpen(true);
                      }}
                    >
                      {selection ? (
                        <TableCell className="w-10">
                          <input
                            aria-label={t.selectAria(selection.label(id))}
                            checked={selection.checked.has(id)}
                            className="accent-primary size-4"
                            onChange={() => selection.onToggle(id)}
                            onClick={(event) => event.stopPropagation()}
                            type="checkbox"
                          />
                        </TableCell>
                      ) : null}
                      {columns.map((column) => (
                        <TableCell
                          className={column.className}
                          key={column.header}
                        >
                          {column.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <p className="text-muted-foreground font-mono text-xs">{hint}</p>
        </div>
        {wide ? (
          <aside
            aria-label={detailsLabel}
            className="sticky top-7 hidden w-[22rem] shrink-0 border-l pl-8 min-[1100px]:block"
          >
            {details}
          </aside>
        ) : null}
      </div>
      {wide ? null : (
        <Sheet
          onOpenChange={setSheetOpen}
          open={sheetOpen && selectedId !== undefined}
        >
          <SheetContent
            aria-label={detailsLabel}
            className="w-[22rem] gap-0 p-6"
          >
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">{detailsLabel}</SheetTitle>
              <SheetDescription className="sr-only">
                {detailsLabel}
              </SheetDescription>
            </SheetHeader>
            {details}
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
};
