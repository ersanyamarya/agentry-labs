// @ts-nocheck
// A stand-in `claude` for tests: handles `mcp remove|add-json <name> ... --scope user` by editing the user-scope
// `mcpServers` of <CLAUDE_CONFIG_DIR>/.claude.json, and records every argv (one JSON line) in <fake dir>/argv.log.
// `plugin install|uninstall <id> --scope S` records the install in <config>/plugins/installed_plugins.json and sets (or removes)
// enabledPlugins[id] in the scope's settings file (project and local scope use the current directory as the project).
// `FAKE_CLAUDE_FAIL=1` makes it exit 1 without changing anything. The real claude is never run by tests.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require_log = (dir) => (existsSync(join(dir, "argv.log")) ? readFileSync(join(dir, "argv.log"), "utf8").trim().split("\n").map((line) => JSON.parse(line)) : []);

export const installFakeClaude = (dir) => {
	mkdirSync(dir, { recursive: true });
	const bin = join(dir, "claude");
	writeFileSync(
		bin,
		`#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(${JSON.stringify(dir)}, "argv.log"), JSON.stringify(argv) + "\\n");
if (process.env.FAKE_CLAUDE_FAIL) { console.error("fake claude: failing on purpose"); process.exit(1); }
const config = process.env.CLAUDE_CONFIG_DIR;
if (argv[0] === "plugin" && (argv[1] === "install" || argv[1] === "uninstall")) {
	const id = argv[2];
	const scope = argv[argv.indexOf("--scope") + 1];
	const read = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
	const record = path.join(config, "plugins", "installed_plugins.json");
	const installed = read(record, { version: 2, plugins: {} });
	const rest = (installed.plugins[id] ?? []).filter((one) => one.scope !== scope);
	const settings = scope === "user" ? path.join(config, "settings.json") : path.join(process.cwd(), ".claude", scope === "project" ? "settings.json" : "settings.local.json");
	const json = read(settings, {});
	json.enabledPlugins ??= {};
	if (argv[1] === "install") {
		const installPath = path.join(config, "plugins", "cache", id.replace("@", "-"));
		fs.mkdirSync(installPath, { recursive: true });
		installed.plugins[id] = [...rest, { scope, installPath, version: "1.0.0", ...(scope === "user" ? {} : { projectPath: process.cwd() }) }];
		json.enabledPlugins[id] = true;
	} else {
		rest.length > 0 ? (installed.plugins[id] = rest) : delete installed.plugins[id];
		delete json.enabledPlugins[id];
	}
	fs.mkdirSync(path.dirname(record), { recursive: true });
	fs.writeFileSync(record, JSON.stringify(installed));
	fs.writeFileSync(settings, JSON.stringify(json, null, 2) + "\\n");
	console.log("ok " + argv.join(" "));
	process.exit(0);
}
const file = path.join(config, ".claude.json");
const json = JSON.parse(fs.readFileSync(file, "utf8"));
json.mcpServers ??= {};
const [mcp, action, name] = argv;
if (mcp === "mcp" && action === "remove") { delete json.mcpServers[name]; console.log("Removed MCP server " + name); }
else if (mcp === "mcp" && action === "add-json") { json.mcpServers[name] = JSON.parse(argv[3]); console.log("Added " + name); }
else { console.error("fake claude: unsupported " + argv.join(" ")); process.exit(2); }
fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\\n");
`,
	);
	chmodSync(bin, 0o755);
	return { bin, argv: () => require_log(dir) };
};

