// Preview, then apply: every write that has a preview in core shows its text here and waits for a yes, like the terminal
// UI's `Apply?  y yes   n no`. Nothing is written until Apply. `y` and `n` work as keys while the dialog is open.

import { useState } from "react";
import { toast } from "sonner";
import { useShortcuts } from "../hooks/use-shortcuts.js";
import { useReload } from "../lib/app-data.js";
import { Button } from "./ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js";
import { Kbd } from "./ui/kbd.js";

export interface Flow {
  apply: () => Promise<{ ok: boolean; text: string }>;
  applyLabel?: string;
  note?: string;
  preview: () => Promise<{ appliable: boolean; text: string }>;
  title: string;
}

interface Shown {
  appliable: boolean;
  text: string;
}

const firstLine = (text: string, fallback: string) =>
  text.split("\n").find((line) => line.trim() !== "") ?? fallback;

export const usePreviewFlow = () => {
  const reload = useReload();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const start = (next: Flow) => {
    setFlow(next);
    setShown(null);
    setError(null);
    next.preview().then(setShown, (cause: Error) => setError(cause.message));
  };
  const close = () => {
    setFlow(null);
    setApplying(false);
  };
  const apply = async () => {
    if (!(flow && shown?.appliable) || applying) {
      return;
    }
    setApplying(true);
    try {
      const result = await flow.apply();
      (result.ok ? toast.success : toast.error)(
        firstLine(result.text, result.ok ? "Done." : "Failed.")
      );
      await reload();
      close();
    } catch (cause) {
      setError((cause as Error).message);
      setApplying(false);
    }
  };

  useShortcuts({ y: apply, n: close }, flow !== null);

  const dialog = (
    <Dialog onOpenChange={(open) => !open && close()} open={flow !== null}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{flow?.title} (preview)</DialogTitle>
          <DialogDescription>
            Nothing is written until you apply.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-error text-sm">{error}</p>
        ) : (
          <pre className="bg-muted text-body max-h-[50vh] overflow-auto rounded-md p-3 font-mono text-xs break-words whitespace-pre-wrap">
            {shown ? shown.text : "Loading the preview..."}
          </pre>
        )}
        {flow?.note ? (
          <p className="text-muted-text text-xs">{flow.note}</p>
        ) : null}
        <DialogFooter>
          <Button className="h-11" onClick={close} variant="outline">
            Cancel <Kbd>n</Kbd>
          </Button>
          <Button
            className="h-11"
            disabled={!shown?.appliable || applying}
            onClick={apply}
          >
            {flow?.applyLabel ?? "Apply"}{" "}
            <Kbd className="text-foreground">y</Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { start, dialog };
};
