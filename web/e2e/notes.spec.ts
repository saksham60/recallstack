import { test, expect } from "./fixtures/authenticated-test";
import { createPagination } from "./helpers/factories";
import { installV3API, ID, canonical } from "./helpers/dsa-v3";

const note = { id: "60000000-0000-4000-8000-000000000001", content_item_id: ID, title: null, kind: "note", body: "Existing Note", row_version: 1, created_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-16T00:00:00Z" };

test("creates a note in the canonical workspace with the existing content ID", async ({ authenticatedPage: page }) => {
  await installV3API(page);
  let rows: Array<Record<string, unknown>> = [], captured: unknown;
  await page.route(`**/api/v1/dsa/me/problems/${ID}/notes*`, route => {
    if (route.request().method() === "POST") {
      captured = route.request().postDataJSON(); rows = [{ ...note, ...captured as object }];
      return route.fulfill({ json: rows[0] });
    }
    return route.fulfill({ json: { items: rows, pagination: createPagination(rows.length) } });
  });
  await page.goto(canonical);
  await page.getByRole("button", { name: "Notes", exact: true }).first().click();
  await page.getByLabel("Note body", { exact: true }).fill("My invariant is preserved after each step.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.locator(".studio-prewrap").filter({hasText:"My invariant is preserved after each step."})).toBeVisible();
  expect(captured).toEqual({ body: "My invariant is preserved after each step.", kind: "note", title: null });
});

test("deletes an existing note only after confirmation and includes its row version", async ({ authenticatedPage: page }) => {
  await installV3API(page);
  let rows = [note], captured: unknown;
  await page.route(`**/api/v1/dsa/me/problems/${ID}/notes*`, route => route.fulfill({ json: { items: rows, pagination: createPagination(rows.length) } }));
  await page.route(`**/api/v1/dsa/me/notes/${note.id}`, route => {
    captured = route.request().postDataJSON(); rows = [];
    return route.fulfill({ status: 204 });
  });
  await page.goto(canonical);
  await page.getByRole("button", { name: "Notes", exact: true }).first().click();
  await expect(page.getByText("Existing Note", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  expect(captured).toBeUndefined();
  await page.getByRole("button", { name: "Keep note", exact: true }).click();
  await expect(page.getByText("Existing Note", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await page.getByRole("button", { name: "Delete note", exact: true }).last().click();
  await expect(page.getByText("Existing Note", { exact: true })).toHaveCount(0);
  expect(captured).toEqual({ row_version: 1 });
});
