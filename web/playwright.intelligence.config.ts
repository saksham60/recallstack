import { defineConfig } from "@playwright/test";
import base from "./playwright.admin.config";

export default defineConfig({
  ...base,
  testMatch: ["**/product-intelligence.spec.ts", "**/admin.spec.ts"],
  testIgnore: [],
  expect: { timeout: 30000 },
  timeout: 90000,
  webServer: [
    ...(Array.isArray(base.webServer) ? base.webServer : []).map((server) => ({
      ...server,
      ...(server.url === "http://localhost:3000/login"
        ? {
            env: {
              ...server.env,
              NEXT_PUBLIC_PRODUCT_TELEMETRY_ENABLED: "true",
            },
          }
        : {}),
    })),
    {
      command: "uv run python scripts/e2e_telemetry_backend.py",
      cwd: "../backend",
      url: "http://127.0.0.1:4170/test-health",
      timeout: 120000,
      reuseExistingServer: false,
    },
  ],
});
