import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Exercise the DSA workspace without compiling the unrelated marketing route
// merely to determine dev-server readiness.
export default defineConfig({
  ...base,
  testMatch: [
    "**/dsa-results-studio.spec.ts",
    "**/dsa-report-browser.spec.ts",
    "**/dsa-execution-browser.spec.ts",
    "**/dsa-workspace.spec.ts",
    "**/dsa-navigation.spec.ts",
    "**/dsa-python-real.spec.ts",
  ],
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map(
    (server) => ({
      ...server,
      ...(server.url === "http://localhost:3000"
        ? { url: "http://localhost:3000/login" }
        : {}),
    }),
  ),
});
