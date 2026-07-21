import { test, expect } from './fixtures/authenticated-test';

test.describe('Bookmarks Flow', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
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

  test('lists bookmarks and handles empty state', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/me/bookmarks*', async route => {
      await route.fulfill({ json: { items: [], pagination: { total_items: 0, total_pages: 0, page: 1, page_size: 25 } } });
    });
    
    await page.goto('/bookmarks');
    await expect(page.locator('text=You haven\'t bookmarked any content yet.')).toBeVisible();
  });

  test('toggles bookmark state (PUT and DELETE)', async ({ authenticatedPage: page }) => {
    let isBookmarked = false;
    // Mock category content to show a bookmarkable item
    await page.route('**/api/v1/categories/*/content*', async route => {
      await route.fulfill({
        json: {
          items: [{
            content_item_id: 'c1',
            title: 'Mock Problem',
            slug: 'mock-problem',
            type: 'problem',
            summary: null,
            difficulty: 'easy',
            primary_topic: null,
            primary_practice_resource: null,
            user_progress: { status: 'new', confidence: 0, last_opened_at: null },
            is_bookmarked: isBookmarked,
            last_opened_at: null,
            next_review_at: null
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

    await bookmarkButton.click();
    expect(putCaptured).toBe(true);
    await expect(bookmarkButton).toHaveAttribute('aria-label', 'Remove Bookmark');

    const requestPromise = page.waitForRequest(req => req.url().includes('/api/v1/me/bookmarks/c1') && req.method() === 'DELETE');
    await bookmarkButton.click();
    const deleteReq = await requestPromise;
    expect(deleteReq.method()).toBe('DELETE');
  });
});
