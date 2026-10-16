import { installV3API, ID } from "./helpers/dsa-v3";
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

  test('places Revise and Bookmarks in the user menu in the expected order', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/me', async route => {
      await route.fulfill({ json: { id: 'test-user-id', email: 'test@example.com', display_name: 'Student', roles: [] } });
    });
    await installV3API(page);
    await page.goto('/dsa');

    const header = page.locator('header');
    await expect(header.getByText('ReasonAI', { exact: true })).toBeVisible();
    await expect(header.locator('a[href="/revise"]')).toHaveCount(1);
    await expect(header.locator('a[href="/bookmarks"]')).toHaveCount(1);
    await expect(header.locator('a[href="/revise"]')).not.toBeVisible();
    await expect(header.locator('a[href="/bookmarks"]')).not.toBeVisible();

    await header.locator('a[href="/profile"]').first().hover();
    const revise = header.getByRole('link', { name: /Revise/, exact: false });
    const bookmarks = header.getByRole('link', { name: 'Bookmarks', exact: true });
    const signOut = header.getByRole('button', { name: 'Sign Out', exact: true });
    await expect(revise).toBeVisible();
    await expect(bookmarks).toBeVisible();
    await expect(signOut).toBeVisible();
    expect(await revise.evaluate((element, link) => element.nextElementSibling === link, await bookmarks.elementHandle())).toBe(true);
    expect(await bookmarks.evaluate((element, button) => element.nextElementSibling === button, await signOut.elementHandle())).toBe(true);

    await revise.click();
    await expect(page).toHaveURL(/.*\/revise$/);
  });

  test('lists bookmarks and handles empty state', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/me/bookmarks*', async route => {
      await route.fulfill({ json: { items: [], pagination: { total_items: 0, total_pages: 0, page: 1, page_size: 25 } } });
    });
    
    await page.goto('/bookmarks');
    await expect(page.locator('text=You haven\'t bookmarked any content yet.')).toBeVisible();
  });

  test('toggles bookmark state (PUT and DELETE)', async ({ authenticatedPage: page }) => {
    await installV3API(page, { count: 1, bookmarked: false });
    const methods: string[] = [];
    page.on('request', request => { if (request.url().includes(`/api/v1/me/bookmarks/${ID}`)) methods.push(request.method()); });
    await page.goto('/dsa/arrays');
    const button = page.getByRole('button', { name: 'Bookmark problem', exact: true });
    await button.click();
    await expect(page.getByRole('button', { name: 'Remove Bookmark', exact: true })).toBeVisible();
    expect(methods).toContain('PUT');
    await page.getByRole('button', { name: 'Remove Bookmark', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bookmark problem', exact: true })).toBeVisible();
    expect(methods).toContain('DELETE');
  });
});
