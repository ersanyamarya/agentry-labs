// The UI shell: project, tabs, overlays (help, picker) and the key map. Tabs get data and actions as props, so the
// whole tree runs on injected data in tests. Every action goes through the api (tui/data.mjs), i.e. through lib/.

import { Box, useApp, useInput, useStdin, useStdout } from "ink";
import React from "react";
import type { CopyOptions } from "./clipboard.js";
import { copyText } from "./clipboard.js";
import { BackupsTab } from "./components/backups-tab.js";
import { Busy } from "./components/busy.js";
import { CatalogTab } from "./components/catalog-tab.js";
import { DoctorTab } from "./components/doctor-tab.js";
import { Footer } from "./components/footer.js";
import { Help } from "./components/help.js";
import { InventoryTab } from "./components/inventory-tab.js";
import type { PickerRow } from "./components/picker.js";
import { Picker, pickerRows } from "./components/picker.js";
import { RulesTab } from "./components/rules-tab.js";
import { SkillsTab } from "./components/skills-tab.js";
import { TAB_NAMES, TabBar } from "./components/tab-bar.js";
import { Text } from "./components/text.js";
import type { EditorOptions } from "./editor.js";
import { openInEditor } from "./editor.js";
import { iconMode, iconsFor } from "./icons.js";
import { layoutFor, STACKED_DETAILS_LINES } from "./layout.js";
import type { createRecents } from "./recents.js";
import {
  DOCTOR_KEYS,
  hookKeys,
  hookRows,
  mcpKeys,
  mcpRows,
  pluginKeys,
  pluginRows,
} from "./rows.js";
import { colorEnabled, ThemeContext } from "./theme.js";
import type { Api, Data, KeyHint, Lock } from "./types.js";

// Skills and MCP report the keys of their selected row (setKeys); the others use a fixed list.
const TAB_KEYS: KeyHint[][] = [[], [], [], [], DOCTOR_KEYS, [], [], []];

// `size` ({ cols, rows }) overrides the terminal size, for tests.
export interface AppProps {
  api: Api;
  clipboard?: CopyOptions;
  discover: (roots: string[]) => { path: string }[];
  env?: NodeJS.ProcessEnv;
  recents: ReturnType<typeof createRecents>;
  size?: { cols?: number; rows?: number };
  spawn?: EditorOptions["spawn"];
  startDir: string;
}

