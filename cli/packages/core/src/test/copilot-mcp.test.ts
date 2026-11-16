import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { translateMcp } from "../copilot-mcp.js";
import {
  createCopilotShare,
  readShareStore,
  shareState,
} from "../copilot-share.js";
import { createFixUndo } from "../fix-undo.js";
import { createPaths } from "../paths.js";

let root: string;
let home: string;
let claude: string;
let ch: string;
let repo: string;
let lines: string[];
let clock: number;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "agentry-mcp-share-")));
  assert.ok(
    !root.startsWith(realpathSync(homedir())),
    "TMPDIR must be outside the home directory"
  );
  home = join(root, "home");
  claude = join(home, ".claude");
  ch = join(home, ".copilot");
  repo = join(home, "ws", "repo");
  mkdirSync(repo, { recursive: true });
  mkdirSync(claude, { recursive: true });
  mkdirSync(ch, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });
  lines = [];
  clock = Date.UTC(2026, 10, 16, 12, 0, 0);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// Fixture secrets: none may ever reach <ch>/mcp-config.json, the store, stdout or stderr.
const SECRETS = {
  env: "sk-envSECRET1234567890abcdef",
  plainEnv: "plainEnvSECRET",
  header: "hdrSECRET0987654321zyxwvu",
  apiKeyHeader: "xkSECRET5555555555abcdef",
  basic: "dXNlcjpwYXNzd29yZFNFQ1JFVA==",
  flagValue: "shortpw1",
  flagEq: "argSECRETeq1234567890ab",
  bare: "ghp_bareSECRET123456789012",
  pair: "pairSECRETvalue",
  oauth: "oauthSECRET4242424242",
  url: "urlSECRET1234567890abcdef",
  urlPass: "pwSECRETuserinfo",
  urlPath: "urlpathSECRET1234567890abc",
};

const write = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const claudeJson = () => join(claude, ".claude.json");
const mcpConfig = () => join(ch, "mcp-config.json");
const servers = (mcpServers: Record<string, unknown>) =>
  write(claudeJson(), `${JSON.stringify({ mcpServers }, null, 2)}\n`);
const paths = () =>
  createPaths({
    env: {
      AGENTRY_HOME: home,
      CLAUDE_CONFIG_DIR: claude,
      COPILOT_HOME: "",
    },
    cwd: repo,
  });
const now = () => {
  clock += 1000;
  return new Date(clock);
};
const io = {
  out: (line: unknown) => lines.push(String(line)),
  err: (line: unknown) => lines.push(String(line)),
  isTTY: () => false,
  now,
};
const engine = () => createCopilotShare(paths(), io);
const share = (name: string, extra: { dryRun?: boolean } = {}) =>
  engine().share({ kind: "mcp", name, path: repo, yes: true, ...extra });
const unshare = (name: string) =>
  engine().unshare({ kind: "mcp", name, path: repo, yes: true });
const undo = () => createFixUndo(paths(), io).run({ yes: true });
const stateOf = (name: string) =>
  shareState(paths(), repo).find(
    (item) => item.kind === "mcp" && item.name === name
  );
const copilotEntry = (name: string): unknown =>
  JSON.parse(readFileSync(mcpConfig(), "utf8")).mcpServers?.[name];
const read = (file: string) =>
  existsSync(file) ? readFileSync(file, "utf8") : "";

// Every file agentry may have written (Copilot's folder, its store and the backups) plus what the runs printed.
const everything = (): string => {
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) {
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        files.push(readFileSync(path, "utf8"));
      }
    }
  };
  walk(ch);
  walk(join(claude, "agentry"));
  return [...files, ...lines].join("\n");
};
const assertNoSecret = (secrets: string[] = Object.values(SECRETS)) => {
  const text = everything();
  for (const secret of secrets) {
    assert.ok(!text.includes(secret), `a fixture secret leaked: ${secret}`);
  }
  // Copilot's own file never holds a backup of claude.json; the store holds hashes only.
  assert.ok(!read(paths().copilotShares).includes("mcpServers"));
};

