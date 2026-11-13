// Keyboard shortcuts that match the terminal UI: `/` focuses search, `?` opens help, `tab` moves between the sidebar and
// the list. Keys typed into a field stay text, so a shortcut never fires while the user is typing.
import { useEffect } from "react";

// Shortcuts are named in lower case ("down", "space"); everything else is the key itself ("/", "?", "s").
const KEY_NAMES: Record<string, string> = {
  ArrowDown: "down",
  ArrowUp: "up",
  " ": "space",
};

export interface Shortcuts {
  [key: string]: (event: KeyboardEvent) => void;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

export const useShortcuts = (shortcuts: Shortcuts, enabled = true) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const handler = shortcuts[KEY_NAMES[event.key] ?? event.key];
      if (!handler) {
        return;
      }
      if (isTyping(event.target) && event.key !== "Escape") {
        return;
      }
      handler(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, enabled]);
};