export const App = ({
  api,
  startDir,
  recents,
  discover,
  env = process.env,
  spawn,
  size,
  clipboard,
}: AppProps) => {
  const { exit } = useApp();
  const { setRawMode } = useStdin();
  const stdout = useStdout().stdout as NodeJS.WriteStream | undefined;
  const [dir, setDir] = React.useState(startDir);
  const [data, setData] = React.useState<Data | null>(null);
  const [tab, setTab] = React.useState(0);
  const [overlay, setOverlay] = React.useState<"help" | "picker" | null>(null);
  const [, setLocked] = React.useState<Lock>(false);
  // Read by the key handler, which can run before a render after lock() has re-subscribed it.
  const lockedRef = React.useRef<Lock>(false);
  const lock = React.useCallback((value: Lock) => {
    lockedRef.current = value;
    setLocked(value);
  }, []);
  const [message, setMessage] = React.useState("");
  const [rowKeys, setRowKeys] = React.useState<{
    tab: number;
    keys: KeyHint[];
  }>({ tab: -1, keys: [] });
  const [picker, setPicker] = React.useState<PickerRow[]>([]);
  // Redraw with the new layout when the terminal is resized.
  const [dims, setDims] = React.useState({
    cols: stdout?.columns,
    rows: stdout?.rows,
  });
  React.useEffect(() => {
    const onResize = () =>
      setDims({ cols: stdout?.columns, rows: stdout?.rows });
    stdout?.on?.("resize", onResize);
    return () => {
      stdout?.off?.("resize", onResize);
    };
  }, [stdout]);

  const reload = React.useCallback(
    () =>
      new Promise<void>((resolve) => {
        // One tick later, so "Loading..." can paint before the synchronous lib reads run.
        setTimeout(() => {
          setData(api.load(dir));
          resolve();
        }, 0);
      }),
    [api, dir]
  );
  React.useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  const openFile = (file: string | undefined) => {
    const result = openInEditor(file, { env, spawn, setRawMode });
    setMessage(result.message);
    if (result.ok) {
      reload();
    }
  };

  const copy = (text: string) => setMessage(copyText(text, clipboard).message);

  const openPicker = () => {
    const saved = recents.read();
    const roots =
      saved.roots.length > 0
        ? saved.roots
        : [startDir.split("/").slice(0, -1).join("/") || "/"];
    setPicker(
      pickerRows({
        current: startDir,
        recents: saved.recents,
        found: discover(roots).map(({ path }) => path),
      })
    );
    setOverlay("picker");
  };

  const pick = (path: string) => {
    recents.add(path);
    setOverlay(null);
    setMessage(`Project: ${path}`);
    setDir(path);
  };

  useInput((input, key) => {
    const locked = lockedRef.current;
    if (input === "q" && !locked) {
      exit();
    } else if (locked === "typing") {
      // a name is being typed: only the open prompt reads keys
    } else if (overlay === "help") {
      if (input === "?" || key.escape || key.return) {
        setOverlay(null);
      }
    } else if (!(overlay || locked)) {
      if (key.leftArrow) {
        setTab((tab + TAB_NAMES.length - 1) % TAB_NAMES.length);
        setMessage("");
      } else if (key.rightArrow) {
        setTab((tab + 1) % TAB_NAMES.length);
        setMessage("");
      } else if (/^[1-8]$/.test(input)) {
        setTab(Number(input) - 1);
        setMessage("");
      } else if (input === "r") {
        setMessage("Refreshed.");
        reload();
      } else if (input === "p") {
        openPicker();
      } else if (input === "?") {
        setOverlay("help");
      }
    }
  });

  const layout = layoutFor(size?.cols ?? dims.cols ?? 100);
  // Chrome takes about 14 lines; stacked, the details block under the list takes about 10 more.
  const height = Math.max(
    6,
    (size?.rows ?? dims.rows ?? 30) -
      14 -
      (layout.stacked ? STACKED_DETAILS_LINES + 2 : 0)
  );
  const counts = data
    ? {
        Skills: data.status.skills.items.length,
        MCP: data.status.mcp.servers.length,
        Hooks: data.status.hooks.items.length,
        Plugins: data.status.plugins.items.length,
        Doctor: data.doctor.findings.length,
        ...(data.catalog.fetched && { Catalog: data.catalog.entries.length }),
        Backups: data.backups.length,
        Rules: data.rules.length,
      }
    : {};
  const shared = data && {
    data,
    api,
    dir,
    height,
    layout,
    notify: setMessage,
    reload,
    lock,
    openFile,
    copy,
  };
  const keysFor = (index: number) => (keys: KeyHint[]) =>
    setRowKeys((old) =>
      old.tab === index && old.keys.join() === keys.join()
        ? old
        : { tab: index, keys }
    );
  const tabs = shared
    ? [
        // biome-ignore lint/correctness/useJsxKeyInIterable: fixed-length tuple of tabs, not a dynamic list
        <SkillsTab
          {...shared}
          active={tab === 0 && !overlay}
          setKeys={keysFor(0)}
        />,
        // biome-ignore lint/correctness/useJsxKeyInIterable: fixed-length tuple of tabs, not a dynamic list
        <InventoryTab
          {...shared}
          active={tab === 1 && !overlay}
          canAdd={true}
          makeRows={mcpRows}
          rowKeys={mcpKeys}
          setKeys={keysFor(1)}
        />,
        // biome-ignore lint/correctness/useJsxKeyInIterable: fixed-length tuple of tabs, not a dynamic list
        <InventoryTab
          {...shared}
          active={tab === 2 && !overlay}
          makeRows={hookRows}
          rowKeys={hookKeys}
          setKeys={keysFor(2)}
        />,
        // biome-ignore lint/correctness/useJsxKeyInIterable: fixed-length tuple of tabs, not a dynamic list
        <InventoryTab
          {...shared}
          active={tab === 3 && !overlay}
          canInstall={true}
          makeRows={pluginRows}
          rowKeys={pluginKeys}
          setKeys={keysFor(3)}
        />,
        // biome-ignore lint/correctness/useJsxKeyInIterable: fixed-length tuple of tabs, not a dynamic list
        <DoctorTab {...shared} active={tab === 4 && !overlay} />,
        // biome-ignore lint/correctness/useJsxKeyInIterable: fixed-length tuple of tabs, not a dynamic list
        <CatalogTab
          {...shared}
          active={tab === 5 && !overlay}
          setKeys={keysFor(5)}
        />,
        // biome-ignore lint/correctness/useJsxKeyInIterable: fixed-length tuple of tabs, not a dynamic list
        <BackupsTab
          {...shared}
          active={tab === 6 && !overlay}
          setKeys={keysFor(6)}
        />,
        // biome-ignore lint/correctness/useJsxKeyInIterable: fixed-length tuple of tabs, not a dynamic list
        <RulesTab
          {...shared}
          active={tab === 7 && !overlay}
          setKeys={keysFor(7)}
        />,
      ]
    : [];

  const errors = data ? [...data.status.errors, ...data.doctor.errors] : [];
  const plugins = data?.status.plugins.items ?? [];
  const summary = data
    ? {
        tokens: data.status.tokens.measured,
        ...data.doctor.summary,
        active: plugins.filter((plugin) => plugin.state === "active").length,
        disabled: plugins.filter((plugin) => plugin.state === "disabled")
          .length,
      }
    : undefined;
  const theme = React.useMemo(
    () => ({
      ascii: iconMode(env) === "ascii",
      color: colorEnabled(env),
      icons: iconsFor(env),
    }),
    [env]
  );

  return (
    <ThemeContext.Provider value={theme}>
      <Box flexDirection="column">
        <TabBar
          cols={layout.cols}
          counts={counts}
          project={dir}
          summary={summary}
          tab={tab}
        />
        {overlay === "help" ? <Help /> : null}
        {overlay === "picker" ? (
          <Picker
            // biome-ignore lint/performance/noJsxPropsBind: a one-line handler on a rarely re-rendered overlay
            onClose={() => setOverlay(null)}
            onPick={pick}
            rows={picker}
          />
        ) : null}
        {data ? (
          <Box display={overlay ? "none" : "flex"} flexDirection="column">
            {tabs.map((content, index) => (
              <Box
                display={index === tab ? "flex" : "none"}
                flexDirection="column"
                key={TAB_NAMES[index]}
              >
                {content}
              </Box>
            ))}
          </Box>
        ) : (
          <Busy text="Loading..." />
        )}
        {errors.length > 0 ? (
          <Text color={theme.color ? "yellow" : undefined} wrap="truncate-end">
            {`warning: ${errors[0]?.message}`}
          </Text>
        ) : null}
        {message?.endsWith("...") ? <Busy text={message} /> : null}
        {message && !message.endsWith("...") ? (
          <Text
            color={theme.color ? "green" : undefined}
            wrap="truncate-middle"
          >
            {message}
          </Text>
        ) : null}
        <Text dimColor>{"─".repeat(layout.cols)}</Text>
        <Footer
          cols={layout.cols}
          keys={rowKeys.tab === tab ? rowKeys.keys : TAB_KEYS[tab]}
        />
      </Box>
    </ThemeContext.Provider>
  );
};
