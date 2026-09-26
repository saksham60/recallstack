import { test, expect } from "./fixtures/authenticated-test";
import type { Page } from "@playwright/test";

const id = (number: number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const story = (number: number) => ({
  id: id(number), title: `A smarter cache ${number}`, summary: "A small cache can remove repeated database reads. This briefing explores the trade-offs behind a faster, more reliable service.",
  whyItMatters: "Knowing when to cache helps you balance latency against freshness.", source: { key: "engineering", name: "Engineering journal" },
  sourceUrl: "https://example.test/cache", imageUrl: "https://images.test/cache.webp", publishedAt: new Date().toISOString(), topics: ["system-design", "cloud"], importanceScore: 75, qualityScore: 90,
});

async function setup(page: Page, count = 3) {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: { id: "test-user-id", email: "test@example.com", display_name: "Student", roles: [] } }));
  await page.route("**/api/v1/knowledge/feed*", (route) => route.fulfill({ json: { items: Array.from({ length: count }, (_, index) => story(index + 1)), nextCursor: null, hasMore: false } }));
  await page.route("**/api/v1/knowledge/stories/*", (route) => route.fulfill({ json: story(Number(route.request().url().split("-").at(-1))) }));
  await page.route("**/api/v1/knowledge/events/batch", (route) => route.fulfill({ json: { accepted: route.request().postDataJSON().events.length, duplicates: 0 } }));
  await page.route("https://images.test/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g"><stop stop-color="#25204c"/><stop offset="1" stop-color="#536079"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/><g fill="none" stroke="#c4b5fd" stroke-width="3"><rect x="140" y="255" width="240" height="160" rx="24"/><rect x="520" y="255" width="240" height="160" rx="24"/><rect x="900" y="255" width="240" height="160" rx="24"/><path d="M380 335h140m240 0h140"/></g></svg>' }));
}

