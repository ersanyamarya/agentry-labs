// /rpc/*: the oRPC endpoint. The router module (node:fs, core) is imported inside the handler so it never reaches the
// browser bundle; the auth gate (token cookie, Host and Origin checks) sits in front of this in src/serve.ts.

import { createFileRoute } from "@tanstack/react-router";

const handle = async ({ request }: { request: Request }) => {
  const { handleRpc, realData } = await import("../server/router.js");
  return handleRpc(request, realData());
};

export const Route = createFileRoute("/rpc/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
