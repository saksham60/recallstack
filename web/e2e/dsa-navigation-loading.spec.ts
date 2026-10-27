import { expect, test } from "./fixtures/authenticated-test";
import { installV3API, CATEGORY } from "./helpers/dsa-v3";
import { setupAuth } from "./helpers/auth";

test("slow navigation acknowledges pointer and keyboard activation before the route responds", async ({ authenticatedPage: page }) => {
  await installV3API(page);
  // This delays the RSC transport, including any unfinished prefetch, so the
  // Link's pending phase is observable even with a cached public taxonomy.
  await page.route("**/dsa/arrays?*", async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.fallback();
  });
  await page.goto("/dsa");
  const card = page.locator(".dsa-topic-card:visible").filter({ hasText: "Arrays" });
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card.locator('[data-dsa-link-pending="true"]')).toBeVisible({ timeout: 500 });
  await expect(card.getByRole("status")).toHaveText("Opening Arrays…");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "DSA" }).click();
  // A warm route may complete immediately; it must never be held to show a loader.
  await card.click();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
});

test("slow server-side preview resolution remains uncached and forwards the session", async ({ authenticatedPage: page }) => {
  await page.request.post("http://127.0.0.1:4160/__fixture", { data: { categoryDelayMs: 1500 } });
  await installV3API(page);
  await page.goto("/dsa?preview=true");
  const navigation = page.locator(".dsa-topic-card:visible").filter({ hasText: "Arrays" }).click();
  await navigation;
  // A completed prefetch may make this navigation immediate, even though the
  // server-side read was slow. Never require an artificial loading indicator.
  await expect(page.getByRole("heading", { name: "Arrays preview", exact: true })).toBeVisible();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
  const { requests } = await (await page.request.get("http://127.0.0.1:4160/__fixture")).json();
  expect(requests.some((r: { preview: boolean; authenticated: boolean; durationMs: number }) => r.preview && r.authenticated && r.durationMs >= 1500)).toBe(true);
  await page.request.post("http://127.0.0.1:4160/__fixture", { data: {} });
});

