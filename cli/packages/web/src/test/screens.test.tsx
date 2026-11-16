// The other seven screens, against a fake client: what each lists, and that every write shows its preview first and only
// calls the apply procedure after Apply.

import { messages } from "@agentry/core/messages";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentsScreen } from "../components/agents-screen.js";
import { BackupsScreen } from "../components/backups-screen.js";
import { CatalogScreen } from "../components/catalog-screen.js";
import { DoctorScreen } from "../components/doctor-screen.js";
import { HooksScreen } from "../components/hooks-screen.js";
import { McpScreen } from "../components/mcp-screen.js";
import { PluginsScreen } from "../components/plugins-screen.js";
import { RulesScreen } from "../components/rules-screen.js";
import { ScopeProvider } from "../lib/scope.js";
import { loadFixture } from "./fixtures.js";
import { mockClient } from "./mock-orpc.js";

vi.mock("../lib/orpc.js", async () =>
  (await import("./mock-orpc.js")).mockOrpc()
);
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  }),
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const mount = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ScopeProvider>{ui}</ScopeProvider>
    </QueryClientProvider>
  );
const inTable = () => within(screen.getByRole("table"));
const dialog = () => screen.findByRole("dialog");

describe("MCP", () => {
  test("lists servers; turning one off previews, then applies only after Apply", async () => {
    mount(<McpScreen />);
    await inTable().findByText("demo");
    await userEvent.click(
      screen.getByRole("switch", { name: "Turn demo off" })
    );
    const box = await dialog();
    expect(await within(box).findByText("Would change a file")).toBeTruthy();
    expect(mockClient.mcp.previewMcp).toHaveBeenCalledWith({
      dir: "/work/app",
      name: "demo",
      enable: false,
    });
    expect(mockClient.mcp.applyMcp).not.toHaveBeenCalled();
    await userEvent.click(within(box).getByRole("button", { name: /Apply/ }));
    await waitFor(() => expect(mockClient.mcp.applyMcp).toHaveBeenCalled());
  });

  test("env values arrive masked and project servers cannot be switched here", async () => {
    mount(<McpScreen />);
    await inTable().findByText("demo");
    expect(screen.getByText(/API_KEY=<masked>/)).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: /projsrv/ }).hasAttribute("disabled")
    ).toBe(true);
  });

  test("remove previews first", async () => {
    mount(<McpScreen />);
    await inTable().findByText("demo");
    await userEvent.keyboard("x");
    await dialog();
    expect(mockClient.mcp.previewMcpRemove).toHaveBeenCalled();
    expect(mockClient.mcp.applyMcpRemove).not.toHaveBeenCalled();
  });

  test("Add server previews the typed server", async () => {
    mount(<McpScreen />);
    await inTable().findByText("demo");
    await userEvent.click(screen.getByRole("button", { name: /Add server/ }));
    await userEvent.type(screen.getByLabelText("Name"), "new-one");
    await userEvent.type(screen.getByLabelText("Command"), "npx");
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(mockClient.mcp.previewMcpAdd).toHaveBeenCalled()
    );
    expect(mockClient.mcp.applyMcpAdd).not.toHaveBeenCalled();
  });
});

describe("Hooks", () => {
  test("lists hooks by event; turning one off previews; plugin hooks are read-only", async () => {
    mount(<HooksScreen />);
    await inTable().findByText(/PreToolUse/);
    expect(
      screen.getByRole("switch", { name: /Stop/ }).hasAttribute("disabled")
    ).toBe(true);
    await userEvent.click(screen.getByRole("switch", { name: /PreToolUse/ }));
    await dialog();
    expect(mockClient.hooks.previewHook).toHaveBeenCalledWith({
      dir: "/work/app",
      selector: "abcd1234ef",
      action: "disable",
      scope: "user",
    });
    expect(mockClient.hooks.applyHook).not.toHaveBeenCalled();
  });
});

describe("Plugins", () => {
  test("turning a plugin off previews and shows the new-sessions note", async () => {
    mount(<PluginsScreen />);
    await inTable().findByText("demo");
    await userEvent.click(
      screen.getByRole("switch", { name: "Turn demo@mkt off" })
    );
    const box = await dialog();
    expect(within(box).getByText(/apply to new sessions/)).toBeTruthy();
    expect(mockClient.plugins.previewPlugin).toHaveBeenCalledWith({
      dir: "/work/app",
      id: "demo@mkt",
      enable: false,
    });
    expect(mockClient.plugins.applyPlugin).not.toHaveBeenCalled();
  });

  test("install previews name@marketplace", async () => {
    mount(<PluginsScreen />);
    await inTable().findByText("demo");
    await userEvent.click(
      screen.getByRole("button", { name: /Install plugin/ })
    );
    await userEvent.type(screen.getByLabelText("Plugin"), "tool@market");
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(mockClient.plugins.previewPluginInstall).toHaveBeenCalledWith({
        dir: "/work/app",
        action: "install",
        name: "tool@market",
      })
    );
  });
});

