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

const t = messages().web.help;

export const KEYS: [string, string][] = t.keys;

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
        <DialogTitle>{t.title}</DialogTitle>
        <DialogDescription>{t.description}</DialogDescription>
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