const localServer = {
  command: "npx",
  args: [
    "-y",
    "@acme/mcp",
    "--token",
    SECRETS.flagValue,
    `--api-key=${SECRETS.flagEq}`,
    SECRETS.bare,
    `PASSWORD=${SECRETS.pair}`,
    "--verbose",
    "${KEPT_ARG}",
  ],
  env: {
    ACME_KEY: SECRETS.env,
    MODE: SECRETS.plainEnv,
    ALREADY: "${ALREADY}",
    EMPTY: "",
  },
};
const remoteServer = {
  type: "http",
  url: "https://api.example.com/mcp",
  headers: {
    Authorization: `Bearer ${SECRETS.header}`,
    "X-Api-Key": SECRETS.apiKeyHeader,
    "X-Ref": "${REF_TOKEN}",
  },
  oauth: { clientSecret: SECRETS.oauth },
};

describe("share an MCP server with Copilot", () => {
  test("literals in env and args become ${VAR}; placeholders stay; nothing secret is written or printed", async () => {
    servers({ acme: localServer });
    assert.equal(await share("acme", { dryRun: true }), 0, lines.join("\n"));
    assert.ok(!existsSync(mcpConfig()), "--dry-run writes nothing");
    assert.ok(lines.some((line) => line.includes("ACME_KEY")));
    assert.ok(lines.some((line) => line.includes("launchctl")));

    assert.equal(await share("acme"), 0, lines.join("\n"));
    assert.deepEqual(copilotEntry("acme"), {
      type: "local",
      command: "npx",
      args: [
        "-y",
        "@acme/mcp",
        "--token",
        "${ACME_ARG_4}",
        "${ACME_ARG_5}",
        "${ACME_ARG_6}",
        "${ACME_ARG_7}",
        "--verbose",
        "${KEPT_ARG}",
      ],
      env: {
        ACME_KEY: "${ACME_KEY}",
        MODE: "${MODE}",
        ALREADY: "${ALREADY}",
        EMPTY: "",
      },
      tools: ["*"],
    });
    const printed = lines.join("\n");
    for (const variable of [
      "ACME_KEY",
      "MODE",
      "ALREADY",
      "ACME_ARG_4",
      "ACME_ARG_5",
      "ACME_ARG_6",
      "ACME_ARG_7",
      "KEPT_ARG",
    ]) {
      assert.ok(printed.includes(`  ${variable}  (`), variable);
    }
    assertNoSecret();
    assert.equal(stateOf("acme")?.state, "shared");
    const record = readShareStore(paths()).items["mcp:acme"];
    assert.ok(record);
    assert.equal(record.path, mcpConfig());
    assert.match(String(record.sha256), /^[0-9a-f]{64}$/);
  });

  test("a literal header becomes ${SERVER_HEADER} with Bearer kept; unknown keys are dropped", async () => {
    servers({
      "my-api": remoteServer,
      basic: {
        type: "sse",
        url: "https://sse.example.com/events",
        headers: { Authorization: `Basic ${SECRETS.basic}` },
      },
    });
    assert.equal(await share("my-api"), 0, lines.join("\n"));
    assert.equal(await share("basic"), 0, lines.join("\n"));
    assert.deepEqual(copilotEntry("my-api"), {
      type: "http",
      url: "https://api.example.com/mcp",
      headers: {
        Authorization: "Bearer ${MY_API_AUTHORIZATION}",
        "X-Api-Key": "${MY_API_X_API_KEY}",
        "X-Ref": "${REF_TOKEN}",
      },
      tools: ["*"],
    });
    assert.deepEqual(copilotEntry("basic"), {
      type: "sse",
      url: "https://sse.example.com/events",
      headers: { Authorization: "Basic ${BASIC_AUTHORIZATION}" },
      tools: ["*"],
    });
    assert.ok(lines.some((line) => line.includes("oauth")));
    assertNoSecret();
  });

  test("a secret in the url is refused with the reason (userinfo, query value, path segment)", async () => {
    servers({
      query: {
        type: "http",
        url: `https://x.example.com/mcp?api_key=${SECRETS.url}`,
      },
      userinfo: {
        type: "http",
        url: `https://user:${SECRETS.urlPass}@x.example.com/mcp`,
      },
      path: {
        type: "sse",
        url: `https://x.example.com/${SECRETS.urlPath}/sse`,
      },
    });
    const reasons: Record<string, string> = {
      query: "query value (api_key)",
      userinfo: "user info",
      path: "in its path",
    };
    for (const [name, reason] of Object.entries(reasons)) {
      lines = [];
      assert.equal(await share(name), 1, name);
      assert.ok(
        lines.some((line) => line.includes(reason)),
        `${name}: ${lines.join("\n")}`
      );
      assert.equal(stateOf(name)?.state, "notShared");
      assertNoSecret();
    }
    assert.ok(!existsSync(mcpConfig()));
  });

  test("${VAR:-default} is refused (not probed in Copilot), and ${VAR} in a url too", async () => {
    servers({
      defaulted: { command: "x", env: { TOKEN: "${TOKEN:-fallback}" } },
      header: {
        type: "http",
        url: "https://h.example.com",
        headers: { Authorization: "Bearer ${TOKEN:-fallback}" },
      },
      refUrl: { type: "http", url: "https://h.example.com/${TENANT}" },
    });
    assert.equal(await share("defaulted"), 1);
    assert.equal(await share("header"), 1);
    assert.equal(await share("refUrl"), 1);
    assert.ok(lines.some((line) => line.includes("${VAR:-default}")));
    assert.ok(lines.some((line) => line.includes("not known to expand there")));
    assert.ok(!lines.join("\n").includes("fallback"));
    assert.ok(!existsSync(mcpConfig()));
  });

  test("a name that exists in mcp-config.json and is not ours is refused; the file stays byte for byte", async () => {
    servers({ my: remoteServer });
    const before =
      '{\n  "mcpServers": {\n    "my": { "type": "http", "url": "https://other" }\n  }\n}\n';
    write(mcpConfig(), before);
    assert.equal(await share("my"), 1);
    assert.ok(lines.some((line) => line.includes("agentry did not add it")));
    assert.equal(read(mcpConfig()), before);
    assert.equal(stateOf("my")?.state, "other");
    assert.equal(
      await unshare("my"),
      1,
      "unshare refuses an entry agentry did not write"
    );
    assert.equal(read(mcpConfig()), before);
  });

  test("a link or non-strict mcp-config.json is refused", async () => {
    servers({ acme: localServer });
    write(join(root, "elsewhere.json"), "{}\n");
    symlinkSync(join(root, "elsewhere.json"), mcpConfig());
    assert.equal(await share("acme"), 1);
    assert.ok(lines.some((line) => line.includes("not a regular file")));
    rmSync(mcpConfig());
    write(mcpConfig(), '{ "mcpServers": {}, }\n');
    assert.equal(await share("acme"), 1);
    assert.ok(lines.some((line) => line.includes("not strict JSON")));
    assert.equal(read(join(root, "elsewhere.json")), "{}\n");
  });

  test("the repo's .mcp.json with the same name wins: a warning, and the state says so", async () => {
    servers({ acme: localServer });
    write(
      join(repo, ".mcp.json"),
      '{ "mcpServers": { "acme": { "command": "repo-acme" } } }\n'
    );
    assert.equal(stateOf("acme")?.state, "repoWins");
    assert.equal(await share("acme"), 0, lines.join("\n"));
    assert.ok(
      lines.some((line) =>
        line.includes("This repo has its own MCP server acme")
      )
    );
    const state = stateOf("acme");
    assert.equal(state?.state, "shared");
    assert.equal(state?.repoWins, true);
  });

  test("setup's copilot entry shows as setup and is refused", async () => {
    servers({ context7: remoteServer });
    write(
      paths().installManifest,
      JSON.stringify({ parts: { copilot: { mcp: ["context7"] } } })
    );
    write(
      mcpConfig(),
      '{ "mcpServers": { "context7": { "type": "http", "url": "https://mcp.context7.com/mcp" } } }\n'
    );
    assert.equal(stateOf("context7")?.state, "setup");
    assert.equal(await share("context7"), 1);
    assert.equal(await unshare("context7"), 1);
    assert.ok(
      lines.some((line) => line.includes("setup.sh uninstall --only copilot"))
    );
  });

  test("a project-only server is refused: Copilot loads the repo's .mcp.json already", async () => {
    servers({});
    write(
      join(repo, ".mcp.json"),
      '{ "mcpServers": { "proj": { "command": "p" } } }\n'
    );
    assert.equal(await share("proj"), 1);
    assert.ok(lines.some((line) => line.includes("not a user server")));
  });
});

