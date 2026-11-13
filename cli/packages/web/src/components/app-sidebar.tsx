// The left sidebar (docs/web-ui-design.md "Layout"): brand and version, the scope switcher, three labelled groups with
// counts, a red count on Doctor, and the problems line. The active item has aria-current="page".

import { Link, useRouterState } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArchiveIcon,
  BoxIcon,
  GitBranchIcon,
  LayersIcon,
  ListIcon,
  PlugIcon,
  SearchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import type { LoadData } from "../contract/index.js";
import { type Scope, useScope } from "../lib/scope.js";
import { Kbd } from "./ui/kbd.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar.js";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.js";

interface Section {
  icon: ComponentType<{ className?: string }>;
  key: string;
  name: string;
  to: string;
}

export const SIDEBAR_GROUPS: { label: string; items: Section[] }[] = [
  {
    label: "Library",
    items: [
      { key: "skills", name: "Skills", to: "/skills", icon: LayersIcon },
      { key: "mcp", name: "MCP", to: "/mcp", icon: PlugIcon },
      { key: "hooks", name: "Hooks", to: "/hooks", icon: GitBranchIcon },
      { key: "plugins", name: "Plugins", to: "/plugins", icon: BoxIcon },
      { key: "rules", name: "Rules", to: "/rules", icon: ListIcon },
    ],
  },
  {
    label: "Discover",
    items: [
      { key: "catalog", name: "Catalog", to: "/catalog", icon: SearchIcon },
    ],
  },
  {
    label: "Health",
    items: [
      { key: "doctor", name: "Doctor", to: "/doctor", icon: ActivityIcon },
      { key: "backups", name: "Backups", to: "/backups", icon: ArchiveIcon },
    ],
  },
];

// Section counts, as the terminal UI shows them. Catalog counts only once it has been fetched.
export const sectionCounts = (
  data?: LoadData
): Record<string, number | undefined> => ({
  skills: data?.status.skills.items.length,
  mcp: data?.status.mcp.servers.length,
  hooks: data?.status.hooks.items.length,
  plugins: data?.status.plugins.items.length,
  rules: data?.rules.items.length,
  catalog: data?.catalog.fetched ? data.catalog.entries.length : undefined,
  doctor: data?.doctor.findings.length,
  backups: data?.backups.items.length,
});

export const AppSidebar = ({
  data,
  version,
  onHelp,
}: {
  data?: LoadData;
  version?: string;
  onHelp: () => void;
}) => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { scope, setScope } = useScope();
  const counts = sectionCounts(data);
  const errors = data?.doctor.summary.error ?? 0;
  const problems = errors + (data?.doctor.summary.warning ?? 0);

  return (
    <Sidebar aria-label="Sections">
      <SidebarHeader className="gap-4 px-3 pt-5">
        <div className="flex items-center gap-2.5 px-2">
          <span aria-hidden="true" className="bg-on size-3 rounded-[3px]" />
          <span className="font-mono text-base font-semibold">agentry</span>
          <span className="text-muted-foreground ml-auto font-mono text-xs">
            {version}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 px-2">
          <span className="text-muted-foreground text-xs">Scope</span>
          <ToggleGroup
            aria-label="Scope for toggles"
            className="w-full"
            onValueChange={(value) => value && setScope(value as Scope)}
            type="single"
            value={scope}
            variant="outline"
          >
            <ToggleGroupItem className="h-10 flex-1" value="global">
              Global
            </ToggleGroupItem>
            <ToggleGroupItem className="h-10 flex-1" value="project">
              This project
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="text-muted-foreground truncate font-mono text-xs">
            {scope === "global"
              ? (data?.paths.configDir ?? "~/.claude")
              : (data?.dir ?? "")}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-1">
        {SIDEBAR_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] tracking-[0.08em] uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = pathname === item.to;
                  const count = counts[item.key];
                  const red = item.key === "doctor" && errors > 0;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        asChild
                        className="h-10"
                        isActive={active}
                      >
                        <Link
                          aria-current={active ? "page" : undefined}
                          to={item.to}
                        >
                          <item.icon className="size-4" />
                          <span>{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count === undefined ? null : (
                        <SidebarMenuBadge
                          className={
                            red
                              ? "bg-error-bg text-error rounded-full px-1.5"
                              : "text-muted-foreground font-mono"
                          }
                        >
                          {String(red ? errors : count)}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="px-3 pb-5">
        <div className="text-muted-foreground flex items-center gap-2 px-2 text-sm">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${problems > 0 ? (errors > 0 ? "bg-error" : "bg-project") : "bg-on"}`}
          />
          <span className="flex-1">
            {problems > 0
              ? `${problems} problem${problems === 1 ? "" : "s"}`
              : "no problems"}
          </span>
          <button
            aria-label="Keyboard shortcuts"
            className="flex size-11 items-center justify-center rounded-md"
            onClick={onHelp}
            type="button"
          >
            <Kbd>?</Kbd>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
