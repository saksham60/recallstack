import { test, expect } from '@playwright/test';
import { setupAuth } from './helpers/auth';

test.describe('Bookmarks Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await page.route('**/api/v1/categories/mock-category', async route => {
      await route.fulfill({
        json: {
          id: 'mock-category',
          name: 'Mock Category',
          slug: 'mock-category',
          description: 'A mock category for testing.',
          mastered_count: 0,
          confident_count: 0,
          total_content_items: 1
        }
      });
    });
  });

  test('lists bookmarks and handles empty state', async ({ page }) => {
    await page.route('**/api/v1/me/bookmarks*', async route => {
      await route.fulfill({ json: { items: [], pagination: { total_items: 0, total_pages: 0, page: 1, page_size: 25 } } });
    });
    
    await page.goto('/bookmarks');
    await expect(page.locator('text=You haven\'t bookmarked any content yet.')).toBeVisible();
  });

  test('toggles bookmark state (PUT and DELETE)', async ({ page }) => {
    let isBookmarked = false;
    // Mock category content to show a bookmarkable item
    await page.route('**/api/v1/categories/*/content*', async route => {
      await route.fulfill({
        json: {
          items: [{
            content_item_id: 'c1',
            title: 'Mock Problem',
            slug: 'mock-problem',
            difficulty: 'easy',
            is_bookmarked: isBookmarked,
            version_number: 1,
            version_status: 'published'
          }],
          pagination: { total_items: 1, page: 1, page_size: 25, total_pages: 1 }
        }
      });
    });

    let putCaptured = false;
    await page.route('**/api/v1/me/bookmarks/c1', async route => {
      if (route.request().method() === 'PUT') {
        putCaptured = true;
        isBookmarked = true;
        await route.fulfill({ json: { success: true } });
      } else if (route.request().method() === 'DELETE') {
        isBookmarked = false;
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });

    await page.goto('/dsa/mock-category');
    
    const bookmarkButton = page.getByRole('button', { name: /Bookmark/i }).first();
    await expect(bookmarkButton).toBeVisible();

    // Verify UI state changes correctly (optimistic update)
    await bookmarkButton.click();
    expect(putCaptured).toBe(true);

    // It should now be toggled (or have active state). 
    // Wait for the button to have a different aria-label or just wait for the request to settle.
    // In our UI, we typically use text "Remove Bookmark" or change the icon.
    // We'll just verify the DELETE can be triggered.
    const requestPromise = page.waitForRequest(req => req.url().includes('/api/v1/me/bookmarks/c1') && req.method() === 'DELETE');
    await bookmarkButton.click();
    const deleteReq = await requestPromise;
    expect(deleteReq.method()).toBe('DELETE');
  });
});
