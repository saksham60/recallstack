import { test, expect } from './fixtures/authenticated-test';
import { createPagination, createStudyNoteResponse } from './helpers/factories';

interface NotePayload {
  content_item_id?: string;
  body?: string;
  kind?: string;
}

test.describe('Notes Flow', () => {
  let inMemoryNotes: Record<string, unknown>[] = [];

  test.beforeEach(async ({ authenticatedPage: page }) => {
    inMemoryNotes = []; // Reset state

    // Mock Study Note content
    await page.route('**/api/v1/content/*', async route => {
      await route.fulfill({
        json: createStudyNoteResponse({ content_item_id: 'c1' }),
      });
    });

    // Mock GET notes
    await page.route('**/api/v1/me/content/*/notes', async route => {
      await route.fulfill({
        json: {
          items: inMemoryNotes,
          pagination: createPagination(inMemoryNotes.length)
        }
      });
    });
  });

  test('creates a note', async ({ authenticatedPage: page }) => {
    let postCaptured = false;
    let postBody: NotePayload = {} as NotePayload;

    // Mock POST notes
    await page.route('**/api/v1/me/notes', async route => {
      if (route.request().method() === 'POST') {
        postCaptured = true;
        postBody = JSON.parse(route.request().postData() || '{}') as NotePayload;

        const newNote = {
          id: 'n1',
          content_item_id: postBody.content_item_id,
          body: postBody.body,
          kind: postBody.kind,
          row_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        inMemoryNotes.push(newNote);

        await route.fulfill({ json: newNote });
      } else {
        await route.continue();
      }
    });

    await page.goto('/content/mock-slug');
    
    // Click Add Note
    await page.locator('text=Add Note').click();

    // Type a note and save
    const textarea = page.getByPlaceholder(/Write your note/i);
    await textarea.fill('This is a test note.');
    
    await page.getByRole('button', { name: /Save/i }).click();

    expect(postCaptured).toBe(true);
    expect(postBody?.body).toBe('This is a test note.');
    expect(postBody?.kind).toBe('note'); // Default kind
    expect(postBody?.content_item_id).toBe('c1');

    // Note should now appear in UI after React Query refetches
    await expect(page.locator('text=This is a test note.')).toBeVisible();
  });

  test('deletes a note', async ({ authenticatedPage: page }) => {
    // Add an initial note to the state
    inMemoryNotes.push({
      id: 'n1',
      content_item_id: 'c1',
      body: 'Existing Note',
      kind: 'note',
      row_version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    let deleteCaptured = false;
    let deletedRowVersion: number | undefined;

    // Mock DELETE notes
    await page.route('**/api/v1/me/notes/n1', async route => {
      if (route.request().method() === 'DELETE') {
        deleteCaptured = true;
        const deleteBody = JSON.parse(route.request().postData() || '{}') as { row_version?: number };
        deletedRowVersion = deleteBody.row_version;

        inMemoryNotes = inMemoryNotes.filter(n => n.id !== 'n1');

        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.goto('/content/mock-slug');

    // Note should initially be visible
    await expect(page.locator('text=Existing Note')).toBeVisible();

    // Handle potential confirmation dialog natively
    page.on('dialog', dialog => dialog.accept());

    // Click delete
    const deleteBtn = page.locator('button[title="Delete Note"]').first();
    await deleteBtn.click();

    // Wait for the note to disappear after TanStack Query refetches
    await expect(page.locator('text=Existing Note')).not.toBeVisible();

    // Verify DELETE request occurred and included row_version
    expect(deleteCaptured).toBe(true);
    expect(deletedRowVersion).toBe(2);
  });
});
