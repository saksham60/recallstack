import { test, expect } from '@playwright/test';
import { setupAuth } from './helpers/auth';

test.describe('Authentication and Route Protection', () => {
  test.describe('Unauthenticated User', () => {
    const protectedRoutes = ['/dsa', '/bookmarks', '/revise', '/profile', '/content/test'];

    for (const route of protectedRoutes) {
      test(`redirects ${route} to login`, async ({ page }) => {
        await page.goto(route);
        await expect(page).toHaveURL(/.*\/login/);
      });
    }
  });

  test.describe('Authenticated User', () => {
    test('redirects from login to /dsa', async ({ page }) => {
      await setupAuth(page);
      await page.goto('/login');
      // Should redirect to /dsa since user is authenticated
      await expect(page).toHaveURL(/.*\/dsa/);
    });
  });

  test.describe('OAuth Callback', () => {
    test('handles failed code exchange and redirects to login with error', async ({ page }) => {
      // Missing auth mock means exchange fails
      await page.goto('/auth/callback?code=invalid_code');
      await expect(page).toHaveURL(/.*\/login\?error=auth-callback-failed/);
    });

    test('validates next parameter to prevent open redirect', async ({ page }) => {
      await setupAuth(page);

      // Test valid relative redirect
      await page.goto('/auth/callback?code=mock&next=/profile');
      await expect(page).toHaveURL(/.*\/profile/);

      await page.goto('/auth/callback?code=mock&next=/dsa');
      await expect(page).toHaveURL(/.*\/dsa/);

      // Test invalid external redirects
      await page.goto('/auth/callback?code=mock&next=https://evil.com');
      await expect(page).toHaveURL(/.*\/dsa/);

      await page.goto('/auth/callback?code=mock&next=//evil.com');
      await expect(page).toHaveURL(/.*\/dsa/);

      await page.goto('/auth/callback?code=mock&next=/\\evil.com');
      await expect(page).toHaveURL(/.*\/dsa/);

      await page.goto('/auth/callback?code=mock&next=@evil.com');
      await expect(page).toHaveURL(/.*\/dsa/);
    });
  });
});
