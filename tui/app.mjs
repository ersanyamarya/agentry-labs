// The UI shell: project, tabs, overlays (help, picker) and the key map. Tabs get data and actions as props, so the
// whole tree runs on injected data in tests. Every action goes through the api (tui/data.mjs), i.e. through lib/.

import React from "react";
import { Box, Text, useApp, useInput, useStdin, useStdout } from "ink";
import { Footer } from "./components/footer.mjs";
import { layoutFor, STACKED_DETAILS_LINES } from "./layout.mjs";
import { DoctorTab } from "./components/doctor-tab.mjs";
import { Help } from "./components/help.mjs";
import { InventoryTab } from "./components/inventory-tab.mjs";
import { Picker, pickerRows } from "./components/picker.mjs";
import { SkillsTab } from "./components/skills-tab.mjs";
import { TAB_NAMES, TabBar } from "./components/tab-bar.mjs";
import { openInEditor } from "./editor.mjs";
import { colorEnabled, ThemeContext } from "./theme.mjs";
import { DOCTOR_KEYS, hookRows, MCP_KEYS, mcpRows, pluginRows, PLUGINS_KEYS, SKILLS_KEYS } from "./rows.mjs";

const h = React.createElement;

const TAB_KEYS = [SKILLS_KEYS, MCP_KEYS, MCP_KEYS, PLUGINS_KEYS, DOCTOR_KEYS];

// `size` ({ cols, rows }) overrides the terminal size, for tests.
export const App = ({ api, startDir, recents, discover, env = process.env, spawn, size }) => {
	const { exit } = useApp();
	const { setRawMode } = useStdin();
	const { stdout } = useStdout();
	const [dir, setDir] = React.useState(startDir);
	const [data, setData] = React.useState(null);
	const [tab, setTab] = React.useState(0);
	const [overlay, setOverlay] = React.useState(null);
	const [locked, setLocked] = React.useState(false);
	// Read by the key handler, which can run before a render after lock() has re-subscribed it.
	const lockedRef = React.useRef(false);
	const lock = React.useCallback((value) => {
		lockedRef.current = value;
		setLocked(value);
	}, []);
	const [message, setMessage] = React.useState("");
	const [picker, setPicker] = React.useState([]);

	const reload = React.useCallback(
		() =>
			new Promise((resolve) => {
				// One tick later, so "Loading..." can paint before the synchronous lib reads run.
				setTimeout(() => {
					setData(api.load(dir));
					resolve();
				}, 0);
			}),
		[api, dir],
	);
	React.useEffect(() => {
		setData(null);
		reload();
	}, [reload]);

	const openFile = (file) => {
		const result = openInEditor(file, { env, spawn, setRawMode });
		setMessage(result.message);
		if (result.ok) {
			reload();
		}
	};

	const openPicker = () => {
		const saved = recents.read();
		const roots = saved.roots.length > 0 ? saved.roots : [startDir.split("/").slice(0, -1).join("/") || "/"];
		setPicker(pickerRows({ current: startDir, recents: saved.recents, found: discover(roots).map(({ path }) => path) }));
		setOverlay("picker");
	};

	const pick = (path) => {
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
		} else if (!overlay && !locked) {
			if (key.leftArrow) {
				setTab((tab + TAB_NAMES.length - 1) % TAB_NAMES.length);
				setMessage("");
			} else if (key.rightArrow) {
				setTab((tab + 1) % TAB_NAMES.length);
				setMessage("");
			} else if (/^[1-5]$/.test(input)) {
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

	const layout = layoutFor(size?.cols ?? stdout?.columns ?? 100);
	// Chrome takes about 12 lines; stacked, the details block under the list takes about 10 more.
	const height = Math.max(6, (size?.rows ?? stdout?.rows ?? 30) - 12 - (layout.stacked ? STACKED_DETAILS_LINES + 2 : 0));
	const counts = !data ? {} : { Skills: data.status.skills.items.length, MCP: data.status.mcp.servers.length, Hooks: data.status.hooks.items.length, Plugins: data.status.plugins.items.length, Doctor: data.doctor.findings.length };
	const shared = { data, api, dir, height, layout, notify: setMessage, reload, lock, openFile };
	const tabs = [
		h(SkillsTab, { ...shared, active: tab === 0 && !overlay }),
		h(InventoryTab, { ...shared, makeRows: mcpRows, active: tab === 1 && !overlay }),
		h(InventoryTab, { ...shared, makeRows: hookRows, active: tab === 2 && !overlay }),
		h(InventoryTab, { ...shared, makeRows: pluginRows, active: tab === 3 && !overlay }),
		h(DoctorTab, { ...shared, active: tab === 4 && !overlay }),
	];

	const plugins = data?.status.plugins.items ?? [];
	const summary = data && { tokens: data.status.tokens.measured, ...data.doctor.summary, active: plugins.filter((plugin) => plugin.state === "active").length, disabled: plugins.filter((plugin) => plugin.state === "disabled").length };
	const theme = React.useMemo(() => ({ color: colorEnabled(env) }), [env]);

	return h(
		ThemeContext.Provider,
		{ value: theme },
		h(
			Box,
			{ flexDirection: "column" },
			h(TabBar, { tab, project: dir, counts, summary, cols: layout.cols }),
			overlay === "help" ? h(Help) : null,
			overlay === "picker" ? h(Picker, { rows: picker, onPick: pick, onClose: () => setOverlay(null) }) : null,
			!data
				? h(Text, { dimColor: true }, "Loading...")
				: h(Box, { flexDirection: "column", display: overlay ? "none" : "flex" }, ...tabs.map((content, index) => h(Box, { key: TAB_NAMES[index], flexDirection: "column", display: index === tab ? "flex" : "none" }, content))),
			data?.status.errors.length > 0 || data?.doctor.errors.length > 0 ? h(Text, { color: theme.color ? "yellow" : undefined, wrap: "truncate-end" }, `warning: ${[...data.status.errors, ...data.doctor.errors][0].message}`) : null,
			message ? h(Text, { color: theme.color ? "green" : undefined, wrap: "truncate-middle" }, message) : null,
			h(Footer, { keys: TAB_KEYS[tab], cols: layout.cols }),
		),
	);
};
