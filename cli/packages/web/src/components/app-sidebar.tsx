// The left sidebar (docs/web-ui-design.md "Layout"): brand and version, the scope switcher, three labelled groups with
// counts, a red count on Doctor, and the problems line. The active item has aria-current="page".

import { messages } from "@agentry/core/messages";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArchiveIcon,
  BotIcon,
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
import { useCopilot } from "./copilot.js";
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
import { Switch } from "./ui/switch.js";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.js";

const m = messages();
const t = m.web.sidebar;

interface Section {
  icon: ComponentType<{ className?: string }>;
  key: string;
  name: string;
  to: string;
}

export const SIDEBAR_GROUPS: { label: string; items: Section[] }[] = [
  {
    label: t.groups.library,
    items: [
      {
        key: "skills",
        name: t.sections.skills,
        to: "/skills",
        icon: LayersIcon,
      },
      { key: "mcp", name: t.sections.mcp, to: "/mcp", icon: PlugIcon },
      {
        key: "hooks",
        name: t.sections.hooks,
        to: "/hooks",
        icon: GitBranchIcon,
      },
      {
        key: "plugins",
        name: t.sections.plugins,
        to: "/plugins",
        icon: BoxIcon,
      },
      { key: "rules", name: t.sections.rules, to: "/rules", icon: ListIcon },
      { key: "agents", name: t.sections.agents, to: "/agents", icon: BotIcon },
    ],
  },
  {
    label: t.groups.discover,
    items: [
      {
        key: "catalog",
        name: t.sections.catalog,
        to: "/catalog",
        icon: SearchIcon,
      },
    ],
  },
  {
    label: t.groups.health,
    items: [
      {
        key: "doctor",
        name: t.sections.doctor,
        to: "/doctor",
        icon: ActivityIcon,
      },
      {
        key: "backups",
        name: t.sections.backups,
        to: "/backups",
        icon: ArchiveIcon,
      },
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
  agents: data?.agents.items.length,
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
  const onSkills = pathname === "/" || pathname.startsWith("/skills");
  const copilot = useCopilot();
  const counts = sectionCounts(data);
  const errors = data?.doctor.summary.error ?? 0;
  const problems = errors + (data?.doctor.summary.warning ?? 0);

  return (
    <Sidebar aria-label={t.label}>
      <SidebarHeader className="gap-4 px-3 pt-5">
        <div className="flex items-center gap-2.5 px-2">
          <span aria-hidden="true" className="bg-on size-3 rounded-[3px]" />
          <span className="font-mono text-base font-semibold">agentry</span>
          <span className="text-muted-foreground ml-auto font-mono text-xs">
            {version}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 px-2">
          {onSkills ? (
            <>
              <span className="text-muted-foreground text-xs">{t.scope}</span>
              <ToggleGroup
                aria-label={t.scopeAria}
                className="w-full"
                onValueChange={(value) => value && setScope(value as Scope)}
                type="single"
                value={scope}
                variant="outline"
              >
                <ToggleGroupItem className="h-10 flex-1" value="global">
                  {t.scopeGlobal}
                </ToggleGroupItem>
                <ToggleGroupItem className="h-10 flex-1" value="project">
                  {t.scopeProject}
                </ToggleGroupItem>
              </ToggleGroup>
            </>
          ) : null}
          <span className="text-muted-foreground truncate font-mono text-xs">
            {onSkills && scope === "global"
              ? (data?.paths.configDir ?? "~/.claude")
              : (data?.dir ?? "")}
          </span>
        </div>
        {copilot.state ? (
          <div
            className="flex items-center gap-2 px-2"
            title={m.copilot.trust.explain}
          >
            <span className="flex-1 text-sm">{m.copilot.repoLabel}</span>
            <Switch
              aria-label={m.copilot.repoLabel}
              checked={copilot.state.trusted}
              onCheckedChange={copilot.trust}
            />
          </div>
        ) : null}
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
            {problems > 0 ? m.sidebar.problems(problems) : m.sidebar.noProblems}
          </span>
          <button
            aria-label={t.shortcutsAria}
            className="flex size-11 items-center justify-center rounded-md"
            onClick={onHelp}
            type="button"
          >
            <Kbd>?</Kbd>
          </button>
        </div>
      </SidebarFooter>
      {copilot.dialog}
    </Sidebar>
  );
};
