import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
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