describe("Plugins keys", () => {
  test("a opens the install dialog; the retired i only says to press a", async () => {
    mount(<PluginsScreen />);
    await inTable().findByText("demo");
    await userEvent.keyboard("i");
    expect(toast.message).toHaveBeenCalledWith(
      "Installing a plugin now uses a: press a to install one."
    );
    expect(screen.queryByLabelText("Plugin")).toBeNull();
    await userEvent.keyboard("a");
    expect(await screen.findByLabelText("Plugin")).toBeTruthy();
  });
});

describe("Agents", () => {
  test("lists agents by scope with model and details, and offers no write", async () => {
    mount(<AgentsScreen />);
    await inTable().findByText("reviewer");
    expect(inTable().getByText("sonnet")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: /This project/ }));
    expect(inTable().queryByText("reviewer")).toBeNull();
    expect(inTable().getByText("helper")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: /All projects/ }));
    await userEvent.click(inTable().getByText("reviewer"));
    expect(await screen.findByText("Read, Grep")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });
});

describe("Rules", () => {
  test("lists files by scope; remove uses the dry run as its preview, then removes with a backup", async () => {
    mount(<RulesScreen />);
    await inTable().findByText("commit-attribution");
    await userEvent.click(screen.getByRole("radio", { name: /This project/ }));
    expect(inTable().queryByText("commit-attribution")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /All projects/ }));
    await userEvent.click(inTable().getByText("commit-attribution"));
    await userEvent.keyboard("x");
    const box = await dialog();
    await within(box).findByText(/Remove commit-attribution/);
    expect(mockClient.rules.removeRule).toHaveBeenCalledWith({
      dir: "/work/app",
      target: "r1",
      backup: true,
      dryRun: true,
    });
    await userEvent.click(within(box).getByRole("button", { name: /Apply/ }));
    await waitFor(() =>
      expect(mockClient.rules.removeRule).toHaveBeenCalledWith({
        dir: "/work/app",
        target: "r1",
        backup: true,
      })
    );
  });
});

describe("Rules delete", () => {
  test("X deletes with no copy: backup false in the dry run", async () => {
    mount(<RulesScreen />);
    await inTable().findByText("commit-attribution");
    await userEvent.click(screen.getByRole("radio", { name: /This project/ }));
    await userEvent.click(screen.getByRole("radio", { name: /All projects/ }));
    await userEvent.click(inTable().getByText("commit-attribution"));
    await userEvent.keyboard("X");
    await dialog();
    expect(mockClient.rules.removeRule).toHaveBeenCalledWith({
      dir: "/work/app",
      target: "r1",
      backup: false,
      dryRun: true,
    });
  });
});

describe("Copilot column", () => {
  test.each([
    ["MCP", <McpScreen key="m" />, "demo"],
    ["Agents", <AgentsScreen key="a" />, "reviewer"],
    ["Rules", <RulesScreen key="r" />, "context7"],
  ])(
    "%s has no Copilot column or checkbox while load carries no Copilot",
    async (_name, ui, row) => {
      mount(ui);
      await inTable().findByText(row);
      expect(screen.queryByText(messages().copilot.column)).toBeNull();
      expect(
        screen.queryAllByRole("checkbox", { name: /with Copilot/ })
      ).toEqual([]);
    }
  );
});

describe("Backups", () => {
  test("X previews deleting the selected backup; the retired x only says to press X", async () => {
    mount(<BackupsScreen />);
    await inTable().findByText("notes (global)");
    await userEvent.click(inTable().getByText("notes (global)"));
    await userEvent.keyboard("x");
    expect(toast.message).toHaveBeenCalledWith(
      "Deleting a backup now uses X: press X to delete this backup."
    );
    expect(mockClient.backups.pruneBackups).not.toHaveBeenCalled();
    await userEvent.keyboard("X");
    await dialog();
    expect(mockClient.backups.pruneBackups).toHaveBeenCalledWith({
      dir: "/work/app",
      ids: ["b1"],
      dryRun: true,
    });
  });

  test("shows age and size; restore previews with a dry run; fix backups point to Doctor", async () => {
    mount(<BackupsScreen />);
    await inTable().findByText("notes (global)");
    expect(inTable().getByText("12 days")).toBeTruthy();
    expect(inTable().getByText("2.0 KB")).toBeTruthy();
    await userEvent.click(inTable().getByText("notes (global)"));
    await userEvent.keyboard("u");
    await dialog();
    expect(mockClient.backups.restoreBackup).toHaveBeenCalledWith({
      dir: "/work/app",
      id: "b1",
      dryRun: true,
    });
  });

  test("d previews deleting backups 30+ days old and confirms before pruning", async () => {
    mount(<BackupsScreen />);
    await inTable().findByText("notes (global)");
    await userEvent.keyboard("d");
    const box = await dialog();
    await within(box).findByText(/Delete backups 30\+ days old/);
    expect(mockClient.backups.pruneBackups).toHaveBeenCalledWith({
      dir: "/work/app",
      olderThan: 30,
      dryRun: true,
    });
    await userEvent.click(within(box).getByRole("button", { name: /Apply/ }));
    await waitFor(() =>
      expect(mockClient.backups.pruneBackups).toHaveBeenCalledWith({
        dir: "/work/app",
        olderThan: 30,
      })
    );
  });
});

