import { defineConfig, devices } from "@playwright/test";

// These values must also be used by the production build. Nothing contacts a
// deployed auth service or enables the development-only auth bypass.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:4160";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dsa-navigation-fixture-anon-key";
process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["dsa-navigation*.spec.ts", "dsa-pagination.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/dsa-navigation-results.json" }]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    // Measure before functional tests warm the server's public taxonomy cache.
    { name: "measure", testMatch: "dsa-navigation-performance.spec.ts", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium", testIgnore: "dsa-navigation-performance.spec.ts", dependencies: ["measure"], use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    { command: "node scripts/e2e-dsa-catalog.mjs", url: "http://127.0.0.1:4160/health" },
    {
      command: "node node_modules/next/dist/bin/next start --port 3100",
      url: "http://localhost:3100/login",
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
        DSA_API_BASE_URL: "http://127.0.0.1:4160",
        E2E_BYPASS_AUTH: "0",
        DEMO_ACCESS_ENABLED: "0",
      },
    },
  ],
});
