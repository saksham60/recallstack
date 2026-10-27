import { expect, test } from "./fixtures/authenticated-test";
import {
  installV3API,
  ID,
  VERSION,
  CATEGORY,
  canonical,
} from "./helpers/dsa-v3";

test("board separates official, provisional, attempted and infrastructure outcomes in labels and filters", async ({
  authenticatedPage: page,
}) => {
  const fixture = await installV3API(page, { count: 4 });
  await page.route("**/api/dsa/learner-progress", (r) =>
    r.fulfill({
      json: {
        items: fixture.problems.map((p, i) => ({
          problemId: p.id,
          problemVersionId: p.problem_version_id,
          categoryIds: [CATEGORY],
          learningStatus: "new",
          executionStatus: [
            "solved",
            "passed_current_tests",
            "attempted",
            "execution_failed",
          ][i],
          previousVersionPassed: false,
        })),
      },
    }),
  );
  await page.goto("/dsa/arrays");
  for (const [i, label] of [
    "Solved",
    "Passed current tests",
    "Attempted",
    "Execution failed",
  ].entries())
    await expect(
      page
        .locator(".dsa-problem-card:visible")
        .filter({ hasText: fixture.problems[i].title }),
    ).toContainText(label);
  await page
    .getByRole("combobox", { name: "Completion filter" })
    .selectOption("passed_current_tests");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(1);
  await expect(page.locator(".dsa-problem-card:visible")).toContainText(
    "Passed current tests",
  );
  await page.reload();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Completion filter" }).selectOption("unsolved");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(2);
  await expect(
    page.locator(".dsa-problem-card:visible").filter({ hasText: "Solved" }),
  ).toHaveCount(0);
});

