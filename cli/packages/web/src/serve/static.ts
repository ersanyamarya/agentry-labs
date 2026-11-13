// Maps a request path onto a file in the built client dir (dist/client), refusing anything that would leave it.

import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

// Explicit types matter: with X-Content-Type-Options nosniff a module script served as anything but a JavaScript type
// is refused by the browser.
const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function contentType(file: string): string {
  return (
    CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream"
  );
}

export type StaticLookup =
  | { kind: "file"; path: string; size: number }
  | { kind: "bad" }
  | { kind: "miss" };

// "bad" means the path is malformed or tries to climb out (`..`, encoded `%2f`, NUL); the caller answers 400 and
// never passes it on to the app. "miss" means no such file, so the app's router gets the request.
export async function lookupStatic(
  clientDir: string,
  pathname: string
): Promise<StaticLookup> {
  let decoded: string;
  try {
    // new URL() keeps %2f encoded, so the traversal check must run on the decoded form.
    decoded = decodeURIComponent(pathname);
  } catch {
    return { kind: "bad" };
  }
  if (
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    decoded.split("/").includes("..")
  ) {
    return { kind: "bad" };
  }
  const root = resolve(clientDir);
  const target = resolve(root, `.${decoded}`);
  if (!target.startsWith(root + sep)) {
    return { kind: "miss" };
  }
  try {
    const info = await stat(target);
    return info.isFile()
      ? { kind: "file", path: target, size: info.size }
      : { kind: "miss" };
  } catch {
    return { kind: "miss" };
  }
}
