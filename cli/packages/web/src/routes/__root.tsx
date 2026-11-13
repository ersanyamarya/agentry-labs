/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import logo from "../assets/logo.svg?url";
import { AppShell } from "../components/app-shell.js";
import appCss from "../styles/globals.css?url";

export interface RouterContext {
  queryClient: QueryClient;
}

const RootComponent = () => (
  <html className="dark" lang="en">
    <head>
      <HeadContent />
    </head>
    <body>
      <AppShell>
        <Outlet />
      </AppShell>
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  head: () => ({
    links: [
      { href: logo, rel: "icon", type: "image/svg+xml" },
      { href: appCss, rel: "stylesheet" },
    ],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "agentry" },
    ],
  }),
});
