import { test, expect } from '@playwright/test';

test.describe('Core Flow', () => {
  test('landing page is public and canvas requires login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/.*\/$/);
    await expect(page.getByRole('heading', { name: /Think\. Connect\. Reason\./ })).toBeVisible();
    await expect(page.getByRole('navigation')).toContainText('Login');
    await expect(page.getByRole('navigation')).toContainText('Canvas');

    await page.getByRole('navigation').getByRole('link', { name: /Canvas/ }).click();
    await expect(page).toHaveURL(/.*\/login\?next=%2Fsystem-design%2Fcanvas/);
  });
});