describe("Doctor", () => {
  test("shows the counts and a card-less list of findings; Fix it previews first", async () => {
    mount(<DoctorScreen />);
    await screen.findByText("Hook script is missing");
    expect(screen.getByText("Errors").nextSibling?.textContent).toBe("2");
    expect(screen.getByText("Warnings").nextSibling?.textContent).toBe("1");
    const fixes = screen.getAllByRole("button", { name: "Fix it" });
    expect(fixes[2].hasAttribute("disabled")).toBe(true); // the warning has no automatic fix
    await userEvent.click(fixes[0]);
    await dialog();
    expect(mockClient.doctor.previewFix).toHaveBeenCalled();
    expect(mockClient.doctor.applyFix).not.toHaveBeenCalled();
  });

  test("u previews the undo", async () => {
    mount(<DoctorScreen />);
    await screen.findByText("Hook script is missing");
    await userEvent.keyboard("u");
    await dialog();
    expect(mockClient.doctor.previewUndo).toHaveBeenCalledWith({
      dir: "/work/app",
    });
  });

  test("Undo last fix previews the undo", async () => {
    mount(<DoctorScreen />);
    await screen.findByText("Hook script is missing");
    await userEvent.click(
      screen.getByRole("button", { name: /Undo last fix/ })
    );
    await dialog();
    expect(mockClient.doctor.previewUndo).toHaveBeenCalledWith({
      dir: "/work/app",
    });
  });
});

describe("Catalog", () => {
  test("filters by bundle; Install previews with a dry run; Added is disabled", async () => {
    mount(<CatalogScreen />);
    await screen.findByText("write-linkedin-post");
    await userEvent.click(screen.getByRole("radio", { name: "web" }));
    expect(screen.queryByText("write-linkedin-post")).toBeNull();
    expect(screen.getByText(/Added in shelf/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Added" }).hasAttribute("disabled")
    ).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "All" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await dialog();
    expect(mockClient.catalog.addFromCatalog).toHaveBeenCalledWith({
      dir: "/work/app",
      names: ["skill/write-linkedin-post"],
      dryRun: true,
    });
  });

  test("a adds the first item (a skill) straight away, with no where-to-put choice", async () => {
    mount(<CatalogScreen />);
    await screen.findByText("write-linkedin-post");
    await userEvent.keyboard("a");
    await dialog();
    expect(mockClient.catalog.addFromCatalog).toHaveBeenCalledWith({
      dir: "/work/app",
      names: ["skill/write-linkedin-post"],
      dryRun: true,
    });
  });

  test("an agent asks where it goes: this project previews with project true", async () => {
    const fixture = loadFixture();
    mockClient.load.mockResolvedValueOnce({
      ...fixture,
      catalog: {
        ...fixture.catalog,
        entries: [
          ...fixture.catalog.entries,
          {
            id: "agent/scout",
            bundle: "general",
            description: "Scouts the repo.",
            kind: "agent",
            name: "scout",
            installs: [],
            outdated: false,
            tokens: null,
          },
        ],
      },
    });
    mount(<CatalogScreen />);
    await screen.findByText("scout");
    const card = screen.getByText("scout").closest("li") as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: "Add" }));
    const choice = await dialog();
    expect(mockClient.catalog.addFromCatalog).not.toHaveBeenCalled();
    expect(
      within(choice).getByRole("button", { name: "Add to all projects" })
    ).toBeTruthy();
    await userEvent.click(
      within(choice).getByRole("button", { name: "Add to this project" })
    );
    await waitFor(() =>
      expect(mockClient.catalog.addFromCatalog).toHaveBeenCalledWith({
        dir: "/work/app",
        names: ["agent/scout"],
        project: true,
        dryRun: true,
      })
    );
  });

  test("the retired i only says to press a", async () => {
    mount(<CatalogScreen />);
    await screen.findByText("write-linkedin-post");
    await userEvent.keyboard("i");
    expect(toast.message).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("an outdated entry says Update and previews an update", async () => {
    mount(<CatalogScreen />);
    await screen.findByText("super-planner");
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    await dialog();
    expect(mockClient.catalog.updateFromCatalog).toHaveBeenCalledWith({
      dir: "/work/app",
      names: ["agent/super-planner"],
      dryRun: true,
    });
  });
});
