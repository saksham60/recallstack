import { test, expect } from "./fixtures/authenticated-test";
import { createProfile, createUserDetail } from "./helpers/factories";
import type { Page } from "@playwright/test";

const USER = "00000000-0000-4000-8000-000000000001";
async function localPipeline(page: Page) {
  page.on("pageerror", (error) =>
    console.log("telemetry_fixture_browser_error", error.message),
  );
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: createProfile({ id: USER }) }),
  );
  await page.route("**/api/v1/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/v1/admin/users/${USER}`)
      return route.fulfill({
        json: createUserDetail({
          profile: {
            ...createUserDetail().profile,
            user_id: USER,
            name: "Fixture learner",
            email: "fixture@example.test",
          },
        }),
      });
    const response = await route.fetch({
      url: `http://127.0.0.1:4170${url.pathname}${url.search}`,
    });
    return route.fulfill({ response });
  });
  await page.route("**/api/v1/telemetry/events", async (route) => {
    const response = await route.fetch({
      url: "http://127.0.0.1:4170/api/v1/telemetry/events",
    });
    return route.fulfill({ response });
  });
}

test("real ingestion appears in Admin, deduplicates, and cannot manufacture official solves", async ({
  authenticatedPage: page,
}) => {
  await localPipeline(page);
  const session = crypto.randomUUID(),
    journey = crypto.randomUUID();
  const events = [
    "session.started",
    "dsa.problem_opened",
    "dsa.local_run_started",
  ].map((name) => ({
    event_id: crypto.randomUUID(),
    schema_version: 1,
    event_name: name,
    session_id: session,
    journey_id: journey,
    occurred_at: new Date().toISOString(),
    source: "web",
    entity_id: "10000000-0000-4000-8000-000000000001",
    properties: {},
  }));
  const ingest = await page.request.post(
    "http://127.0.0.1:4170/api/v1/telemetry/events",
    { data: { events } },
  );
  expect(ingest.status()).toBe(200);
  const retry = await page.request.post(
    "http://127.0.0.1:4170/api/v1/telemetry/events",
    { data: { events } },
  );
  expect((await retry.json()).duplicates).toBe(3);
  const spoof = await page.request.post(
    "http://127.0.0.1:4170/api/v1/telemetry/events",
    {
      data: { events: [{ ...events[0], event_name: "dsa.official_accepted" }] },
    },
  );
  expect(spoof.status()).toBe(422);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Product Intelligence", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dsa", exact: true }).click();
  await expect(
    page.getByText("Local Runs", { exact: true }).locator(".."),
  ).toContainText("1");
  await expect(
    page.getByText("Official Solves", { exact: true }).locator(".."),
  ).toContainText("0");
  await page.getByRole("button", { name: "Ai", exact: true }).click();
  await expect(
    page.getByText("Billed Cost", { exact: true }).locator(".."),
  ).toContainText("Not tracked");
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  await page.getByRole("button", { name: "Funnels", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Official Submit conversion",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Feature transitions and revisits",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "New and returning engagement",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Health", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "3", exact: true }).first(),
  ).toBeVisible();
  await page.goto(`/admin/users/${USER}?tab=timeline`);
  await expect(
    page.getByText("dsa.local_run_started", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: `Observed session ${session}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "../docs/evidence/screenshots/2026-10-22/product-intelligence/user-timeline-fixture.png",
    fullPage: true,
  });
});

test("server-driven user filters preserve unknown history and error recovery", async ({
  authenticatedPage: page,
}) => {
  await localPipeline(page);
  await page.goto("/admin/users");
  await page.getByLabel("Search email/name").fill("fixture@example.test");
  await expect(
    page.getByRole("link", { name: "Fixture learner", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Recorded segment").selectOption("mobile");
  await expect(
    page.getByText("0 registered records matching filter"),
  ).toBeVisible();
  await page.getByLabel("Recorded segment").selectOption("all");
  await expect(
    page.getByRole("link", { name: "Fixture learner", exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/admin/analytics/overview?*", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Fixture pipeline unavailable" },
    }),
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("button", { name: "7 days", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fixture pipeline unavailable", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/v1/admin/analytics/overview?*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("Registered Users", { exact: true }),
  ).toBeVisible();
});

test("verified classification changes organic filters without hiding the account", async ({
  authenticatedPage: page,
}) => {
  await localPipeline(page);
  await page.goto(`/admin/users/${USER}?tab=overview`);
  await page.getByLabel("Verified classification").selectOption("demo");
  await page
    .getByRole("button", { name: "Save classification", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Classification saved.");
  await page.goto("/admin");
  await page
    .getByLabel("Exclude reliably classified internal/demo accounts")
    .check();
  await expect(
    page.getByText("Registered Users", { exact: true }).locator(".."),
  ).toContainText("0");
  await page.goto("/admin/users");
  await expect(
    page.getByRole("link", { name: "Fixture learner", exact: true }),
  ).toBeVisible();
  await page.request.put(
    `http://127.0.0.1:4170/api/v1/admin/analytics/users/${USER}/classification`,
    { data: { classification: null, reason: "admin_verified" } },
  );
});
