import { test, expect } from '@playwright/test';
import { setupAuth } from './helpers/auth';

interface ReviewPayload {
  rating?: string;
  expected_row_version?: number;
  review_event_id?: string;
  reviewed_at?: string;
}

test.describe('Revisions Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await page.route('**/api/v1/me/reviews/due*', async route => {
      await route.fulfill({
        json: {
          items: [{
            card_id: 'card-1',
            title: 'Mock Card',
            slug: 'mock-card',
            due_at: new Date().toISOString(),
            row_version: 3
          }],
          pagination: { total_items: 1, total_pages: 1, page: 1, page_size: 25 }
        }
      });
    });
  });

  const ratings = ['Again', 'Hard', 'Good', 'Easy'];

  for (const rating of ratings) {
    test(`submits ${rating} rating correctly`, async ({ page }) => {
      let postBody: ReviewPayload = {} as ReviewPayload;
      let requestedUrl = '';

      await page.route('**/api/v1/me/reviews/*/submit', async route => {
        if (route.request().method() === 'POST') {
          postBody = JSON.parse(route.request().postData() || '{}') as ReviewPayload;
          requestedUrl = route.request().url();
          await route.fulfill({ json: { success: true } });
        } else {
          await route.continue();
        }
      });

      await page.goto('/revise');
      
      // Wait for the revision card to load
      await expect(page.locator('text=Mock Card')).toBeVisible();
      
      // Click the rating button
      await page.getByRole('button', { name: rating }).click();
      
      // The card should disappear optimistically
      await expect(page.locator('text=Mock Card')).not.toBeVisible();
      // Empty state should show up
      await expect(page.locator("text=You're all caught up!")).toBeVisible();

      // Assert network request
      expect(requestedUrl).toContain('/api/v1/me/reviews/card-1/submit');
      expect(postBody?.rating).toBe(rating.toLowerCase());
      expect(postBody?.expected_row_version).toBe(3);
      
      // uuid regex
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(postBody?.review_event_id).toMatch(uuidRegex);
      expect(postBody?.reviewed_at).toBeDefined();
    });
  }

  test('reverts optimistic UI on API failure', async ({ page }) => {
    await page.route('**/api/v1/me/reviews/*/submit', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 500, json: { detail: 'Internal Server Error' } });
      } else {
        await route.continue();
      }
    });

    await page.goto('/revise');
    
    // Wait for the revision card to load
    await expect(page.locator('text=Mock Card')).toBeVisible();
    
    // Click rating
    await page.getByRole('button', { name: /Again/i }).click();

    // The card should reappear
    await expect(page.locator('text=Mock Card')).toBeVisible();
  });
});
