// MCP servers: turn a user-scope server off and back on, remove, add and edit. Every write is core's preview/apply pair.
// Env values, headers, args and URLs arrive masked from the server; the add and edit forms send what you type to core only.

import { messages } from "@agentry/core/messages";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { LoadData } from "../contract/index.js";
import { useListState } from "../hooks/use-list-state.js";
import { useAppData } from "../lib/app-data.js";
import { client } from "../lib/orpc.js";
import { ActionButton } from "./action-button.js";
import { useCopilot } from "./copilot.js";
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
import { Textarea } from "./ui/textarea.js";

const m = messages();
const t = m.web.mcp;
const CP = m.copilot;

interface McpRow {
  detail: string;
  env: [string, string][];
  id: string;
  name: string;
  parked: boolean;
  // core's scope for a server ("user", "plugin"...), or "parked" for one turned off in agentry's folder.
  rawScope: string;
  scope: string;
  source: string;
  state: string;
  transport: string;
  userScope: boolean;
}

export const mcpRows = (load: LoadData): McpRow[] => [
  ...load.status.mcp.servers.map((server) => ({
    id: `${server.scope}:${server.name}`,
    name: server.name,
    scope:
      server.scope === "user"
        ? m.web.common.scopeGlobal
        : m.web.common.scopeProject,
    state: server.state,
    transport: server.transport,
    detail:
      server.url ??
      [server.command, ...(server.args ?? [])].filter(Boolean).join(" "),
    env: Object.entries(server.env ?? {}),
    source: server.source,
    parked: false,
    rawScope: server.scope,
    userScope: server.scope === "user",
  })),
  ...load.parked.items.map((item) => ({
    id: `parked:${item.name}`,
    name: item.name,
    scope: m.web.common.scopeGlobal,
    state: "off",
    transport: "parked",
    detail: item.summary,
    env: [],
    source: t.parkedSource,
    parked: true,
    rawScope: "parked",
    userScope: true,
  })),
];

