import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    globalSetup: ["src/test/helpers/build.ts"],
    // Many tests spawn the CLI or drive the TUI in a pseudo-terminal; give them room under load.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
