// A stand-in `claude` for tests: handles `mcp remove|add-json <name> ... --scope user` by editing the user-scope
// `mcpServers` of <CLAUDE_CONFIG_DIR>/.claude.json, and records every argv (one JSON line) in <fake dir>/argv.log.
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
const file = path.join(process.env.CLAUDE_CONFIG_DIR, ".claude.json");
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