test("buffers pages with bearer auth, keeps existing cards and deduplicates IDs", async ({ authenticatedPage: page }) => {
  await setup(page);
  const requests: string[] = [];
  let finishNext!: () => void;
  const nextReady = new Promise<void>((resolve) => { finishNext = resolve; });
  await page.route("**/api/v1/knowledge/feed*", async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    requests.push(cursor ?? "first");
    if (cursor) await nextReady;
    await route.fulfill({ json: { items: cursor ? [story(10), story(11)] : Array.from({ length: 10 }, (_, index) => story(index + 1)), nextCursor: cursor ? null : "page-two", hasMore: !cursor } });
  });
  await page.goto("/feed");
  await expect(page.getByRole("link", { name: "Feed", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "A smarter cache 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more stories", exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByRole("heading", { name: "A smarter cache 1", exact: true })).toBeAttached();
  await expect(page.getByRole("status", { name: "Loading stories" })).toBeVisible();
  finishNext();
  await expect(page.getByRole("heading", { name: "A smarter cache 11", exact: true })).toBeAttached();
  await expect(page.getByRole("heading", { name: "A smarter cache 10", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Load more stories" })).toHaveCount(0);
  expect(requests).toEqual(["first", "page-two"]);
});

test("filters using returned topics and keeps invalid individual stories out", async ({ authenticatedPage: page }) => {
  await setup(page);
  await page.route("**/api/v1/knowledge/feed*", (route) => {
    const topic = new URL(route.request().url()).searchParams.get("topic");
    return route.fulfill({ json: { items: topic ? [story(4)] : [story(1), { ...story(2), title: null }], nextCursor: null, hasMore: false } });
  });
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: "A smarter cache 1", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A smarter cache 2", exact: true })).toHaveCount(0);
  const request = page.waitForRequest((value) => value.url().includes("topic=cloud"));
  await page.getByRole("button", { name: "Cloud", exact: true }).click();
  await request;
  await expect(page.getByRole("button", { name: "Cloud", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "A smarter cache 4", exact: true })).toBeVisible();
});

test("opens a shareable detail, traps focus, restores scroll and handles a broken image", async ({ authenticatedPage: page }, testInfo) => {
  await setup(page);
  await page.route("https://images.test/**", (route) => route.abort());
  await page.goto("/feed");
  const open = page.getByRole("button", { name: "Read A smarter cache 2", exact: true });
  await open.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  await open.click();
  await expect(page).toHaveURL(new RegExp(`story=${id(2)}`));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Why it matters" })).toBeVisible();
  await expect(dialog.getByText("Image unavailable")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog")))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scroll)).toBeLessThan(3);
  await expect(open).toBeFocused();
  await page.goto(`/feed?story=${id(1)}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close story" }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await page.screenshot({ path: testInfo.outputPath("feed-desktop.png"), fullPage: false });
});

test("saves only after acknowledgement, retries idempotently, and unsaves", async ({ authenticatedPage: page }) => {
  await setup(page, 1);
  const saves: { eventId: string; type: string }[] = [];
  await page.route("**/api/v1/knowledge/events/batch", (route) => {
    const events = route.request().postDataJSON().events as { eventId: string; type: string }[];
    const save = events.find((event) => event.type === "SAVE" || event.type === "UNSAVE");
    if (save) saves.push(save);
    return route.fulfill({ status: save && saves.length === 1 ? 503 : 200, json: save && saves.length === 1 ? { detail: "private failure" } : { accepted: events.length, duplicates: 0 } });
  });
  await page.goto("/feed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  expect(saves[0].eventId).toBe(saves[1].eventId);
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  expect(saves.at(-1)?.type).toBe("UNSAVE");
});

test("clipboard sharing uses the internal detail URL", async ({ authenticatedPage: page }) => {
  await setup(page, 1);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.goto("/feed");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:3000/feed?story=${id(1)}`);
});

for (const status of [401, 403, 429, 500]) test(`handles HTTP ${status} without loops or leaking backend errors`, async ({ authenticatedPage: page }) => {
  await setup(page);
  let requests = 0;
  await page.route("**/api/v1/knowledge/feed*", (route) => { requests++; return route.fulfill({ status, json: { detail: "private backend error" } }); });
  await page.goto("/feed");
  await expect(page.getByRole("alert")).toContainText("Feed unavailable");
  await expect(page.getByText("private backend error")).toHaveCount(0);
  if (status === 401) await expect(page.getByRole("link", { name: "Sign in again" })).toBeVisible();
  expect(requests).toBe(status === 401 || status === 500 ? 2 : 1);
});

test("empty and expired deep links stay recoverable", async ({ authenticatedPage: page }) => {
  await setup(page, 0);
  await page.route("**/api/v1/knowledge/stories/*", (route) => route.fulfill({ status: 404, json: { detail: "expired" } }));
  await page.goto(`/feed?story=${id(1)}`);
  await expect(page.getByRole("dialog")).toContainText("This story is no longer available.");
  await page.getByRole("button", { name: "Close story" }).click();
  await expect(page.getByRole("heading", { name: "You’re all caught up" })).toBeVisible();
});

test("ReasonAI receives structured context, streams an answer, and retains it when returning to details", async ({ authenticatedPage: page }) => {
  await setup(page, 1);
  await page.route("**/api/reasonai/knowledge/chat", (route) => {
    const body = route.request().postDataJSON();
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    expect(body.context).toMatchObject({ id: id(1), title: "A smarter cache 1", topics: ["system-design", "cloud"] });
    const base = { protocolVersion: 1, runId: "run-1" };
    return route.fulfill({ contentType: "application/x-ndjson", body: [
      { ...base, seq: 1, type: "run.started" },
      { ...base, seq: 2, type: "text.delta", messageId: "m1", partId: "text", delta: "A cache keeps frequently used results nearby." },
      { ...base, seq: 3, type: "text.final", messageId: "m1", partId: "text", text: "A cache keeps frequently used results nearby." },
      { ...base, seq: 4, type: "run.completed" },
    ].map((event) => JSON.stringify(event)).join("\n") + "\n" });
  });
  await page.goto("/feed");
  await page.getByRole("button", { name: "Ask ReasonAI", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Story attached")).toBeVisible();
  await page.getByRole("button", { name: "Explain this simply", exact: true }).click();
  await expect(page.getByText("A cache keeps frequently used results nearby.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to story" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ask ReasonAI", exact: true }).click();
  await expect(page.getByText("A cache keeps frequently used results nearby.", { exact: true })).toBeVisible();
});

test("mobile layout keeps navigation and actions usable without horizontal overflow", async ({ authenticatedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 1);
  await page.goto("/feed");
  await expect(page.getByRole("button", { name: "Ask ReasonAI", exact: true })).toBeAttached();
  await expect(page.getByRole("link", { name: "Feed", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("feed-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Ask ReasonAI", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThan(390);
  expect(box!.height).toBeLessThan(844);
});
