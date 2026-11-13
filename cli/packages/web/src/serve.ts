// `agentry ui`: a loopback-only node:http server in front of the built TanStack Start app. It owns the whole security
// boundary (Host and Origin checks, the launch token and the session cookie) so the app behind it never sees an
// unauthenticated request. Imported by the CLI bundle, so it stays free of app code, React and @tanstack imports.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  cookieName,
  hostAllowed,
  originAllowed,
  readCookie,
  SECURITY_HEADERS,
  safeEqual,
  sessionCookie,
} from "./serve/security.js";
import { contentType, lookupStatic } from "./serve/static.js";

// The only address the server ever binds. Anything reachable from another machine would expose the user's config.
const HOST = "127.0.0.1";
const MAX_PORT = 65_535;

export interface FetchHandler {
  fetch: (request: Request) => Promise<Response> | Response;
}

export interface ServeOptions {
  /** Static assets; default `<webRoot>/client`. */
  clientDir?: string;
  /** The Start fetch handler; skips loading `<webRoot>/server/server.js`. */
  handler?: FetchHandler;
  /** Accepted only so callers can be explicit; anything other than 127.0.0.1 throws. */
  host?: string;
  /** Opens the token URL; `false` (from --no-open) skips it. Default: the platform's browser opener. */
  open?: ((url: string) => void) | false;
  /** Where the one line with the token URL, and later token-free notices, go. Default: stdout. */
  out?: (line: string) => void;
  /** 0 or omitted: any free port. */
  port?: number;
  /** Folder holding the Start build: `server/server.js` and `client/`. Default: `<cli root>/dist/web`. */
  webRoot?: string;
}

export interface UiServer {
  /** The bound address, always 127.0.0.1. */
  address: string;
  close: () => Promise<void>;
  port: number;
  /** The token URL printed at launch. */
  url: string;
}

export interface UiArgs {
  open: boolean;
  port: number;
}

// The CLI bundle lives in <cli root>/dist/bin, and the web build is copied to <cli root>/dist/web.
const defaultWebRoot = (): string =>
  fileURLToPath(new URL("../web/", import.meta.url));

/** Parses the arguments after `agentry ui`. Throws an Error whose message is ready to print. */
export function parseUiArgs(argv: readonly string[]): UiArgs {
  const args: UiArgs = { port: 0, open: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--no-open") {
      args.open = false;
    } else if (arg === "--port") {
      i += 1;
      args.port = parsePort(argv[i]);
    } else if (arg.startsWith("--port=")) {
      args.port = parsePort(arg.slice("--port=".length));
    } else if (arg.startsWith("-")) {
      throw new Error(
        `agentry ui: unknown option ${arg} (options: --port <n>, --no-open)`
      );
    } else {
      throw new Error(
        `agentry ui: unexpected argument ${arg} (options: --port <n>, --no-open)`
      );
    }
  }
  return args;
}

function parsePort(value: string | undefined): number {
  const port =
    value !== undefined && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(port) || port > MAX_PORT) {
    throw new Error(
      `agentry ui: --port needs a number from 0 to ${MAX_PORT}, got ${value ?? "nothing"}`
    );
  }
  return port;
}

