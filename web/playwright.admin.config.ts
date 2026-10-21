import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Local fixture authentication only. Production has no bypass.
export default defineConfig({
  ...base,
  testMatch: ["**/admin.spec.ts"],
  workers: 1,
  timeout: 60_000,
  reporter: "line",
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map((server) => ({
    ...server,
    ...(server.url === "http://localhost:3000" ? {
      command: "npm run dev -- --webpack", url: "http://localhost:3000/login", timeout: 180_000,
    } : {}),
  })),
});
