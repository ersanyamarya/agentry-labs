import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SkillsScreen } from "../components/skills-screen.js";
import { ScopeProvider } from "../lib/scope.js";
import { skillRows } from "../lib/skill-rows.js";
import { loadFixture } from "./fixtures.js";
import { mockClient } from "./mock-orpc.js";
import { viewport } from "./setup.js";

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

// The selected skill is also named in the details column, so look for rows inside the table.
const inTable = () => within(screen.getByRole("table"));

const mount = async () => {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ScopeProvider>
        <SkillsScreen />
      </ScopeProvider>
    </QueryClientProvider>
  );
  await inTable().findByText("audit-two");
};

describe("skill rows", () => {
  test("shelf skills come from the groups, installed ones from status, and a shelf link is not listed twice", () => {
    const rows = skillRows(loadFixture());
    expect(rows.map((row) => `${row.kind}:${row.name}`)).toEqual([
      "shelf:audit-one",
      "shelf:audit-two",
      "global:run-fallow",
      "project:proj-only",
    ]);
  });
});

describe("the Skills screen", () => {
  test("lists every skill with its scope, and the summary counts them", async () => {
    await mount();
    expect(inTable().getByText("run-fallow")).toBeTruthy();
    expect(inTable().getByText("proj-only")).toBeTruthy();
    expect(
      screen.getByText("4 skills · 3 loaded · 1 in the library")
    ).toBeTruthy();
  });

  test("the Library filter keeps only skills that are not loaded anywhere; search narrows by name", async () => {
    await mount();
    await userEvent.click(screen.getByRole("radio", { name: /Library/ }));
    expect(inTable().queryByText("run-fallow")).toBeNull();
    expect(inTable().getByText("audit-two")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: /All/ }));
    await userEvent.type(screen.getByLabelText("Search skills"), "fallow");
    expect(inTable().getByText("run-fallow")).toBeTruthy();
    expect(inTable().queryByText("audit-two")).toBeNull();
  });

  test("a shelf switch calls toggleShelf for this project, and for global after switching scope", async () => {
    await mount();
    await userEvent.click(
      screen.getByRole("switch", { name: "Load audit-two" })
    );
    await waitFor(() =>
      expect(mockClient.skills.toggleShelf).toHaveBeenCalledWith(
        {
          dir: "/work/app",
          target: "audit/audit-two",
          on: true,
          global: false,
        },
        expect.anything()
      )
    );
  });

  test("shelf groups show as chips: one filters the list, its switch turns the whole group on", async () => {
    await mount();
    await userEvent.click(screen.getByRole("button", { name: /^audit 2/ }));
    expect(inTable().queryByText("run-fallow")).toBeNull();
    expect(inTable().getByText("audit-one")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("switch", { name: "Load bundle audit" })
    );
    await waitFor(() =>
      expect(mockClient.skills.toggleShelf).toHaveBeenCalledWith({
        dir: "/work/app",
        target: "audit",
        on: true,
        global: false,
      })
    );
  });

  test("ticking rows shows a bulk bar; Turn on calls toggleShelf once per ticked shelf skill", async () => {
    await mount();
    await userEvent.click(screen.getByLabelText("Select all shown"));
    expect(screen.getByText("4 selected")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() =>
      expect(mockClient.skills.toggleShelf).toHaveBeenCalledTimes(2)
    );
    expect(mockClient.skills.toggleShelf).toHaveBeenCalledWith({
      dir: "/work/app",
      target: "audit/audit-one",
      on: true,
      global: false,
    });
    await waitFor(() => expect(screen.queryByText("4 selected")).toBeNull());
  });

  test("bulk Remove asks once for all ticked skills, then removes each", async () => {
    await mount();
    await userEvent.click(screen.getByLabelText("Select run-fallow"));
    await userEvent.click(screen.getByLabelText("Select proj-only"));
    const bar = within(screen.getByRole("toolbar", { name: "Bulk actions" }));
    await userEvent.click(bar.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Remove 2 skills?")).toBeTruthy();
    expect(mockClient.skills.removeSkill).not.toHaveBeenCalled();
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Remove",
      })
    );
    await waitFor(() =>
      expect(mockClient.skills.removeSkill).toHaveBeenCalledTimes(2)
    );
  });

  test("an installed skill's switch is disabled: it explains instead of writing", async () => {
    await mount();
    const row = screen.getByRole("switch", { name: /run-fallow/ });
    expect(row.hasAttribute("disabled")).toBe(true);
    expect(mockClient.skills.toggleShelf).not.toHaveBeenCalled();
  });

  test("Remove asks first, names the backup folder, and only then calls removeSkill", async () => {
    await mount();
    await userEvent.click(inTable().getByText("run-fallow"));
    const panel = screen.getByLabelText("Skill details");
    await userEvent.click(
      within(panel).getByRole("button", { name: /Remove/ })
    );
    expect(
      await screen.findByText(
        /A copy is kept under \/home\/me\/\.claude\/backups\/agentry/
      )
    ).toBeTruthy();
    expect(mockClient.skills.removeSkill).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mockClient.skills.removeSkill).toHaveBeenCalledWith(
        {
          dir: "/work/app",
          target: "run-fallow",
          project: false,
          backup: true,
        },
        expect.anything()
      )
    );
  });

  test("keys: x asks to remove the selected skill, space toggles a shelf skill", async () => {
    await mount();
    await userEvent.click(inTable().getByText("audit-two"));
    await userEvent.keyboard(" ");
    await waitFor(() =>
      expect(mockClient.skills.toggleShelf).toHaveBeenCalled()
    );
    await userEvent.keyboard("x");
    expect(await screen.findByText(/Remove audit-two\?/)).toBeTruthy();
  });

  test("below 1100px the details open in a sheet instead of a column", async () => {
    viewport.wide = false;
    await mount();
    expect(screen.queryByLabelText("Skill details")).toBeNull();
    await userEvent.click(inTable().getByText("run-fallow"));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("run-fallow")).toBeTruthy();
  });
});
