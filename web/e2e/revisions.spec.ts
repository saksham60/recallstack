import { test, expect } from '@playwright/test';

test.describe('Revisions Flow', () => {
  test('handles rating a due item and removes it from the UI locally', async ({ page }) => {
    // Add bypass cookie
    await page.context().addCookies([{ name: 'e2e-bypass-auth', value: '1', domain: 'localhost', path: '/' }]);
    // Mock Supabase auth to prevent redirect
    await page.route('**/auth/v1/**', async route => {
      await route.fulfill({ json: { user: { id: 'test-user', email: 'test@example.com' } } });
    });

    await page.route('**/api/v1/me/reviews/due*', async route => {
      await route.fulfill({
        json: {
          items: [{
            card_id: 'card-1',
            title: 'Mock Card',
            slug: 'mock-card',
            due_at: new Date().toISOString(),
            row_version: 1
          }],
          total: 1, page: 1, page_size: 25, total_pages: 1
        }
      });
    });

    let ratingSubmitted = false;
    await page.route('**/api/v1/me/reviews/*/submit', async route => {
      if (route.request().method() === 'POST') {
        ratingSubmitted = true;
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });

    await page.goto('/revise');
    
    // Wait for the revision card to load
    await expect(page.locator('text=Mock Card')).toBeVisible();
    
    // Click 'Good'
    await page.getByRole('button', { name: 'Good' }).click();
    
    // The card should disappear optimistically
    await expect(page.locator('text=Mock Card')).not.toBeVisible();
    // Empty state should show up
    await expect(page.locator("text=You're all caught up!")).toBeVisible();
  });
});
