import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AppShell } from "../components/app-shell.js";
import { mockClient } from "./mock-orpc.js";

vi.mock("../lib/orpc.js", async () =>
  (await import("./mock-orpc.js")).mockOrpc()
);

afterEach(cleanup);

const mount = async (path = "/skills") => {
  const root = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });
  const pages = ["skills", "doctor", "mcp"].map((name) =>
    createRoute({
      getParentRoute: () => root,
      path: `/${name}`,
      component: () => <p>{name} page</p>,
    })
  );
  const router = createRouter({
    routeTree: root.addChildren(pages),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  await screen.findByText("Library");
};

beforeEach(() => vi.clearAllMocks());

describe("the sidebar", () => {
  test("shows the three groups and the eight sections in design order", async () => {
    await mount();
    const nav = screen.getByLabelText("Sections");
    const text = nav.textContent ?? "";
    const order = [
      "Library",
      "Skills",
      "MCP",
      "Hooks",
      "Plugins",
      "Rules",
      "Discover",
      "Catalog",
      "Health",
      "Doctor",
      "Backups",
    ];
    const positions = order.map((word) => text.indexOf(word));
    expect(
      positions.every(
        (position, index) =>
          position >= 0 && (index === 0 || position > positions[index - 1])
      )
    ).toBe(true);
  });

  test("marks the current section with aria-current and shows counts, Doctor's in the error count", async () => {
    await mount("/skills");
    const skills = await screen.findByRole("link", { name: /Skills/ });
    expect(skills.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByRole("link", { name: /Doctor/ }).getAttribute("aria-current")
    ).toBeNull();
    const nav = screen.getByLabelText("Sections");
    expect((await within(nav).findAllByText("3")).length).toBeGreaterThan(0); // 3 skills (and 3 findings)
    expect(within(nav).getByText("4")).toBeTruthy(); // 4 rules
    // Doctor shows its 2 errors, not its 3 findings
    expect(
      screen.getByRole("link", { name: /Doctor/ }).closest("li")?.textContent
    ).toContain("2");
    expect(within(nav).getByText("3 problems")).toBeTruthy();
  });

  test("the ? key and the footer button open the help dialog", async () => {
    await mount();
    await userEvent.keyboard("?");
    expect(await screen.findByText("Keyboard shortcuts")).toBeTruthy();
  });

  test("the scope switcher starts on This project and switches to Global", async () => {
    await mount();
    const project = await screen.findByRole("radio", { name: "This project" });
    expect(project.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(screen.getByRole("radio", { name: "Global" }));
    expect(
      screen.getByRole("radio", { name: "Global" }).getAttribute("aria-checked")
    ).toBe("true");
  });

  test("it asks the server for the folder, then loads that folder", async () => {
    await mount();
    await screen.findByText("0.1.0");
    expect(mockClient.info).toHaveBeenCalled();
    expect(mockClient.load).toHaveBeenCalledWith(
      { dir: "/work/app" },
      expect.anything()
    );
  });
});
