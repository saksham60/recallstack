import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: './e2e',
  testIgnore: [
    '**/system-design-disabled.spec.ts',
    '**/system-design-model.spec.ts',
    '**/system-design-state.spec.ts',
    '**/system-design-export.spec.ts',
    '**/diagram-engine.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === '1',
    timeout: 120 * 1000,
    env: {
      E2E_BYPASS_AUTH: '1',
      SYSTEM_DESIGN_ENABLED: '1',
    },
  },
});