test("progress outages do not turn saved completion into Not started and the real endpoint rejects anonymous callers", async ({
  authenticatedPage: page,
  request,
}) => {
  await installV3API(page);
  await page.route("**/api/dsa/learner-progress", (r) =>
    r.fulfill({ status: 503, json: { error: "Fixture storage outage" } }),
  );
  await page.goto("/dsa/arrays");
  await expect(page.locator(".dsa-problem-card:visible").first()).toContainText(
    "Progress unavailable",
  );
  await expect(page.locator(".dsa-problem-card:visible").first()).not.toContainText(
    "Not started",
  );
  // The page's request context carries its authenticated cookies. This isolated
  // API context is actually anonymous in both development and production tests.
  const response = await request.get(
    `/api/dsa/learner-progress?userId=${ID}`,
  );
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("topic-first home uses actual counts and never fetches full specifications", async ({
  authenticatedPage: page,
}) => {
  const { calls } = await installV3API(page);
  await page.goto("/dsa");
  await expect(
    page.getByRole("heading", { name: "Choose a topic." }),
  ).toBeVisible();
  await expect(page.locator(".dsa-topic-card:visible")).toHaveCount(2);
  await expect(page.locator(".dsa-topic-card:visible").first()).toContainText(
    "4 problems",
  );
  await expect(page.locator(".dsa-topic-card:visible").first()).toContainText(
    "1 mastered",
  );
  expect(calls.some((u) => /\/problems(?:\/|$)/.test(u.pathname))).toBe(false);
  await page.getByRole("textbox", { name: "Search topics", exact: true }).fill("graph");
  await expect(page.locator(".dsa-topic-card:visible")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("legacy library, category UUID and problem query resolve to canonical routes", async ({
  authenticatedPage: page,
}) => {
  await installV3API(page);
  const response = await page.goto("/dsa/library");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/dsa$/);
  await page.goto(`/dsa/${CATEGORY}`);
  await expect(page).toHaveURL(/\/dsa\/arrays$/);
  await page.goto(`/dsa?problem=${ID}&version=${VERSION}`);
  await expect(page).toHaveURL(canonical);
  await expect(page.locator(".studio-title h1:visible")).toHaveText("Array total");
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Arrays");
});

test("board composes difficulty, company, search, status and bookmark filters", async ({
  authenticatedPage: page,
}) => {
  await installV3API(page, { count: 12 });
  await page.goto("/dsa/arrays");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(12);
  await page.getByRole("combobox", { name: "Company filter" }).selectOption("amazon");
  await page.getByRole("combobox", { name: "Difficulty filter" }).selectOption("medium");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Search problems" }).fill("008");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("checkbox", { name: "Bookmarked", exact: true }).check();
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Completion filter" }).selectOption("unsolved");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(0);
});

test("keyboard ordering persists after refresh and rolls back failed writes", async ({
  authenticatedPage: page,
}) => {
  const data = await installV3API(page, { count: 7 });
  await page.goto("/dsa/arrays");
  const handle = page.getByRole("button", {
    name: "Reorder Array total",
    exact: true,
  });
  await expect(handle).toBeEnabled();
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.locator(".dsa-lane.easy .dsa-problem-link:visible").first(),
  ).toContainText("Problem 004");
  await expect.poll(() => data.getBoard().rowVersion).toBe(1);
  await page.reload();
  await expect(
    page.locator(".dsa-lane.easy .dsa-problem-link:visible").first(),
  ).toContainText("Problem 004");
  data.failNextSave();
  await page
    .getByRole("button", { name: "Reorder Array total", exact: true })
    .focus();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("alert").filter({ hasText: "Changed" }),
  ).toContainText("Changed in another session");
  await expect(
    page.locator(".dsa-lane.easy .dsa-problem-link:visible").first(),
  ).toContainText("Problem 004");
});

test("pointer drag saves order; collections preserve canonical lane membership", async ({
  authenticatedPage: page,
}) => {
  const data = await installV3API(page, { count: 7 });
  await page.goto("/dsa/arrays");
  await page
    .getByRole("button", { name: "Reorder Array total", exact: true })
    .dragTo(
      page.getByRole("button", { name: "Reorder Problem 007", exact: true }),
    );
  await expect.poll(() => data.getBoard().rowVersion).toBe(1);
  await page.getByRole("textbox", { name: "Collection name" }).fill("Interview week");
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(
    page.getByRole("heading", { name: "Interview week" }),
  ).toBeVisible();
  const collection = data.getBoard().layout.collections[0].id;
  await page
    .getByRole("combobox", { name: "Add Array total to collection", exact: true })
    .selectOption(collection);
  await expect(page.locator(".dsa-collection-item:visible")).toContainText(
    "Array total",
  );
  await expect(
    page
      .locator(".dsa-lane.easy .dsa-problem-link:visible")
      .filter({ hasText: "Array total" }),
  ).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".dsa-collection-item:visible")).toContainText(
    "Array total",
  );
});

test("pending schema exposes truthful limitations without disabling discovery", async ({
  authenticatedPage: page,
}) => {
  await installV3API(page, { metadataUnavailable: true });
  await page.goto("/dsa/arrays");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
  await expect(
    page.getByText(/Personal arrangements are unavailable/),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Company filter" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reorder Array total", exact: true }),
  ).toBeDisabled();
  await page.getByRole("textbox", { name: "Search problems" }).fill("Array total");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(1);
});

test("narrow browser and reduced-motion preserve navigation without overflow", async ({
  authenticatedPage: page,
}) => {
  await installV3API(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/dsa", "/dsa/arrays"]) {
    await page.goto(path);
    await expect(
      page
        .locator(path === "/dsa" ? ".dsa-topic-card:visible" : ".dsa-problem-card:visible")
        .first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("desktop reference screens render without page errors", async ({
  authenticatedPage: page,
}, info) => {
  await installV3API(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dsa");
  await expect(page.locator(".dsa-topic-card:visible")).toHaveCount(2);
  await page.screenshot({
    path: info.outputPath("dsa-v3-home.png"),
    fullPage: true,
  });
  await page.goto("/dsa/arrays");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(4);
  await page.screenshot({
    path: info.outputPath("dsa-v3-board.png"),
    fullPage: true,
  });
  await page.goto(canonical);
  await expect(
    page.getByRole("textbox", { name: "Solution code", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("dsa-v3-workspace.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
