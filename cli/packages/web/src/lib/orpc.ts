// The typed oRPC client and its TanStack Query helpers. Calls go to /rpc on the origin the page came from, resolved when a
// call is made: window.location in the browser, the incoming request during the server render.

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import type { Client } from "../contract/index.js";

// During the server render the call is a fetch back to this same server, so it carries the page request's cookie (the
// auth token) and nothing else; forwarding every header (content-length, connection) can break Node's fetch.
const requestContext = createIsomorphicFn()
  .client(() => ({ origin: window.location.origin, cookie: undefined }))
  .server(() => ({
    origin: new URL(getRequest().url).origin,
    cookie: getRequestHeader("cookie"),
  }));

const link = new RPCLink({
  url: () => `${requestContext().origin}/rpc`,
  headers: () => {
    const { cookie } = requestContext();
    return cookie ? { cookie } : {};
  },
  // load is the only read; it goes as GET (the contract declares it so) and every write as POST.
  method: (_options, path) => (path.join(".") === "load" ? "GET" : "POST"),
});

export const client: Client = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