describe("unshare and undo", () => {
  const other =
    '{\n  "mcpServers": {\n    "keep": {\n      "type": "local",\n      "command": "keep"\n    }\n  }\n}\n';

  test("unshare removes the entry only while it equals what was written; other bytes stay", async () => {
    servers({ acme: localServer });
    write(mcpConfig(), other);
    assert.equal(await share("acme"), 0, lines.join("\n"));
    assert.deepEqual(copilotEntry("keep"), { type: "local", command: "keep" });

    const shared = read(mcpConfig());
    write(
      mcpConfig(),
      shared.replace('"tools": [\n        "*"\n      ]', '"tools": []')
    );
    assert.notEqual(read(mcpConfig()), shared, "the fixture edit applied");
    assert.equal(await unshare("acme"), 1);
    assert.ok(
      lines.some((line) => line.includes("changed since agentry shared it"))
    );
    assert.ok(copilotEntry("acme"));

    // Reformatting the file keeps ownership: the parsed entry is what counts.
    write(mcpConfig(), JSON.stringify(JSON.parse(shared)));
    assert.equal(stateOf("acme")?.state, "shared");
    write(mcpConfig(), shared);
    assert.equal(await unshare("acme"), 0, lines.join("\n"));
    assert.equal(read(mcpConfig()), other);
    assert.equal(readShareStore(paths()).items["mcp:acme"], undefined);
    assert.equal(stateOf("acme")?.state, "notShared");
    assert.equal(await unshare("acme"), 0, "already not shared");
    assertNoSecret();
  });

  test("fix --undo restores mcp-config.json and the store", async () => {
    servers({ acme: localServer });
    write(mcpConfig(), other);
    assert.equal(await share("acme"), 0, lines.join("\n"));
    assert.equal(await undo(), 0, lines.join("\n"));
    assert.equal(read(mcpConfig()), other);
    assert.ok(!existsSync(paths().copilotShares));
    assert.equal(stateOf("acme")?.state, "notShared");
  });

  test("fix --undo of a share that created mcp-config.json removes it", async () => {
    servers({ acme: localServer });
    assert.equal(await share("acme"), 0, lines.join("\n"));
    assert.ok(existsSync(mcpConfig()));
    assert.equal(await undo(), 0, lines.join("\n"));
    assert.ok(!existsSync(mcpConfig()));
  });
});

