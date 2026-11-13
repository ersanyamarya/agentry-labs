import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

// One QueryClient per router, so each server render has its own cache.
export const getRouter = () => {
  const queryClient = new QueryClient();
  const router = createRouter({
    context: { queryClient },
    defaultPreload: "intent",
    routeTree,
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
