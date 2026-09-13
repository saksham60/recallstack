import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Next.js resolves server-only itself. Use its empty server shim in Node tests.
  tsconfig: "./e2e/tsconfig.state.json",
  testMatch: [
    "**/dsa-reasonai-provider.spec.ts",
    "**/reasonai-provider.spec.ts",
    "**/reasonai-state.spec.ts",
    "**/system-design-state.spec.ts",
    "**/system-design-model.spec.ts",
    "**/system-design-export.spec.ts",
    "**/diagram-engine.spec.ts",
  ],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
});
