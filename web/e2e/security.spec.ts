import { test, expect } from '@playwright/test';
import { setupAuth } from './helpers/auth';

test.describe('Security Hardening', () => {
  // Test XSS via intercepting network requests to provide malicious payload
  test('sanitizes XSS payloads in StudyNoteRenderer', async ({ page }) => {
    // Add bypass cookie and auth mock
    await setupAuth(page);

    // Mock API response with malicious payload
    await page.route('**/api/v1/content/*', async route => {
      const json = {
        title: "XSS Test",
        slug: "xss-test",
        content_item_id: "x1",
        domain: { slug: "dsa", name: "DSA" },
        categories: [{ id: "c1", name: "Arrays" }],
        topics: [{ id: "t1", name: "Two Pointers" }],
        published_at: new Date().toISOString(),
        blocks: [
          {
            id: "1",
            type: "text",
            position: 0,
            payload: {
              content: "<p>Safe content</p><script>window.__xssExecuted = true;</script><img src='x' onerror='window.__xssExecuted = true;'><a href='javascript:window.__xssExecuted = true;'>click me</a>"
            }
          }
        ]
      };
      await route.fulfill({ json });
    });

    // Navigate to a content page (we will mock auth via cookie or assume public route)
    // Here we assume the app allows viewing content or we mock it
    await page.goto('/content/xss-test');

    // Wait for the content to render
    await page.waitForSelector('.study-note-content');

    // Check if the script tag was stripped
    const html = await page.innerHTML('.study-note-content');
    expect(html).toContain('Safe content');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror');
    
    // Evaluate if the XSS flag was set on the window object
    const xssExecuted = await page.evaluate(() => (window as unknown as { __xssExecuted?: boolean }).__xssExecuted);
    expect(xssExecuted).toBeFalsy();
  });
});
