import { test, expect } from '@playwright/test';

test.describe('Authentication and Route Protection', () => {
  test('redirects unauthenticated user to login', async ({ page }) => {
    // Attempt to access an authenticated route directly
    await page.goto('/dsa');
    
    // Should be redirected to the login page
    await expect(page).toHaveURL(/.*\/login/);
    
    // Check if login page is rendered
    await expect(page.getByRole('heading', { name: 'RecallStack' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });
});
