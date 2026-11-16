// The keys, as in the terminal UI's help. Opened with `?` or the footer button.

import { messages } from "@agentry/core/messages";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js";
import { Kbd } from "./ui/kbd.js";

const m = messages();
const { help: t, sidebar } = m.web;

// The four screens that list Claude user items Copilot can get.
const COPILOT_SCREENS = new Set(["skills", "mcp", "agents", "rules"]);

// The keys for one screen (its own, then the ones every screen shares); `screen` is the route name ("skills", "doctor").
// `copilot` adds the share and repo keys on the four screens that have them.
export const keysFor = (
  screen: string | undefined,
  copilot = false
): [string, string][] => [
  ...(screen ? (t.screens[screen] ?? []) : []),
  ...(copilot && screen && COPILOT_SCREENS.has(screen) ? m.copilot.help : []),
  ...t.shared,
];

export const HelpDialog = ({
  open,
  onOpenChange,
  screen,
  copilot = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screen?: string;
  copilot?: boolean;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t.title}</DialogTitle>
        <DialogDescription>
          {t.description}
          {screen && screen in sidebar.sections
            ? ` ${t.forScreen(sidebar.sections[screen as keyof typeof sidebar.sections])}`
            : ""}
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[5rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
        {keysFor(screen, copilot).map(([key, what]) => (
          <div className="contents" key={`${key}-${what}`}>
            <dt>
              <Kbd>{key}</Kbd>
            </dt>
            <dd className="text-body">{what}</dd>
          </div>
        ))}
      </dl>
    </DialogContent>
  </Dialog>
);
