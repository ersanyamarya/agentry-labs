// MCP servers: turn a user-scope server off and back on, remove, add and edit. Every write is core's preview/apply pair.
// Env values, headers, args and URLs arrive masked from the server; the add and edit forms send what you type to core only.

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
import { Textarea } from "./ui/textarea.js";

interface McpRow {
  detail: string;
  env: [string, string][];
  id: string;
  name: string;
  parked: boolean;
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
    scope: server.scope === "user" ? "global" : server.scope,
    state: server.state,
    transport: server.transport,
    detail:
      server.url ??
      [server.command, ...(server.args ?? [])].filter(Boolean).join(" "),
    env: Object.entries(server.env ?? {}),
    source: server.source,
    parked: false,
    userScope: server.scope === "user",
  })),
  ...load.parked.items.map((item) => ({
    id: `parked:${item.name}`,
    name: item.name,
    scope: "global",
    state: "off",
    transport: "parked",
    detail: item.summary,
    env: [],
    source: "parked in agentry's config",
    parked: true,
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
          text: `${target.name} is managed in ${target.source}. Only user-scope servers can be turned off here.`,
        }),
        apply: async () => ({ ok: false, text: "Nothing to apply." }),
      });
      return;
    }
    const enable = target.parked;
    flow.start({
      title: `${enable ? "Add back" : "Turn off"} ${target.name}`,
      preview: () => client.mcp.previewMcp({ dir, name: target.name, enable }),
      apply: () => client.mcp.applyMcp({ dir, name: target.name, enable }),
    });
  };
  const remove = (target: McpRow | undefined) => {
    if (target && !target.parked && target.userScope) {
      flow.start({
        title: `Remove ${target.name}`,
        preview: () => client.mcp.previewMcpRemove({ dir, name: target.name }),
        apply: () => client.mcp.applyMcpRemove({ dir, name: target.name }),
        note: "A backup of ~/.claude.json is made first.",
      });
    }
  };

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
        title: `Add ${input.name}`,
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
        title: `Edit ${row.name}`,
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
            <PlusIcon aria-hidden="true" className="size-4" /> Add server
          </Button>
        }
        columns={[
          {
            header: "On",
            className: "w-14",
            cell: (item) => (
              <Switch
                aria-label={`Turn ${item.name} ${item.state === "active" ? "off" : "on"}`}
                checked={item.state === "active"}
                disabled={!item.userScope}
                onCheckedChange={() => turn(item)}
                onClick={(event) => event.stopPropagation()}
              />
            ),
          },
          {
            header: "Server",
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
            header: "Scope",
            className: "w-28",
            cell: (item) => <Pill tone="muted">{item.scope}</Pill>,
          },
          {
            header: "State",
            className: "w-40",
            cell: (item) => (
              <Pill tone={stateTone(item.state)}>{item.state}</Pill>
            ),
          },
        ]}
        details={
          row ? (
            <DetailsPanel
              actions={
                <>
                  {row.userScope ? (
                    <ActionButton keyHint="space" onClick={() => turn(row)}>
                      {row.parked ? "Add back" : "Turn off"}
                    </ActionButton>
                  ) : null}
                  {row.userScope && !row.parked ? (
                    <ActionButton
                      onClick={() => {
                        setFields({ ...fields, args: "", env: "" });
                        setForm("edit");
                      }}
                    >
                      Edit
                    </ActionButton>
                  ) : null}
                  {row.userScope && !row.parked ? (
                    <ActionButton
                      danger
                      keyHint="x"
                      onClick={() => remove(row)}
                    >
                      Remove
                    </ActionButton>
                  ) : null}
                </>
              }
              badge={<Pill tone={stateTone(row.state)}>{row.state}</Pill>}
              fields={[
                ["Transport", row.transport],
                [
                  "Command",
                  <span className="font-mono text-xs" key="d">
                    {row.detail || "-"}
                  </span>,
                ],
                [
                  "Env",
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
                  "Source",
                  <span className="font-mono text-xs" key="s">
                    {row.source}
                  </span>,
                ],
              ]}
              note="Secrets stay masked here. Turning a server off keeps its config under agentry's folder, so it can be added back."
              title={row.name}
            />
          ) : (
            <NoSelection what="a server" />
          )
        }
        detailsLabel="Server details"
        empty="No MCP servers."
        filter={{
          value: list.filter,
          onChange: list.setFilter,
          options: [
            { value: "all", label: "All", count: list.counts.all ?? 0 },
            { value: "on", label: "On", count: list.counts.on ?? 0 },
            { value: "off", label: "Off", count: list.counts.off ?? 0 },
          ],
        }}
        hint="↑↓ move · space off/on · a add · x remove · / search"
        onSelect={list.setSelectedId}
        rowId={(item) => item.id}
        rows={list.shown}
        search={{
          inputRef: list.searchRef,
          value: list.query,
          onChange: list.setQuery,
          placeholder: "Search servers",
        }}
        selectedId={list.selectedId}
        setSheetOpen={list.setSheetOpen}
        sheetOpen={list.sheetOpen}
        summary={`${rows.length} servers · ${list.counts.on ?? 0} on`}
        title="MCP"
      />
      <Dialog
        onOpenChange={(open) => !open && setForm(null)}
        open={form !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form === "add" ? "Add an MCP server" : `Edit ${row?.name}`}
            </DialogTitle>
            <DialogDescription>
              {form === "add"
                ? "A command server (command, args, env) or a URL server. You will see a preview with secrets masked."
                : "Env lines are K=V pairs to add or change. Args replace the current ones when filled in."}
            </DialogDescription>
          </DialogHeader>
          {form === "add" ? (
            <>
              {field("name", "Name", false, "my-server")}
              {field("command", "Command", false, "npx")}
              {field("url", "or URL", false, "https://…")}
            </>
          ) : null}
          {field("args", "Args", false, "-y my-package")}
          {field("env", "Env (one K=V per line)", true, "API_KEY=…")}
          {form === "add"
            ? field(
                "headers",
                "Headers (one K: V per line, for a URL server)",
                true
              )
            : null}
          <DialogFooter>
            <Button
              className="h-11"
              disabled={form === "add" && fields.name.trim() === ""}
              onClick={submit}
            >
              Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {flow.dialog}
    </>
  );
};
