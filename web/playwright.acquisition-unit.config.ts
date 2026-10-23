import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", outputDir: "test-results/acquisition-unit", tsconfig: "./e2e/tsconfig.state.json", testMatch: "**/acquisition-unit.spec.ts", workers: 1, retries: 0, reporter: "line" });
