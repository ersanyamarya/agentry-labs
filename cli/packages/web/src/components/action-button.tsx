import type { ReactNode } from "react";
import { Button } from "./ui/button.js";
import { Kbd } from "./ui/kbd.js";

// A details-panel button, with the key that does the same thing shown as a chip. `danger` is for removals.
export const ActionButton = ({
  children,
  danger,
  keyHint,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  keyHint?: string;
  onClick: () => void;
}) => (
  <Button
    className={`h-11 flex-1 ${danger ? "border-error-border text-error hover:text-error" : ""}`}
    onClick={onClick}
    variant="outline"
  >
    {children}
    {keyHint ? (
      <Kbd className={danger ? "text-error" : undefined}>{keyHint}</Kbd>
    ) : null}
  </Button>
);
