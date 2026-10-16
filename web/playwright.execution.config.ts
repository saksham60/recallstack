import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
export default defineConfig({
  testDir: "./e2e",
  tsconfig: "./e2e/tsconfig.state.json",
  testMatch: [
    "**/dsa-v3-live-component.spec.ts",
    "**/dsa-certification-unit.spec.ts",
    "**/dsa-report-unit.spec.ts",
    "**/dsa-python-contract-unit.spec.ts",
    "**/dsa-execution-unit.spec.ts",
    "**/dsa-execution-live.spec.ts",
    "**/dsa-execution-integration.spec.ts",
  ],
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "line",
});
