import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/authenticated-test";
import type { FeedStory } from "../src/features/feed/model";

const story = (number: number, saved = true): FeedStory => ({
  id: `30000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  title: `Saved engineering story ${number}`, summary: "A useful engineering story to revisit later.",
  whyItMatters: "Understand the trade-offs.", source: { key: "engineering", name: "Engineering journal" },
  sourceUrl: "https://example.test/story", imageUrl: "", publishedAt: "2026-10-19T09:00:00Z",
  topics: ["cloud"], importanceScore: 0.8, qualityScore: 0.9, viewerState: { saved, seenAt: null },
});

async function setup(page: Page) {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: { id: "test-user-id", email: "test@example.com", display_name: "Student", roles: [] } }));
  await page.route("**/api/v1/me/bookmarks*", (route) => route.fulfill({ json: { items: [], pagination: { page: 1, page_size: 50, total_items: 0, total_pages: 0 } } }));
  await page.route("**/api/v1/knowledge/refresh-runs", (route) => route.fulfill({ json: { available: false } }));
}

test("feed saves appear in Bookmarks after reload and unsave persists", async ({ authenticatedPage: page }) => {
  await setup(page);
  let saved = false;
  await page.route("**/api/v1/knowledge/feed*", (route) => route.fulfill({ json: { items: [story(1, saved)], nextCursor: null, hasMore: false } }));
  await page.route("**/api/v1/knowledge/stories/*", (route) => route.fulfill({ json: story(1, saved) }));
  await page.route("**/api/v1/knowledge/saved-stories*", (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    return route.fulfill({ json: { items: saved ? [story(1)] : [], nextCursor: null, hasMore: false } });
  });
  await page.route("**/api/v1/knowledge/events/batch", (route) => {
    const events = route.request().postDataJSON().events as { type: string }[];
    for (const event of events) {
      if (event.type === "SAVE") saved = true;
      if (event.type === "UNSAVE") saved = false;
    }
    return route.fulfill({ json: { accepted: events.length, duplicates: 0 } });
  });
  await page.goto("/feed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  await page.goto("/bookmarks");
  await expect(page.getByRole("heading", { name: story(1).title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: story(1).title })).toBeVisible();
  const read = page.getByRole("link", { name: "Read story", exact: true });
  await expect(read).toHaveAttribute("href", `/feed?story=${story(1).id}`);
  await read.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading", { name: story(1).title, level: 3 })).toBeVisible();
  await page.goBack();
  await page.getByRole("button", { name: `Unsave ${story(1).title}`, exact: true }).click();
  await expect(page.getByText("No saved stories yet.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("No saved stories yet.", { exact: true })).toBeVisible();
  await page.goto("/feed");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
});

test("saved stories paginate and survive a failed unsave on narrow web", async ({ authenticatedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await setup(page);
  await page.route("**/api/v1/knowledge/saved-stories*", (route) => {
    const next = new URL(route.request().url()).searchParams.get("cursor");
    return route.fulfill({ json: { items: next ? [story(2)] : [story(1)], nextCursor: next ? null : "next-saved-page", hasMore: !next } });
  });
  await page.route("**/api/v1/knowledge/events/batch", (route) => route.fulfill({ status: 422, json: { detail: "Save failed" } }));
  await page.goto("/bookmarks");
  await page.getByRole("button", { name: "Load more saved stories" }).click();
  await expect(page.getByRole("heading", { name: story(2).title })).toBeVisible();
  await expect(page.getByRole("heading", { name: story(1).title })).toBeVisible();
  await page.getByRole("button", { name: `Unsave ${story(1).title}` }).click();
  await expect(page.getByRole("region", { name: "Saved stories", exact: true }).getByRole("alert")).toContainText("Check your connection");
  await expect(page.getByRole("heading", { name: story(1).title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("saved-stories-narrow.png"), fullPage: true });
});

test("saved-story failures do not hide learning bookmarks and can be retried", async ({ authenticatedPage: page }) => {
  await setup(page);
  let fail = true;
  await page.route("**/api/v1/knowledge/saved-stories*", (route) => route.fulfill({ status: fail ? 503 : 200, json: fail ? { detail: "Unavailable" } : { items: [story(1)], nextCursor: null, hasMore: false } }));
  await page.route("**/api/v1/me/bookmarks*", (route) => route.fulfill({ json: { items: [{ content_item_id: "learning-bookmark", title: "Arrays lesson", slug: "arrays", created_at: "2026-10-19T09:00:00Z" }], pagination: { page: 1, page_size: 50, total_items: 1, total_pages: 1 } } }));
  await page.goto("/bookmarks");
  await expect(page.getByRole("link", { name: "Arrays lesson" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved stories", exact: true }).getByRole("alert")).toContainText("Couldn't load saved stories");
  fail = false;
  await page.getByRole("button", { name: "Retry saved stories" }).click();
  await expect(page.getByRole("heading", { name: story(1).title })).toBeVisible();
  await expect(page.getByRole("link", { name: "Arrays lesson" })).toBeVisible();
});
