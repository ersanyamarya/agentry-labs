import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["src/test/helpers/build.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    projects: [
      { test: { name: "cli", include: ["src/test/**/*.test.ts"] } },
      {
        test: {
          name: "core",
          root: "packages/core",
          include: ["src/test/**/*.test.ts"],
        },
      },
      "packages/web",
      {
        test: {
          name: "tui",
          root: "packages/tui",
          include: ["src/test/**/*.test.ts"],
        },
      },
    ],
  },
});
