import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Next.js resolves server-only itself. Use its empty server shim in Node tests.
  tsconfig: "./e2e/tsconfig.state.json",
  testMatch: [
    "**/demo-auth.spec.ts",
    "**/reasonai-auth.spec.ts",
    "**/dsa-reasonai-provider.spec.ts",
    "**/dsa-reasonai-streaming.spec.ts",
    "**/dsa-reasonai-agent.spec.ts",
    "**/reasonai-provider.spec.ts",
    "**/reasonai-persistence.spec.ts",
    "**/reasonai-conversation-state.spec.ts",
    "**/reasonai-state.spec.ts",
    "**/reasonai-runtime.spec.ts",
    "**/reasonai-transport.spec.ts",
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
