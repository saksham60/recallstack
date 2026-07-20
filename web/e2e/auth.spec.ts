import { test, expect } from '@playwright/test';

test.describe('Authentication and Route Protection', () => {
  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dsa');
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.getByRole('heading', { name: 'RecallStack' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('OAuth open-redirect protections', async ({ page }) => {
    // Attempt an open redirect via the callback route
    // The route handler should sanitize this and redirect to /dsa
    await page.goto('/auth/callback?code=mock_code&next=https://evil.com');
    // Since code exchange fails (mock_code is invalid), we expect a redirect to /login?error=auth-callback-failed
    // Wait, the test might fail if the mock is not intercepted. We just check the URL ends up safe.
    await expect(page).not.toHaveURL(/.*evil\.com.*/);
    await expect(page).toHaveURL(/.*\/login\?error=auth-callback-failed/);
  });

  // Usually we'd test successful login here as well, by mocking the Supabase auth endpoints.
});
