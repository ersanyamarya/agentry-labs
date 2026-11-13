// jsdom lacks matchMedia and ResizeObserver, which the sidebar and the details panel use. `desktop` controls whether the
// (min-width) queries match, so a test can ask for the wide or the narrow layout.
import { afterEach, vi } from "vitest";

export const viewport = { wide: true };

const matchMedia = (query: string): MediaQueryList => ({
  matches: query.includes("min-width") ? viewport.wide : false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
});

// The node-environment tests (server, router) have no window; only the jsdom ones need these.
if (typeof window !== "undefined") {
  vi.stubGlobal("matchMedia", matchMedia);
  window.matchMedia = matchMedia;
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(function observer() {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    })
  );
}

afterEach(() => {
  viewport.wide = true;
});
