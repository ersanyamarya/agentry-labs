// The whole path in one process: the built web app behind serve(), the one-time token, then oRPC calls over HTTP that
// change real files in a temp home and leave a backup. Never touches the real ~/.claude.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { contract } from "../../packages/web/src/contract/index.js";
import { createFixture, type Fixture } from "./helpers/fixture.js";
import { root } from "./helpers/paths.js";

type Client = ContractRouterClient<typeof contract>;

let fx: Fixture;
let stop: () => Promise<void>;
let base = "";
let cookie = "";
let client: Client;
const saved = { ...process.env };

beforeAll(async () => {
  fx = createFixture();
  // The router builds its paths from the environment on first use, in this process.
  process.env.AGENTRY_HOME = fx.home;
  process.env.CLAUDE_CONFIG_DIR = fx.configDir;
  process.env.AGENTRY_MANAGED_DIR = fx.managedDir;
  mkdirSync(join(fx.configDir, "skills/notes"), { recursive: true });
  writeFileSync(
    join(fx.configDir, "skills/notes/SKILL.md"),
    "---\nname: notes\n---\n"
  );

  const { serve } = await import("../../packages/web/src/serve.js");
  const server = await serve({
    port: 0,
    open: false,
    out: () => undefined,
    webRoot: join(root, "dist/web"),
  });
  stop = server.close;
  base = `http://127.0.0.1:${server.port}`;

  const exchange = await fetch(server.url, { redirect: "manual" });
  expect(exchange.status).toBe(303);
  [cookie = ""] = (exchange.headers.get("set-cookie") ?? "").split(";");

  client = createORPCClient(
    new RPCLink({
      url: `${base}/rpc`,
      // What the browser adds on its own and Node's fetch does not: the checks in serve() need them on writes.
      headers: { cookie, origin: base, "sec-fetch-site": "same-origin" },
      method: (_options, path) => (path.join(".") === "load" ? "GET" : "POST"),
    })
  );
}, 60_000);

afterAll(async () => {
  await stop?.();
  process.env = saved;
  fx?.cleanup();
});

describe("agentry ui end to end", () => {
  test("the app and the rpc endpoint refuse a caller without the session cookie", async () => {
    expect((await fetch(`${base}/skills`)).status).toBe(401);
    expect((await fetch(`${base}/rpc/load`)).status).toBe(401);
  });

  test("the Skills page renders with the sidebar once the cookie is held", async () => {
    const page = await fetch(`${base}/skills`, { headers: { cookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<title>agentry");
  });

  test("load shows the project's shelf and skills", async () => {
    const data = await client.load({ dir: fx.repo });
    expect(data.groups.items.map((group) => group.name).sort()).toEqual([
      "audit",
      "video",
    ]);
    expect(data.status.skills.items.some((item) => item.name === "notes")).toBe(
      true
    );
  });

  test("toggleShelf over HTTP links the skill into the project, the same file the terminal UI changes", async () => {
    const result = await client.skills.toggleShelf({
      dir: fx.repo,
      target: "video/trim",
      on: true,
    });
    expect(result.ok).toBe(true);
    expect(
      lstatSync(join(fx.repo, ".claude/skills/trim")).isSymbolicLink()
    ).toBe(true);
  });

  test("removeSkill over HTTP deletes the skill and leaves a backup under the backups folder", async () => {
    const result = await client.skills.removeSkill({
      dir: fx.repo,
      target: "notes",
      backup: true,
    });
    expect(result.ok).toBe(true);
    expect(existsSync(join(fx.configDir, "skills/notes"))).toBe(false);
    const backups = join(fx.configDir, "backups/agentry");
    expect(existsSync(backups)).toBe(true);
    expect(readdirSync(backups).length).toBeGreaterThan(0);
  });
});
