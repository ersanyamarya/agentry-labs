// The small rounded labels: scope, state, severity. Colours are the design file's meaning colours.
import { Badge } from "./ui/badge.js";

export type Tone = "on" | "project" | "error" | "muted";

const TONES: Record<Tone, string> = {
  on: "bg-on-bg text-on",
  project: "bg-project-bg text-project",
  error: "bg-error-bg text-error",
  muted: "bg-muted text-muted-text",
};

export const Pill = ({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) => (
  <Badge
    className={`rounded-full border-0 font-medium ${TONES[tone]}`}
    variant="outline"
  >
    {children}
  </Badge>
);

// State words used across MCP, hooks and plugins.
export const stateTone = (state: string): Tone => {
  if (["active", "on"].includes(state)) {
    return "on";
  }
  if (
    ["pending-approval", "shadowed", "not-here", "untrusted"].includes(state)
  ) {
    return "project";
  }
  return ["rejected", "broken", "not-installed"].includes(state)
    ? "error"
    : "muted";
};
