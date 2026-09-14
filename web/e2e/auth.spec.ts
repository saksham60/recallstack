import { test, expect } from '@playwright/test';
import { setupAuth } from './helpers/auth';
import { POST_AUTH_REDIRECT_COOKIE } from '../src/features/auth/auth-redirect';

test.describe('Authentication and Route Protection', () => {
  test.describe('Unauthenticated User', () => {
    const protectedRoutes = ['/dsa', '/bookmarks', '/revise', '/profile', '/content/test'];

    for (const route of protectedRoutes) {
      test(`redirects ${route} to login`, async ({ page }) => {
        await page.goto(route);
        await expect(page).toHaveURL(/.*\/login/);
      });
    }

    test('shows ReasonAI branding on login', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'ReasonAI', exact: true })).toBeVisible();
      await expect(page.getByText('RecallStack', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Continue as Hackathon Judge' })).toHaveCount(0);
    });

    test('disabled judge access stays signed out and explains the failure', async ({ page }) => {
      const response = await page.request.post('/api/auth/demo', {
        headers: { origin: 'http://localhost:3000' },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(303);
      expect(response.headers().location).toBe('http://localhost:3000/login?error=demo-disabled');

      await page.goto('/login?error=demo-disabled');
      await expect(page.getByRole('alert').filter({ hasText: 'Hackathon judge access is currently unavailable.' })).toHaveText('Hackathon judge access is currently unavailable. Continue with Google.');
      await page.goto('/dsa');
      await expect(page).toHaveURL(/\/login\?next=%2Fdsa$/);
    });

    test('judge authentication failures have a safe user-facing message', async ({ page }) => {
      await page.goto('/login?error=demo-auth-failed');
      await expect(page.getByRole('alert').filter({ hasText: 'Hackathon judge sign-in failed.' })).toHaveText('Hackathon judge sign-in failed. Please try again or continue with Google.');
    });

    test('judge endpoint accepts POST only and rejects cross-origin requests', async ({ page }) => {
      expect((await page.request.get('/api/auth/demo', { maxRedirects: 0 })).status()).toBe(405);
      expect((await page.request.post('/api/auth/demo', {
        headers: { origin: 'https://attacker.test' },
        maxRedirects: 0,
      })).status()).toBe(403);
    });
  });

  test.describe('Authenticated User', () => {
    test('redirects from the landing page to /dsa', async ({ page }) => {
      await setupAuth(page);
      await page.goto('/');
      await expect(page).toHaveURL(/.*\/dsa$/);
      await expect(page.getByRole('heading', { name: /Think\. Connect\. Reason\./ })).toHaveCount(0);
    });

    test('redirects from login to /dsa', async ({ page }) => {
      await setupAuth(page);
      await page.goto('/login?next=/profile');
      await expect(page).toHaveURL(/.*\/dsa$/);
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

    test('returns a signed-in user to the protected route that initiated login', async ({ page }) => {
      await setupAuth(page);
      await page.context().addCookies([
        {
          name: POST_AUTH_REDIRECT_COOKIE,
          value: encodeURIComponent('/system-design/canvas'),
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.goto('/auth/callback?code=mock');

      await expect(page).toHaveURL(/.*\/system-design\/canvas/);
      await expect.poll(async () => {
        const cookies = await page.context().cookies();
        return cookies.some(cookie => cookie.name === POST_AUTH_REDIRECT_COOKIE);
      }).toBe(false);
    });
  });
});