const FILTERS = {
  all: () => true,
  on: (row: McpRow) => row.state === "active",
  off: (row: McpRow) => row.parked || row.state === "disabled",
};

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const McpScreen = () => {
  const { data, dir } = useAppData();
  const flow = usePreviewFlow();
  const [form, setForm] = useState<"add" | "edit" | null>(null);
  const [fields, setFields] = useState({
    name: "",
    scope: "user",
    command: "",
    args: "",
    env: "",
    url: "",
    headers: "",
  });
  const rows = useMemo(() => (data ? mcpRows(data) : []), [data]);

  const turn = (target: McpRow | undefined) => {
    if (!target) {
      return;
    }
    if (!target.userScope) {
      flow.start({
        title: target.name,
        preview: async () => ({
          appliable: false,
          text: t.managedElsewhere(target.name, target.source),
        }),
        apply: async () => ({ ok: false, text: m.web.hooks.nothingToApply }),
      });
      return;
    }
    const enable = target.parked;
    flow.start({
      title: t.turnTitle(enable, target.name),
      preview: () => client.mcp.previewMcp({ dir, name: target.name, enable }),
      apply: () => client.mcp.applyMcp({ dir, name: target.name, enable }),
    });
  };
  const remove = (target: McpRow | undefined) => {
    if (target && !target.parked && target.userScope) {
      flow.start({
        title: t.removeTitle(target.name),
        preview: () => client.mcp.previewMcpRemove({ dir, name: target.name }),
        apply: () => client.mcp.applyMcpRemove({ dir, name: target.name }),
        note: t.removeNote,
      });
    }
  };

  const edit = (target: McpRow | undefined) => {
    if (target?.userScope && !target.parked) {
      setFields({ ...fields, args: "", env: "" });
      setForm("edit");
    }
  };

  const copilot = useCopilot();
  const shareFor = (item: McpRow) =>
    item.rawScope === "user"
      ? copilot.shareOf("mcp", item.name)
      : copilot.shareOf(
          "mcp",
          undefined,
          item.rawScope === "plugin"
            ? CP.whyNot.plugin
            : item.rawScope === "parked"
              ? CP.whyNot.libraryOnly
              : item.rawScope === "project" || item.rawScope === "local"
                ? CP.whyNot.projectOnly
                : undefined
        );

  const list = useListState(rows, {
    id: (item) => item.id,
    text: (item) => `${item.name} ${item.detail}`,
    filters: FILTERS,
    paused: form !== null,
    keys: {
      space: (item, event) => {
        event.preventDefault();
        turn(item);
      },
      x: remove,
      a: () => setForm("add"),
      s: (item) => edit(item),
      ...copilot.keys(shareFor),
    },
  });
  const row = list.selected;

  const addInput = () => ({
    dir,
    name: fields.name.trim(),
    scope: fields.scope as "user" | "project",
    ...(fields.url.trim()
      ? { url: fields.url.trim(), headers: lines(fields.headers) }
      : {
          command: fields.command.trim(),
          args: fields.args.trim() ? fields.args.trim().split(/\s+/) : [],
          env: lines(fields.env),
        }),
  });
  const submit = () => {
    if (form === "add") {
      const input = addInput();
      flow.start({
        title: t.addTitle(input.name),
        preview: () => client.mcp.previewMcpAdd(input),
        apply: () => client.mcp.applyMcpAdd(input),
      });
    } else if (row) {
      const input = {
        dir,
        name: row.name,
        args: fields.args.trim() ? fields.args.trim().split(/\s+/) : undefined,
        env: lines(fields.env),
      };
      flow.start({
        title: t.editTitle(row.name),
        preview: () => client.mcp.previewMcpSet(input),
        apply: () => client.mcp.applyMcpSet(input),
      });
    }
    setForm(null);
  };

  const field = (
    key: keyof typeof fields,
    label: string,
    multiline = false,
    placeholder = ""
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`mcp-${key}`}>{label}</Label>
      {multiline ? (
        <Textarea
          id={`mcp-${key}`}
          onChange={(event) =>
            setFields({ ...fields, [key]: event.target.value })
          }
          placeholder={placeholder}
          value={fields[key]}
        />
      ) : (
        <Input
          id={`mcp-${key}`}
          onChange={(event) =>
            setFields({ ...fields, [key]: event.target.value })
          }
          placeholder={placeholder}
          value={fields[key]}
        />
      )}
    </div>
  );

  return (
    <>
      <ListScreen<McpRow>
        action={
          <Button
            className="h-11 px-4"
            onClick={() => {
              setFields({
                name: "",
                scope: "user",
                command: "",
                args: "",
                env: "",
                url: "",
                headers: "",
              });
              setForm("add");
            }}
          >
            <PlusIcon aria-hidden="true" className="size-4" /> {t.addServer}
          </Button>
        }
        columns={[
          {
            header: m.web.common.on,
            className: "w-14",
            cell: (item) => (
              <Switch
                aria-label={t.turnAria(item.name, item.state === "active")}
                checked={item.state === "active"}
                disabled={!item.userScope}
                onCheckedChange={() => turn(item)}
                onClick={(event) => event.stopPropagation()}
              />
            ),
          },
          {
            header: t.server,
            cell: (item) => (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-sm font-medium">
                  {item.name}
                </span>
                <span className="text-muted-text truncate font-mono text-xs">
                  {item.detail}
                </span>
              </div>
            ),
          },
          {
            header: m.web.common.scope,
            className: "w-28",
            cell: (item) => <Pill tone="muted">{item.scope}</Pill>,
          },
          {
            header: m.web.common.state,
            className: "w-40",
            cell: (item) => (
              <Pill tone={stateTone(item.state)}>{item.state}</Pill>
            ),
          },
          ...copilot.column(shareFor),
        ]}
        details={
          row ? (
            <DetailsPanel
              actions={
                <>
                  {row.userScope ? (
                    <ActionButton keyHint="space" onClick={() => turn(row)}>
                      {row.parked ? t.addBack : m.web.common.turnOff}
                    </ActionButton>
                  ) : null}
                  {row.userScope && !row.parked ? (
                    <ActionButton keyHint="s" onClick={() => edit(row)}>
                      {t.edit}
                    </ActionButton>
                  ) : null}
                  {row.userScope && !row.parked ? (
                    <ActionButton
                      danger
                      keyHint="x"
                      onClick={() => remove(row)}
                    >
                      {m.web.common.remove}
                    </ActionButton>
                  ) : null}
                </>
              }
              badge={<Pill tone={stateTone(row.state)}>{row.state}</Pill>}
              fields={[
                [t.transport, row.transport],
                [
                  t.command,
                  <span className="font-mono text-xs" key="d">
                    {row.detail || "-"}
                  </span>,
                ],
                [
                  t.env,
                  row.env.length === 0 ? (
                    "-"
                  ) : (
                    <span className="font-mono text-xs" key="e">
                      {row.env
                        .map(([key, value]) => `${key}=${value}`)
                        .join("\n")}
                    </span>
                  ),
                ],
                [
                  t.source,
                  <span className="font-mono text-xs" key="s">
                    {row.source}
                  </span>,
                ],
              ]}
              note={t.note}
              title={row.name}
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
        hint={copilot.hint(t.hint)}
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
      <Dialog
        onOpenChange={(open) => !open && setForm(null)}
        open={form !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form === "add" ? t.dialogAddTitle : t.editTitle(row?.name ?? "")}
            </DialogTitle>
            <DialogDescription>
              {form === "add"
                ? t.dialogAddDescription
                : t.dialogEditDescription}
            </DialogDescription>
          </DialogHeader>
          {form === "add" ? (
            <>
              {field("name", t.fieldName, false, t.placeholderName)}
              {field("command", t.fieldCommand, false, t.placeholderCommand)}
              {field("url", t.fieldUrl, false, t.placeholderUrl)}
            </>
          ) : null}
          {field("args", t.fieldArgs, false, t.placeholderArgs)}
          {field("env", t.fieldEnv, true, t.placeholderEnv)}
          {form === "add" ? field("headers", t.fieldHeaders, true) : null}
          <DialogFooter>
            <Button
              className="h-11"
              disabled={form === "add" && fields.name.trim() === ""}
              onClick={submit}
            >
              {t.preview}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {flow.dialog}
      {copilot.dialog}
    </>
  );
};
