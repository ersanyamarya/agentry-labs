// The checks that decide whether a request may reach the web app. Kept free of node:http so each rule is testable on
// plain header values.

import { createHash, timingSafeEqual } from "node:crypto";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Hashing both sides first gives two equal-length buffers, so timingSafeEqual never throws and the time taken does not
// depend on where the strings first differ or on how long the guess is.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

// An exact match on Host blocks DNS rebinding: a page on evil.example that resolves to 127.0.0.1 still sends
// `Host: evil.example:<port>`.
export function hostAllowed(host: string | undefined, port: number): boolean {
  return host !== undefined && allowedHosts(port).includes(host);
}

// Strict CSRF rule for POST, PUT, PATCH and DELETE (the SameSite=Strict cookie is the first line; this is the second):
// - an Origin header must be exactly http://127.0.0.1:<port> or http://localhost:<port> ("null" fails);
// - with no Origin, the browser must say Sec-Fetch-Site same-origin or none;
// - a Sec-Fetch-Site of same-site or cross-site fails even with a good Origin.
// A request that carries neither header is refused: every browser that runs the app sends at least one of them on a
// fetch() write, so only non-browser clients lose, and they have no business writing here.
export function originAllowed(
  method: string,
  origin: string | undefined,
  secFetchSite: string | undefined,
  port: number
): boolean {
  if (!MUTATING.has(method.toUpperCase())) {
    return true;
  }
  if (
    secFetchSite !== undefined &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "none"
  ) {
    return false;
  }
  if (origin !== undefined) {
    return allowedHosts(port).some((h) => origin === `http://${h}`);
  }
  return secFetchSite !== undefined;
}

// The port is part of the name because browsers do not scope cookies by port: two `agentry ui` runs on 127.0.0.1
// would otherwise overwrite each other's session.
export function cookieName(port: number): string {
  return `agentry_session_${port}`;
}

export function readCookie(
  header: string | undefined,
  name: string
): string | undefined {
  if (header === undefined) {
    return;
  }
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
}

// No Secure flag: the server speaks plain http on loopback. No Max-Age: the session ends with the browser, and the
// server's secrets end with the process anyway.
export function sessionCookie(port: number, value: string): string {
  return `${cookieName(port)}=${value}; HttpOnly; SameSite=Strict; Path=/`;
}

// TanStack Start writes its hydration bootstrap as inline <script> tags (checked against the built app), so script-src
// needs 'unsafe-inline'. A per-request nonce would be tighter, but Start only stamps one when the router is created
// with `ssr: { nonce }`, which belongs to the app (src/router.tsx), not to this wrapper. Inline scripts can only come
// from our own server-rendered HTML here, and connect-src/form-action keep data from leaving the origin.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

// Every authed response is private to this session, so nothing is cached; the rest stop sniffing, referrer leaks and
// framing.
export const SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "content-security-policy": CONTENT_SECURITY_POLICY,
};
