// The keys, as in the terminal UI's help. Opened with `?` or the footer button.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js";
import { Kbd } from "./ui/kbd.js";

export const KEYS: [string, string][] = [
  ["↑ ↓", "move between rows"],
  [
    "space",
    "turn the selected row on or off, in the scope chosen in the sidebar",
  ],
  ["s", "move a skill onto the shelf"],
  ["x", "remove the selected row (a copy is kept in the backups)"],
  ["/", "search the rows"],
  ["?", "this help"],
];

export const HelpDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          The same keys as the terminal UI. They are text while you type in a
          field.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[5rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
        {KEYS.map(([key, what]) => (
          <div className="contents" key={key}>
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