test("progressive pages remain browsable and cannot write an incomplete arrangement", async ({ authenticatedPage: page }) => {
  const fixture = await installV3API(page, { count: 151 });
  const last = fixture.problems[150];
  fixture.getBoard().layout.lanes.easy = [last.id, fixture.problems[0].id];
  fixture.getBoard().layout.collections.push({
    id: "60000000-0000-4000-8000-000000000001", title: "Saved challenges", problemIds: [last.id],
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/dsa/problems?**", async route => {
    if (new URL(route.request().url()).searchParams.has("cursor")) await gate;
    await route.fallback();
  });
  await page.goto("/dsa/arrays");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(50);
  await expect(page.locator(".dsa-count:visible")).toContainText("50 loaded");
  await expect(page.getByRole("button", { name: "Reorder Array total", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset order" })).toBeDisabled();
  await expect(page.getByText("Loading saved problem…", { exact: true })).toBeVisible();
  await expect(page.getByText("Previously saved problem is currently unavailable.", { exact: true })).toHaveCount(0);
  await page.getByLabel("Search problems").fill("151");
  await expect(page.getByText("No matching problems", { exact: true })).toHaveCount(0);
  expect(fixture.getBoard().rowVersion).toBe(0);
  release();
  await expect(page.locator(".dsa-count:visible")).toHaveText("151 problems");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(1);
  await expect(page.locator(".dsa-problem-card:visible")).toContainText("Problem 151");
  await page.getByLabel("Search problems").fill("");
  const handle = page.getByRole("button", { name: "Reorder Array total", exact: true });
  await expect(handle).toBeEnabled();
  await expect(page.locator(".dsa-lane.easy .dsa-problem-link:visible").first()).toContainText("Problem 151");
  await expect(page.locator(".dsa-collection-item:visible")).toContainText("Problem 151");
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => fixture.getBoard().rowVersion).toBe(1);
  expect(fixture.getBoard().layout.lanes.easy).toHaveLength(51);
  expect(fixture.getBoard().layout.lanes.easy).toContain(last.id);
});

test("a later-page outage retains available problems and can resume safely", async ({ authenticatedPage: page }) => {
  await installV3API(page, { count: 51 });
  let failed = true;
  await page.route("**/api/v1/dsa/problems?**", async route => {
    if (failed && new URL(route.request().url()).searchParams.has("cursor"))
      return route.fulfill({ status: 503, json: { detail: "Page temporarily unavailable" } });
    return route.fallback();
  });
  await page.goto("/dsa/arrays");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(50);
  await expect(page.getByRole("button", { name: "Retry remaining problems" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reorder Array total", exact: true })).toBeDisabled();
  failed = false;
  await page.getByRole("button", { name: "Retry remaining problems" }).click();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(51);
  await expect(page.locator(".dsa-count:visible")).toHaveText("51 problems");
});

test("slow optional services do not block basic browsing or pretend a saved filter has no matches", async ({ authenticatedPage: page }) => {
  await installV3API(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  for (const path of ["**/api/dsa/learner-progress", "**/api/v1/dsa/me/bookmarks?**", "**/api/dsa/board-companies", "**/api/dsa/boards/*"])
    await page.route(path, async route => { await gate; await route.fallback(); });
  await page.goto("/dsa/arrays");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
  await expect(page.locator(".dsa-problem-card:visible").first()).toContainText("Loading progress");
  await page.goto("/dsa/arrays?bookmarked=true&status=solved&company=google");
  await expect(page.getByText("No matching problems", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Loading data for your saved filters…", { exact: true })).toBeVisible();
  release();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(1);
});

test("mobile reduced-motion navigation works under a throttled connection", async ({ authenticatedPage: page, context }, info) => {
  await installV3API(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: 192 * 1024, uploadThroughput: 96 * 1024,
  });
  await page.goto("/dsa");
  await page.locator(".dsa-topic-card:visible").filter({ hasText: "Arrays" }).click();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("topic-mobile.png"), fullPage: true });
  await cdp.detach();
});

test("public taxonomy is reused across UUID and slug routes while preview remains private", async ({ authenticatedPage: page }) => {
  await page.request.post("http://127.0.0.1:4160/__fixture", { data: {} });
  await installV3API(page);
  for (const path of ["/dsa/arrays", "/dsa/graphs", `/dsa/${CATEGORY}`, "/dsa/arrays?preview=true", "/dsa/arrays?preview=true"]) {
    await page.goto(path);
    // loading.tsx streams before a UUID's canonical redirect completes.
    const name = path.includes("preview") ? "Arrays preview" : path.endsWith("graphs") ? "Graphs" : "Arrays";
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  const { requests } = await (await page.request.get("http://127.0.0.1:4160/__fixture")).json();
  const publicRequests = requests.filter((r: { preview: boolean }) => !r.preview);
  expect(publicRequests.length).toBeLessThanOrEqual(1);
  expect(publicRequests.every((r: { authenticated: boolean }) => !r.authenticated)).toBe(true);
  expect(requests.filter((r: { preview: boolean }) => r.preview).length).toBe(2);
  await page.goto("/dsa/arrays");
  await expect(page.getByRole("heading", { name: "Arrays", exact: true })).toBeVisible();
});

test("production middleware rejects a bypass cookie without an authenticated session", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addCookies([{ name: "e2e-bypass-auth", value: "1", domain: "localhost", path: "/" }]);
  const page = await context.newPage();
  await page.goto("http://localhost:3100/dsa/arrays");
  await expect(page).toHaveURL(/\/login\?next=/);
  await context.close();
});

test("cached public metadata does not authorize a non-reviewer preview", async ({ authenticatedPage: page }) => {
  await installV3API(page);
  await page.goto("/dsa/arrays");
  await setupAuth(page, { id: "non-reviewer" });
  await page.goto("/dsa/arrays?preview=true");
  await expect(page.getByRole("heading", { name: "DSA is temporarily unavailable" })).toBeVisible();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(0);
});

test("a newly published category resolves before cached taxonomy expires", async ({ authenticatedPage: page }) => {
  await installV3API(page);
  await page.goto("/dsa/arrays");
  await page.request.post("http://127.0.0.1:4160/__fixture", { data: { revision: 1 } });
  await page.goto("/dsa/new-topic");
  await expect(page.locator(".dsa-topic-heading h1:visible")).toContainText("New topic");
  const { requests } = await (await page.request.get("http://127.0.0.1:4160/__fixture")).json();
  expect(requests.length).toBeGreaterThan(0);
  await page.request.post("http://127.0.0.1:4160/__fixture", { data: {} });
});

test("server resolution errors provide a working retry", async ({ authenticatedPage: page }) => {
  await installV3API(page);
  await page.request.post("http://127.0.0.1:4160/__fixture", { data: { categoryStatus: 503 } });
  await page.goto("/dsa/arrays?preview=true");
  await expect(page.getByRole("heading", { name: "DSA is temporarily unavailable" })).toBeVisible();
  await page.request.post("http://127.0.0.1:4160/__fixture", { data: {} });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
});

test("problem skeletons inherit light tokens and reduced-motion preferences", async ({ authenticatedPage: page }, info) => {
  await installV3API(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/dsa/problems?**", async route => { await gate; await route.fallback(); });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/dsa");
  // The app currently ships dark tokens. Override tokens only in this test to
  // verify the shared skeleton does not embed a dark palette of its own.
  await page.evaluate(() => {
    const tokens = { background: "#ffffff", surface: "#f9fafb", "surface-elevated": "#f3f4f6", border: "#d1d5db", foreground: "#111827", muted: "#4b5563", accent: "#7c3aed" };
    for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(`--${name}`, value);
    document.documentElement.style.colorScheme = "light";
  });
  await page.locator(".dsa-topic-card:visible").filter({ hasText: "Arrays" }).click();
  const skeleton = page.locator(".dsa-problem-skeleton:visible").first();
  await expect(skeleton).toBeVisible();
  expect(await skeleton.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  await page.screenshot({ path: info.outputPath("topic-light-skeleton.png") });
  release();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
});
