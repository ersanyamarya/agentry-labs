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

const { help: t, sidebar } = messages().web;

// The keys for one screen (its own, then the ones every screen shares); `screen` is the route name ("skills", "doctor").
export const keysFor = (screen: string | undefined): [string, string][] => [
  ...(screen ? (t.screens[screen] ?? []) : []),
  ...t.shared,
];

export const HelpDialog = ({
  open,
  onOpenChange,
  screen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screen?: string;
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
        {keysFor(screen).map(([key, what]) => (
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