export async function serve(options: ServeOptions = {}): Promise<UiServer> {
  if (options.host !== undefined && options.host !== HOST) {
    throw new Error(
      `agentry ui: refusing to listen on ${options.host}; the server binds ${HOST} only`
    );
  }
  const out =
    options.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const webRoot = options.webRoot ?? defaultWebRoot();
  const clientDir = options.clientDir ?? join(webRoot, "client");
  const handler =
    options.handler ??
    (await loadHandler(join(webRoot, "server", "server.js")));

  // The token travels in a URL (terminal, browser history before the redirect, the opener's argv); the cookie holds a
  // separate value so a leaked cookie and a leaked URL are not the same secret, and the cookie value is never printed.
  const token = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  // Belt and braces: every line after the first goes through this, so the token cannot reach the log even if an error
  // message quotes a URL.
  const log = (line: string): void => out(line.replaceAll(token, "<token>"));

  let port = 0;
  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log(
        `agentry ui: request failed: ${error instanceof Error ? error.message : String(error)}`
      );
      if (res.headersSent) {
        res.destroy();
      } else {
        deny(res, 500, "Internal error");
      }
    });
  });

  async function handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    if (!hostAllowed(req.headers.host, port)) {
      return deny(res, 403, "Forbidden: unexpected Host");
    }
    if (
      !originAllowed(
        method,
        header(req, "origin"),
        header(req, "sec-fetch-site"),
        port
      )
    ) {
      return deny(res, 403, "Forbidden: cross-origin write");
    }
    // Parsed against our own origin, never the Host header, so the app sees one canonical origin.
    const base = `http://${HOST}:${port}`;
    const url = new URL(req.url ?? "/", base);
    const pathname = url.pathname.replace(/^\/+/, "/");

    const offered = url.searchParams.get("token");
    if (offered !== null && (method === "GET" || method === "HEAD")) {
      if (!safeEqual(offered, token)) {
        return deny(res, 401, "Unauthorized: bad token");
      }
      // 303 to the same path minus the token, so the secret leaves the address bar and history. The Location is
      // relative and starts with a single slash, so it can never point off-site (`//host` would).
      url.searchParams.delete("token");
      res.writeHead(303, {
        ...SECURITY_HEADERS,
        location: `${pathname}${url.search}`,
        "set-cookie": sessionCookie(port, session),
      });
      res.end();
      return;
    }

    const cookie = readCookie(req.headers.cookie, cookieName(port));
    if (cookie === undefined || !safeEqual(cookie, session)) {
      return deny(res, 401, "Unauthorized: open the URL agentry ui printed");
    }

    const found = await lookupStatic(clientDir, pathname);
    if (found.kind === "bad") {
      return deny(res, 400, "Bad request path");
    }
    if (found.kind === "file" && (method === "GET" || method === "HEAD")) {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "content-type": contentType(found.path),
        "content-length": String(found.size),
      });
      if (method === "HEAD") {
        res.end();
        return;
      }
      await pipeline(createReadStream(found.path), res);
      return;
    }

    const request = toRequest(req, method, `${base}${pathname}${url.search}`);
    await sendResponse(res, await handler.fetch(request), method);
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const bound = server.address() as AddressInfo;
  ({ port } = bound);

  const url = `http://${HOST}:${port}/?token=${token}`;
  out(`agentry ui: ${url}`);
  const open = options.open ?? defaultOpen(log);
  if (open !== false) {
    open(url);
  }

  return {
    url,
    port,
    address: bound.address,
    close: () =>
      new Promise<void>((resolve) => {
        // Browsers keep sockets alive; without this close() waits for them to time out.
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

async function loadHandler(entry: string): Promise<FetchHandler> {
  let mod: unknown;
  try {
    // A computed specifier, so the CLI bundler leaves this import to runtime instead of inlining the app.
    mod = await import(pathToFileURL(entry).href);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `agentry ui: cannot load the web app from ${entry}; build it first (${reason})`,
      { cause: error }
    );
  }
  const candidate = (mod as { default?: unknown }).default;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { fetch?: unknown }).fetch === "function"
  ) {
    return candidate as FetchHandler;
  }
  throw new Error(
    `agentry ui: ${entry} has no default export with a fetch(request) function`
  );
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function deny(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "text/plain; charset=utf-8",
  });
  res.end(`${message}\n`);
}

function toRequest(req: IncomingMessage, method: string, url: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v !== undefined) {
        headers.append(name, v);
      }
    }
  }
  const hasBody = method !== "GET" && method !== "HEAD";
  // `duplex` is required by Node's fetch for a streamed body but missing from the DOM RequestInit type.
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (hasBody) {
    init.body = Readable.toWeb(req) as unknown as NonNullable<
      RequestInit["body"]
    >;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function sendResponse(
  res: ServerResponse,
  response: Response,
  method: string
): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") {
      headers[name] = value;
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    headers["set-cookie"] = cookies;
  }
  // Our headers fill gaps only: if the app sets its own CSP or caching later, the app's choice wins.
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers[name] ??= value;
  }
  res.writeHead(response.status, headers);
  if (response.body === null || method === "HEAD") {
    res.end();
    return;
  }
  await pipeline(
    Readable.fromWeb(response.body as unknown as NodeReadableStream),
    res
  );
}

function defaultOpen(log: (line: string) => void): (url: string) => void {
  return (url) => {
    const [command, args]: [string, string[]] =
      process.platform === "darwin"
        ? ["open", [url]]
        : process.platform === "win32"
          ? // `start` is a cmd builtin; the empty string is its window-title argument.
            ["cmd", ["/c", "start", "", url]]
          : ["xdg-open", [url]];
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    // The message never repeats the URL: it holds the token.
    child.on("error", () =>
      log("agentry ui: could not open a browser; open the URL above by hand")
    );
    child.unref();
  };
}