describe("translateMcp", () => {
  test("types: stdio or none → local, streamable-http → http; others refused", () => {
    const local = translateMcp("a", { type: "stdio", command: "a" });
    assert.ok(!("error" in local));
    assert.equal(local.entry.type, "local");
    const http = translateMcp("b", {
      type: "streamable-http",
      url: "https://b",
    });
    assert.ok(!("error" in http));
    assert.equal(http.entry.type, "http");
    assert.ok("error" in translateMcp("c", { type: "ws", url: "wss://c" }));
    assert.ok("error" in translateMcp("d", { url: "https://d" }));
    assert.ok("error" in translateMcp("e", "nope"));
  });

  test("a secret in the command and a non-string value are refused", () => {
    assert.ok("error" in translateMcp("s", { command: SECRETS.bare }));
    assert.ok("error" in translateMcp("n", { command: "x", env: { A: 1 } }));
    assert.ok("error" in translateMcp("n", { command: "x", args: [1] }));
    assert.ok(
      "error" in translateMcp("k", { command: "x", env: { "bad-key": "v" } })
    );
  });

  test("a server name starting with a digit still gives a valid variable", () => {
    const made = translateMcp("1x", {
      type: "http",
      url: "https://x",
      headers: { Authorization: "tok" },
    });
    assert.ok(!("error" in made));
    assert.deepEqual(
      made.vars.map((item) => item.name),
      ["MCP_1X_AUTHORIZATION"]
    );
  });
});
