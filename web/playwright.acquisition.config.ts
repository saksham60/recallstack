import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/acquisition.spec.ts",
  outputDir: "test-results/acquisition",
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 180000,
  expect: { timeout: 20000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: [
    { command: "uv run python scripts/e2e_telemetry_backend.py", cwd: "../backend", url: "http://127.0.0.1:4170/test-health", timeout: 120000, reuseExistingServer: false },
    { command: "npm run dev -- --webpack", url: "http://localhost:3000/login", timeout: 180000, reuseExistingServer: false,
      env: {
        E2E_BYPASS_AUTH: "1", DEMO_ACCESS_ENABLED: "0",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4170",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4170",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "loopback-fixture-public-key",
        NEXT_PUBLIC_PRODUCT_TELEMETRY_ENABLED: "true",
      },
    },
  ],
});
