// Copilot in the web UI: a column of checkboxes on Skills, MCP, Agents and Rules and a "Copilot in this repo" switch in the
// sidebar, only when Copilot's folder exists and it is signed in. Every write opens the usual preview first.

import { messages } from "@agentry/core/messages";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentsScreen } from "../components/agents-screen.js";
import { AppShell } from "../components/app-shell.js";
import { keysFor } from "../components/help-dialog.js";
import { McpScreen } from "../components/mcp-screen.js";
import { RulesScreen } from "../components/rules-screen.js";
import { SkillsScreen } from "../components/skills-screen.js";
import type { LoadData } from "../contract/index.js";
import { loadFixture } from "./fixtures.js";
import { mockClient } from "./mock-orpc.js";

vi.mock("../lib/orpc.js", async () =>
  (await import("./mock-orpc.js")).mockOrpc()
);
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  }),
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const { copilot: CP, web } = messages();
const dir = "/work/app";

type Items = NonNullable<LoadData["copilot"]>["items"];
const items: Items = [
  { kind: "skill", name: "run-fallow", state: "notShared", repoWins: false },
  { kind: "skill", name: "audit-one", state: "shared", repoWins: false },
  { kind: "mcp", name: "demo", state: "notShared", repoWins: false },
  { kind: "agent", name: "reviewer", state: "notShared", repoWins: false },
  {
    kind: "rule",
    name: "commit-attribution",
    state: "notShared",
    repoWins: false,
  },
  {
    kind: "rule",
    name: "context7",
    state: "setup",
    repoWins: false,
    why: CP.whyNot.setup,
  },
];

// The shared fixture with the real id shapes core uses for user rules, and the given Copilot state (none = no Copilot).
const serve = (copilot?: Partial<NonNullable<LoadData["copilot"]>>) => {
  const load = loadFixture();
  load.rules.items[0].id = "user:rules/commit-attribution.md";
  load.rules.items[2].id = "user:rules/context7.md";
  load.rules.items[3].id = "user:rules/trail.md";
  mockClient.load.mockImplementation(async () => ({
    ...load,
    ...(copilot
      ? { copilot: { signedIn: true, trusted: false, items, ...copilot } }
      : {}),
  }));
};

const mount = async (path: string) => {
  const root = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });
  const pages = [
    ["skills", <SkillsScreen key="s" />],
    ["mcp", <McpScreen key="m" />],
    ["agents", <AgentsScreen key="a" />],
    ["rules", <RulesScreen key="r" />],
    ["doctor", <p key="d">doctor page</p>],
  ].map(([name, page]) =>
    createRoute({
      getParentRoute: () => root,
      path: `/${name as string}`,
      component: () => page,
    })
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider
        router={createRouter({
          routeTree: root.addChildren(pages),
          history: createMemoryHistory({ initialEntries: [path] }),
        })}
      />
    </QueryClientProvider>
  );
  await screen.findByText("Setup");
  await waitFor(() => expect(mockClient.load).toHaveBeenCalled());
};

const box = (name: string) => screen.findByRole("checkbox", { name });
const apply = async () => {
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Would change a file");
  await userEvent.click(within(dialog).getByRole("button", { name: /Apply/ }));
};

describe("hidden without a signed-in Copilot", () => {
  for (const [label, copilot] of [
    ["no Copilot folder", undefined],
    ["not signed in", { signedIn: false }],
  ] as const) {
    for (const path of ["/skills", "/mcp", "/agents", "/rules"]) {
      test(`${label} on ${path}: no column, no checkbox, no switch, no hint, no help keys`, async () => {
        serve(copilot);
        await mount(path);
        await screen.findAllByRole("row");
        expect(
          screen.queryByRole("columnheader", { name: CP.column })
        ).toBeNull();
        expect(
          screen.queryAllByRole("checkbox", { name: /with Copilot/ })
        ).toEqual([]);
        expect(screen.queryByRole("switch", { name: CP.repoLabel })).toBeNull();
        expect(
          screen.queryByText(web.copilot.hint, { exact: false })
        ).toBeNull();
        await userEvent.keyboard("?");
        const help = await screen.findByRole("dialog");
        expect(within(help).queryByText(CP.help[0][1])).toBeNull();
        await userEvent.keyboard("{Escape}");
      });
    }
  }

  test("help keys do not include C or T without Copilot", () => {
    expect(keysFor("skills")).not.toContainEqual(CP.help[0]);
    expect(keysFor("skills", true)).toContainEqual(CP.help[0]);
    expect(keysFor("doctor", true)).not.toContainEqual(CP.help[0]);
  });
});

