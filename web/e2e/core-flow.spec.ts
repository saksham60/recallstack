import { test, expect } from '@playwright/test';

test.describe('Core Flow', () => {
  test('landing page is public and canvas requires login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/.*\/$/);
    await expect(page.getByRole('link', { name: 'ReasonAI home' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Build Better Judgment.', level: 1 })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toContainText('System Design');

    await page.goto('/system-design/canvas');
    await expect(page).toHaveURL(/.*\/login\?next=%2Fsystem-design%2Fcanvas/);
  });
});
