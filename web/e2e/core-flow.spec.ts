import { test, expect } from '@playwright/test';

test.describe('Core Flow', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/');
    
    // Should end up on /login or login prompt
    await expect(page).toHaveURL(/.*\/login/);
  });
});
