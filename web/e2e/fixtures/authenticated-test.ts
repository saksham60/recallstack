import { test as base, expect, type Page } from '@playwright/test';
import { setupAuth } from '../helpers/auth';

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, provide) => {
    await setupAuth(page);
    await provide(page);
  },
});

export { expect };
