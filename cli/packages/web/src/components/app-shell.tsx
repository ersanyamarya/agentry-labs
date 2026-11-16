// The page frame: sidebar on the left, the section on the right using the whole width (no containers, no max width).

import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useShortcuts } from "../hooks/use-shortcuts.js";
import { useAppData } from "../lib/app-data.js";
import { copilotOf } from "../lib/copilot.js";
import { ScopeProvider } from "../lib/scope.js";
import { AppSidebar } from "./app-sidebar.js";
import { HelpDialog } from "./help-dialog.js";
import { SidebarInset, SidebarProvider } from "./ui/sidebar.js";
import { Toaster } from "./ui/sonner.js";
import { TooltipProvider } from "./ui/tooltip.js";

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { data, version } = useAppData();
  const [help, setHelp] = useState(false);
  const screen = useRouterState({
    select: (state) => state.location.pathname.split("/")[1],
  });
  useShortcuts({ "?": () => setHelp(true) });
  return (
    <ScopeProvider>
      <TooltipProvider>
        <SidebarProvider
          style={{ "--sidebar-width": "15rem" } as React.CSSProperties}
        >
          <AppSidebar
            data={data}
            onHelp={() => setHelp(true)}
            version={version}
          />
          <SidebarInset className="min-w-0">{children}</SidebarInset>
        </SidebarProvider>
        <HelpDialog
          copilot={copilotOf(data) !== undefined}
          onOpenChange={setHelp}
          open={help}
          screen={screen}
        />
        <Toaster />
      </TooltipProvider>
    </ScopeProvider>
  );
};
