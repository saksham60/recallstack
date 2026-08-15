import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/system-design-disabled.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-feature-disabled",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer:
      process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1",
    timeout: 120 * 1000,
    env: {
      E2E_BYPASS_AUTH: "1",
      SYSTEM_DESIGN_ADMIN_ENABLED: "0",
    },
  },
});
