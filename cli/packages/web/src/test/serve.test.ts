// @vitest-environment node
// The `agentry ui` server: Host/Origin checks, the token-for-cookie exchange, loopback bind and static safety. A fake
// Start build (server/server.js plus client/) in a temp dir stands in for the real one.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { safeEqual } from "../serve/security.js";
import { parseUiArgs, serve, type UiServer } from "../serve.js";

interface Reply {
  body: string;
  headers: Record<string, string | string[] | undefined>;
  status: number;
}

function send(
  port: number,
  path: string,
  {
    method = "GET",
    headers = {},
  }: { method?: string; headers?: Record<string, string> } = {}
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: { host: `127.0.0.1:${port}`, ...headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body })
        );
      }
    );
    req.on("error", reject);
    req.end(method === "GET" ? undefined : "{}");
  });
}

let root: string;
let lines: string[];
let server: UiServer;
let token: string;

async function start(port?: number): Promise<UiServer> {
  lines = [];
  const s = await serve({
    webRoot: join(root, "web"),
    open: false,
    out: (line) => lines.push(line),
    ...(port === undefined ? {} : { port }),
  });
  token = new URL(s.url).searchParams.get("token") ?? "";
  return s;
}

async function login(s: UiServer): Promise<string> {
  const reply = await send(s.port, `/?token=${token}`);
  const setCookie = reply.headers["set-cookie"];
  return (
    String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0] ??
    ""
  );
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "agentry-serve-"));
  // The server reads no config, but keep the real home out of reach in case the app ever does.
  vi.stubEnv("AGENTRY_HOME", join(root, "agentry"));
  vi.stubEnv("CLAUDE_CONFIG_DIR", join(root, "claude"));
  mkdirSync(join(root, "web", "server"), { recursive: true });
  mkdirSync(join(root, "web", "client", "assets"), { recursive: true });
  writeFileSync(
    join(root, "web", "server", "server.js"),
    `export default { async fetch(request) {
      const url = new URL(request.url);
      const body = request.method === "GET" ? "" : await request.text();
      return new Response("app " + request.method + " " + url.pathname + url.search + " " + body,
        { headers: { "content-type": "text/html" } });
    } };\n`
  );
  writeFileSync(
    join(root, "web", "client", "assets", "app.js"),
    "console.log('hi');\n"
  );
  writeFileSync(join(root, "secret.txt"), "top secret\n");
});

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("agentry ui server", () => {
  beforeAll(async () => {
    server = await start();
  });
  afterAll(() => server.close());

  it("binds 127.0.0.1 and prints the token URL", () => {
    expect(server.address).toBe("127.0.0.1");
    expect(server.url).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}$/
    );
    expect(lines[0]).toContain(server.url);
  });

  it("refuses any host but 127.0.0.1", async () => {
    await expect(
      serve({
        host: "0.0.0.0",
        webRoot: join(root, "web"),
        open: false,
        out: () => {},
      })
    ).rejects.toThrow(/127\.0\.0\.1 only/);
  });

  it("returns 403 for a wrong Host", async () => {
    const cookie = await login(server);
    for (const host of [
      "evil.example",
      `evil.example:${server.port}`,
      `127.0.0.1:${server.port + 1}`,
    ]) {
      const reply = await send(server.port, `/?token=${token}`, {
        headers: { host, cookie },
      });
      expect(reply.status).toBe(403);
      expect(reply.headers["set-cookie"]).toBeUndefined();
    }
    const ok = await send(server.port, "/", {
      headers: { host: `localhost:${server.port}`, cookie },
    });
    expect(ok.status).toBe(200);
  });

  it("exchanges the token for an HttpOnly SameSite=Strict cookie and a 303 without the token", async () => {
    const reply = await send(server.port, `/skills?token=${token}&tab=1`);
    expect(reply.status).toBe(303);
    expect(reply.headers.location).toBe("/skills?tab=1");
    const setCookie = String(reply.headers["set-cookie"]);
    expect(setCookie).toMatch(
      new RegExp(`^agentry_session_${server.port}=[0-9a-f]{64}; `)
    );
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain(token);

    const home = await send(server.port, `/?token=${token}`);
    expect(home.headers.location).toBe("/");
    const offSite = await send(server.port, `//evil.example/?token=${token}`);
    expect(offSite.headers.location).toBe("/");
  });

  it("returns 401 for a missing or wrong cookie or token", async () => {
    expect((await send(server.port, "/")).status).toBe(401);
    expect(
      (
        await send(server.port, "/", {
          headers: { cookie: `agentry_session_${server.port}=nope` },
        })
      ).status
    ).toBe(401);
    const bad = await send(server.port, `/?token=${"0".repeat(64)}`);
    expect(bad.status).toBe(401);
    expect(bad.headers["set-cookie"]).toBeUndefined();
    expect((await send(server.port, "/assets/app.js")).status).toBe(401);
  });

  it("passes an authed request to the app with security headers", async () => {
    const cookie = await login(server);
    const reply = await send(server.port, "/skills?q=x", {
      headers: { cookie },
    });
    expect(reply.status).toBe(200);
    expect(reply.body).toContain("app GET /skills?q=x");
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    expect(reply.headers["referrer-policy"]).toBe("no-referrer");
    expect(reply.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'"
    );
  });

  it("returns 403 for a POST with a foreign Origin, and for one with no Origin or Sec-Fetch-Site", async () => {
    const cookie = await login(server);
    const post = (headers: Record<string, string>) =>
      send(server.port, "/rpc", {
        method: "POST",
        headers: { cookie, ...headers },
      });
    expect((await post({ origin: "http://evil.example" })).status).toBe(403);
    expect((await post({ origin: "null" })).status).toBe(403);
    expect(
      (await post({ origin: `http://127.0.0.1:${server.port + 1}` })).status
    ).toBe(403);
    expect((await post({})).status).toBe(403);
    expect(
      (
        await post({
          origin: `http://127.0.0.1:${server.port}`,
          "sec-fetch-site": "cross-site",
        })
      ).status
    ).toBe(403);

    const ok = await post({ origin: `http://localhost:${server.port}` });
    expect(ok.status).toBe(200);
    expect(ok.body).toContain("app POST /rpc {}");
    expect((await post({ "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  it("serves client files with a content type and refuses path traversal", async () => {
    const cookie = await login(server);
    const asset = await send(server.port, "/assets/app.js", {
      headers: { cookie },
    });
    expect(asset.status).toBe(200);
    expect(asset.headers["content-type"]).toBe(
      "text/javascript; charset=utf-8"
    );
    expect(asset.body).toContain("console.log");

    for (const path of [
      "/..%2f..%2fsecret.txt",
      "/assets/..%2f..%2f..%2fsecret.txt",
      "/%E0%A4%A",
    ]) {
      const reply = await send(server.port, path, { headers: { cookie } });
      expect(reply.status).toBe(400);
      expect(reply.body).not.toContain("top secret");
    }
    // The URL parser folds %2e%2e into ".." and resolves it before we look, so this stays inside the client dir.
    const dotted = await send(server.port, "/%2e%2e/%2e%2e/secret.txt", {
      headers: { cookie },
    });
    expect(dotted.body).not.toContain("top secret");
  });

  it("never logs the token after the first line", async () => {
    const cookie = await login(server);
    await send(server.port, `/?token=${token}`, {
      headers: { host: "evil.example" },
    });
    await send(server.port, "/nope", { headers: { cookie } });
    expect(lines.slice(1).join("\n")).not.toContain(token);
  });
});

describe("agentry ui server options", () => {
  let other: UiServer | undefined;
  afterEach(async () => {
    await other?.close();
    other = undefined;
  });

  it("honours --port", async () => {
    const free = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address() as AddressInfo;
        probe.close(() => resolve(port));
      });
    });
    other = await start(
      parseUiArgs(["--port", String(free), "--no-open"]).port
    );
    expect(other.port).toBe(free);
    expect(other.url.startsWith(`http://127.0.0.1:${free}/?token=`)).toBe(true);
  });

  it("redacts the token from later log lines, such as a failing request", async () => {
    lines = [];
    other = await serve({
      handler: {
        fetch: (request) => {
          throw new Error(`boom at ${request.url} ${token}`);
        },
      },
      clientDir: join(root, "web", "client"),
      open: false,
      out: (line) => lines.push(line),
    });
    token = new URL(other.url).searchParams.get("token") ?? "";
    const cookie = await login(other);
    const reply = await send(other.port, "/x", { headers: { cookie } });
    expect(reply.status).toBe(500);
    expect(reply.body).not.toContain(token);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).join("\n")).not.toContain(token);
  });
});

describe("safeEqual", () => {
  it("compares in constant time without throwing on length differences", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("parseUiArgs", () => {
  it("defaults to a free port and opening the browser", () => {
    expect(parseUiArgs([])).toEqual({ port: 0, open: true });
  });

  it("reads --port <n>, --port=<n> and --no-open", () => {
    expect(parseUiArgs(["--port", "4321", "--no-open"])).toEqual({
      port: 4321,
      open: false,
    });
    expect(parseUiArgs(["--port=0"])).toEqual({ port: 0, open: true });
  });

  it("rejects bad ports, unknown flags and stray arguments", () => {
    expect(() => parseUiArgs(["--port"])).toThrow(/--port needs a number/);
    expect(() => parseUiArgs(["--port", "abc"])).toThrow(
      /--port needs a number/
    );
    expect(() => parseUiArgs(["--port", "70000"])).toThrow(
      /--port needs a number/
    );
    expect(() => parseUiArgs(["--port", "-1"])).toThrow(
      /--port needs a number/
    );
    expect(() => parseUiArgs(["--host", "0.0.0.0"])).toThrow(
      /unknown option --host/
    );
    expect(() => parseUiArgs(["extra"])).toThrow(/unexpected argument extra/);
  });
});