describe("Skills", () => {
  test("ticking a user skill previews for all projects, then shares only after Apply", async () => {
    serve({});
    await mount("/skills");
    expect(
      await screen.findByRole("columnheader", { name: CP.column })
    ).toBeTruthy();
    await userEvent.click(await box("Share the skill run-fallow with Copilot"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        web.preview.title(CP.preview.share("skill", "run-fallow"))
      )
    ).toBeTruthy();
    expect(CP.preview.share("skill", "run-fallow")).toContain("all projects");
    const input = {
      dir,
      action: "share",
      kind: "skill",
      name: "run-fallow",
    };
    expect(mockClient.copilot.previewCopilot).toHaveBeenCalledWith(input);
    expect(mockClient.copilot.applyCopilot).not.toHaveBeenCalled();
    await apply();
    await waitFor(() =>
      expect(mockClient.copilot.applyCopilot).toHaveBeenCalledWith(input)
    );
  });

  test("a shared skill is a ticked box that previews unsharing", async () => {
    serve({});
    await mount("/skills");
    const checkbox = await box("Stop sharing the skill audit-one with Copilot");
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    await userEvent.click(checkbox);
    await screen.findByRole("dialog");
    expect(mockClient.copilot.previewCopilot).toHaveBeenCalledWith({
      dir,
      action: "unshare",
      kind: "skill",
      name: "audit-one",
    });
  });

  test("project and library-only rows are disabled with the why-not as the tooltip", async () => {
    serve({});
    await mount("/skills");
    await screen.findByRole("columnheader", { name: CP.column });
    for (const why of [CP.whyNot.projectOnly, CP.whyNot.libraryOnly]) {
      const cell = await screen.findByTitle(why);
      expect(within(cell).getByRole("checkbox").hasAttribute("disabled")).toBe(
        true
      );
    }
  });

  test("C on a selected row opens the preview; on a project row it says why and writes nothing", async () => {
    serve({});
    await mount("/skills");
    await screen.findByRole("columnheader", { name: CP.column });
    await userEvent.keyboard("C");
    await screen.findByRole("dialog");
    expect(mockClient.copilot.previewCopilot).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("n");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(await screen.findByText("proj-only"));
    await userEvent.keyboard("C");
    expect(toast.message).toHaveBeenCalledWith(CP.whyNot.projectOnly);
    expect(mockClient.copilot.previewCopilot).toHaveBeenCalledTimes(1);
  });

  test("the key hint line names C and T", async () => {
    serve({});
    await mount("/skills");
    expect(
      await screen.findByText(web.copilot.hint, { exact: false })
    ).toBeTruthy();
  });
});

describe("MCP, Agents and Rules", () => {
  test("MCP: a user server shares as kind mcp; a project server is disabled with its why", async () => {
    serve({});
    await mount("/mcp");
    await userEvent.click(await box("Share the MCP server demo with Copilot"));
    await apply();
    await waitFor(() =>
      expect(mockClient.copilot.applyCopilot).toHaveBeenCalledWith({
        dir,
        action: "share",
        kind: "mcp",
        name: "demo",
      })
    );
    const why = within(await screen.findByTitle(CP.whyNot.projectOnly));
    expect(why.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
  });

  test("Agents: a user agent shares, a project agent is disabled", async () => {
    serve({});
    await mount("/agents");
    await userEvent.click(await box("Share the agent reviewer with Copilot"));
    await screen.findByRole("dialog");
    expect(mockClient.copilot.previewCopilot).toHaveBeenCalledWith({
      dir,
      action: "share",
      kind: "agent",
      name: "reviewer",
    });
    await userEvent.keyboard("n");
    const why = within(await screen.findByTitle(CP.whyNot.projectOnly));
    expect(why.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
  });

  test("Rules: a user rule shares; a rule added by setup, a project CLAUDE.md are disabled", async () => {
    serve({});
    await mount("/rules");
    await userEvent.click(
      await box("Share the rule commit-attribution with Copilot")
    );
    await screen.findByRole("dialog");
    expect(mockClient.copilot.previewCopilot).toHaveBeenCalledWith({
      dir,
      action: "share",
      kind: "rule",
      name: "commit-attribution",
    });
    await userEvent.keyboard("n");
    const setup = within(await screen.findByTitle(CP.whyNot.setup));
    expect(setup.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
    const project = within(await screen.findByTitle(CP.whyNot.projectOnly));
    expect(project.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
  });
});

describe("Copilot in this repo", () => {
  test("the switch trusts after a preview and Apply", async () => {
    serve({});
    await mount("/agents");
    const toggle = await screen.findByRole("switch", { name: CP.repoLabel });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(toggle);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(CP.trust.explain)).toBeTruthy();
    expect(mockClient.copilot.previewCopilot).toHaveBeenCalledWith({
      dir,
      action: "trust",
    });
    expect(mockClient.copilot.applyCopilot).not.toHaveBeenCalled();
    await apply();
    await waitFor(() =>
      expect(mockClient.copilot.applyCopilot).toHaveBeenCalledWith({
        dir,
        action: "trust",
      })
    );
  });

  test("when trusted the switch is on and T previews untrusting, from any of the four screens", async () => {
    serve({ trusted: true });
    await mount("/rules");
    const toggle = await screen.findByRole("switch", { name: CP.repoLabel });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await screen.findByRole("columnheader", { name: CP.column });
    await userEvent.keyboard("T");
    await screen.findByRole("dialog");
    expect(mockClient.copilot.previewCopilot).toHaveBeenCalledWith({
      dir,
      action: "untrust",
    });
  });

  test("the switch shows on every screen, including ones without a column", async () => {
    serve({});
    await mount("/doctor");
    expect(
      await screen.findByRole("switch", { name: CP.repoLabel })
    ).toBeTruthy();
  });
});

describe("help dialog", () => {
  for (const path of ["/skills", "/mcp", "/agents", "/rules"]) {
    test(`${path}: ? lists C and T`, async () => {
      serve({});
      await mount(path);
      await screen.findByRole("columnheader", { name: CP.column });
      await userEvent.keyboard("?");
      const help = await screen.findByRole("dialog");
      for (const [, what] of CP.help) {
        expect(within(help).getByText(what)).toBeTruthy();
      }
    });
  }

  test("/doctor: ? has no Copilot keys", async () => {
    serve({});
    await mount("/doctor");
    await screen.findByRole("switch", { name: CP.repoLabel });
    await userEvent.keyboard("?");
    const help = await screen.findByRole("dialog");
    expect(within(help).queryByText(CP.help[0][1])).toBeNull();
  });
});
