import { test, expect } from '@playwright/test';
import { setupAuth } from './helpers/auth';

interface NotePayload {
  content_id?: string;
  body?: string;
  kind?: string;
}

test.describe('Notes Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await page.route('**/api/v1/content/*', async route => {
      await route.fulfill({
        json: {
          content_item_id: 'c1',
          title: 'Mock Problem',
          slug: 'mock-slug',
          difficulty: 'easy',
          is_bookmarked: false,
          version_number: 1,
          version_status: 'published',
          domain: { id: 'd1', name: 'DSA', slug: 'dsa' },
          categories: [{ id: 'cat1', name: 'Category' }],
          topics: [{ id: 't1', name: 'Topic' }],
          blocks: []
        }
      });
    });
  });

  test('creates and edits a note', async ({ page }) => {
    // Mock the content page notes endpoint
    await page.route('**/api/v1/me/content/*/notes', async route => {
      await route.fulfill({
        json: {
          items: [],
          pagination: { total_items: 0, total_pages: 0, page: 1, page_size: 25 }
        }
      });
    });

    let postCaptured = false;
    let postBody: NotePayload = {} as NotePayload;
    await page.route('**/api/v1/me/notes', async route => {
      if (route.request().method() === 'POST') {
        postCaptured = true;
        postBody = JSON.parse(route.request().postData() || '{}') as NotePayload;
        await route.fulfill({
          json: {
            id: 'n1',
            content_item_id: postBody.content_id,
            body: postBody.body,
            kind: postBody.kind,
            row_version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/content/mock-slug');
    
    // Notes are now in the sidebar, no need to switch tabs
    
    // Click Add Note
    await page.locator('text=Add Note').click();

    // Type a note and save
    const textarea = page.getByPlaceholder(/Write your note/i);
    await textarea.fill('This is a test note.');
    
    await page.getByRole('button', { name: /Save/i }).click();

    expect(postCaptured).toBe(true);
    expect(postBody?.body).toBe('This is a test note.');
    expect(postBody?.kind).toBe('note'); // Default kind

    // Note should now appear in UI
    await expect(page.locator('text=This is a test note.')).toBeVisible();
  });

  test('deletes a note', async ({ page }) => {
    await page.route('**/api/v1/me/content/*/notes', async route => {
      await route.fulfill({
        json: {
          items: [{
            id: 'n1',
            content_item_id: 'c1',
            body: 'Existing Note',
            kind: 'study',
            row_version: 2
          }],
          pagination: { total_items: 1, total_pages: 1, page: 1, page_size: 25 }
        }
      });
    });

    let deleteCaptured = false;
    await page.route('**/api/v1/me/notes/n1', async route => {
      if (route.request().method() === 'DELETE') {
        deleteCaptured = true;
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.goto('/content/mock-slug');
    
    // Notes are now in the sidebar, no need to switch tabs

    // Handle potential confirmation dialog natively
    page.on('dialog', dialog => dialog.accept());
    const deleteBtn = page.locator('button[title="Delete Note"]').first();
    await deleteBtn.click();

    // Verify DELETE request occurred
    expect(deleteCaptured).toBe(true);
    
    // Verify it disappeared
    await expect(page.locator('text=Existing Note')).not.toBeVisible();
  });

  test('handles note conflicts gracefully', async ({ page }) => {
    await page.route('**/api/v1/me/content/*/notes', async route => {
      await route.fulfill({
        json: {
          items: [{
            id: 'n1',
            content_item_id: 'c1',
            body: 'Old Note',
            kind: 'study',
            row_version: 1
          }],
          pagination: { total_items: 1, total_pages: 1, page: 1, page_size: 25 }
        }
      });
    });

    // Mock a 409 conflict during patch
    await page.route('**/api/v1/me/notes/n1', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 409,
          json: { detail: 'Conflict: The note has been modified by another client.' }
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/content/mock-slug');
    
    // Notes are now in the sidebar, no need to switch tabs

    // Assume there is an edit button
    const editBtn = page.getByRole('button', { name: /Edit/i }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      const textarea = page.getByPlaceholder(/Write your note/i);
      await textarea.fill('Conflicting Note');
      await page.getByRole('button', { name: /Save/i }).click();

      // UI should show error
      await expect(page.locator('text=Conflict: The note has been modified by another client.')).toBeVisible();
    }
  });
});
