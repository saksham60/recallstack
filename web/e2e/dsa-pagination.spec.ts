import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures/authenticated-test";
import { createProfile } from "./helpers/factories";

const PAGE_SIZE = 25;

type MockProblem = {
  content_item_id: string;
  slug: string;
  type: "problem";
  title: string;
  summary: null;
  difficulty: "easy" | "medium" | "hard";
  primary_topic: { slug: string; name: string };
  primary_practice_resource: null;
  user_progress: { status: "new" | "learning" | "mastered"; confidence: number };
  is_bookmarked: false;
  last_opened_at: null;
  next_review_at: null;
};

function makeProblems(count: number): MockProblem[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const difficulty = (["easy", "medium", "hard"] as const)[index % 3];
    const status = (["new", "learning", "mastered"] as const)[index % 3];
    return {
      content_item_id: `problem-${number}`,
      slug: `problem-${number}`,
      type: "problem",
      title: `Problem ${String(number).padStart(2, "0")}`,
      summary: null,
      difficulty,
      primary_topic: { slug: index % 2 === 0 ? "arrays" : "graphs", name: index % 2 === 0 ? "Arrays" : "Graphs" },
      primary_practice_resource: null,
      user_progress: { status, confidence: 0 },
      is_bookmarked: false,
      last_opened_at: null,
      next_review_at: null,
    };
  });
}

function filterProblems(items: MockProblem[], url: URL): MockProblem[] {
  const search = url.searchParams.get("search")?.toLowerCase();
  const difficulty = url.searchParams.get("difficulty");
  const status = url.searchParams.get("status");
  const topic = url.searchParams.get("topic");
  const sort = url.searchParams.get("sort");
  const filtered = items.filter((item) =>
    (!search || item.title.toLowerCase().includes(search) || item.slug.includes(search))
    && (!difficulty || item.difficulty === difficulty)
    && (!status || item.user_progress.status === status)
    && (!topic || item.primary_topic.slug === topic),
  );

  if (sort === "title") filtered.sort((left, right) => left.title.localeCompare(right.title));
  if (sort === "difficulty") filtered.sort((left, right) => left.difficulty.localeCompare(right.difficulty) || left.content_item_id.localeCompare(right.content_item_id));
  if (sort === "updated_at") filtered.reverse();
  return filtered;
}

async function fulfillCategory(route: Route, items: MockProblem[]) {
  const url = new URL(route.request().url());
  const filtered = filterProblems(items, url);
  const page = Number(url.searchParams.get("page") || "1");
  const pageSize = Number(url.searchParams.get("page_size") || String(PAGE_SIZE));
  const start = (page - 1) * pageSize;
  await route.fulfill({
    json: {
      items: filtered.slice(start, start + pageSize),
      pagination: {
        page,
        page_size: pageSize,
        total_items: filtered.length,
        total_pages: filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize),
      },
    },
  });
}

async function mockCategoryContent(page: Page, items: MockProblem[]) {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile() }));
  await page.route("**/api/v1/categories/*/content*", (route) => fulfillCategory(route, items));
}

test("renders deterministic ranges for 0, 1, 24, 25, 26, 50 and 51 items", async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile() }));
  await page.route("**/api/v1/categories/*/content*", async (route) => {
    const match = new URL(route.request().url()).pathname.match(/count-(\d+)\/content$/);
    await fulfillCategory(route, makeProblems(Number(match?.[1] ?? 0)));
  });

  for (const count of [0, 1, 24, 25, 26, 50, 51]) {
    await page.goto(`/dsa/count-${count}`);
    const expectedEnd = Math.min(count, PAGE_SIZE);
    await expect(page.getByLabel("Pagination")).toContainText(`Showing ${count === 0 ? 0 : 1}–${expectedEnd} of ${count}`);
    if (count === 0) await expect(page.getByRole("heading", { name: "No problems in this category yet" })).toBeVisible();
    await expect(page.getByText(`Page 1 of ${Math.max(1, Math.ceil(count / PAGE_SIZE))}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
    if (count <= PAGE_SIZE) await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    else await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  }
});

test("shows loading without pairing old rows or counts with the next page", async ({ authenticatedPage: page }) => {
  const items = makeProblems(26);
  let releaseSecondPage: (() => void) | undefined;
  const secondPageGate = new Promise<void>((resolve) => { releaseSecondPage = resolve; });
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile() }));
  await page.route("**/api/v1/categories/*/content*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("page") === "2") await secondPageGate;
    await fulfillCategory(route, items);
  });

  await page.goto("/dsa/arrays");
  await expect(page.getByLabel("Pagination")).toContainText("Showing 1–25 of 26");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByLabel("Loading problems")).toBeVisible();
  await expect(page.getByRole("link", { name: "Problem 01", exact: true })).toHaveCount(0);
  await expect(page.getByText("Page 2 of 2", { exact: true })).toHaveCount(0);

  releaseSecondPage?.();
  await expect(page.getByRole("link", { name: "Problem 26", exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Pagination")).toContainText("Showing 26–26 of 26");
});

test("reaches the 26th item and navigates next and previous without losing query state", async ({ authenticatedPage: page }) => {
  await mockCategoryContent(page, makeProblems(26));
  await page.goto("/dsa/arrays?search=Problem&company=Google");

  await expect(page.locator("table tbody tr")).toHaveCount(25);
  await expect(page.getByLabel("Pagination")).toContainText("Showing 1–25 of 26");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/search=Problem/);
  await expect(page).toHaveURL(/company=Google/);
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Problem 26", exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Pagination")).toContainText("Showing 26–26 of 26");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.locator("table tbody tr")).toHaveCount(25);
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
});

test("does not duplicate or skip records across full and partial pages", async ({ authenticatedPage: page }) => {
  await mockCategoryContent(page, makeProblems(51));
  await page.goto("/dsa/arrays");
  const seen: string[] = [];

  for (let expectedPage = 1; expectedPage <= 3; expectedPage++) {
    await expect(page.getByText(`Page ${expectedPage} of 3`, { exact: true })).toBeVisible();
    seen.push(...await page.locator("table tbody tr td:first-child a").allTextContents());
    if (expectedPage < 3) await page.getByRole("button", { name: "Next", exact: true }).click();
  }

  expect(seen).toHaveLength(51);
  expect(new Set(seen).size).toBe(51);
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.getByLabel("Pagination")).toContainText("Showing 51–51 of 51");
});

test("filters and search reset to page one while history restores the prior list", async ({ authenticatedPage: page }) => {
  await mockCategoryContent(page, makeProblems(51));
  await page.goto("/dsa/arrays?page=2&search=Problem&company=Google&sort=title");
  await expect(page.getByText("Page 2 of 3", { exact: true })).toBeVisible();

  await page.getByLabel("Difficulty").selectOption("easy");
  await expect(page).not.toHaveURL(/page=/);
  await expect(page).toHaveURL(/search=Problem/);
  await expect(page).toHaveURL(/company=Google/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/difficulty=easy/);
  await expect(page.getByLabel("Pagination")).toContainText("Showing 1–17 of 17");

  await page.getByPlaceholder("Search problems").fill("Problem 01");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Problem 01", exact: true }).first()).toBeVisible();

  await page.goBack();
  await expect(page.getByLabel("Difficulty")).toHaveValue("easy");
  await expect(page.getByPlaceholder("Search problems")).toHaveValue("Problem");
  await expect(page.getByLabel("Pagination")).toContainText("Showing 1–17 of 17");
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByLabel("Difficulty")).toHaveValue("");
  await expect(page.getByText("Page 2 of 3", { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Difficulty")).toHaveValue("easy");
});

test("clamps stale pages after filtering and distinguishes empty, no-results and error states", async ({ authenticatedPage: page }) => {
  await mockCategoryContent(page, makeProblems(26));
  await page.goto("/dsa/arrays?page=2");
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();

  await page.getByLabel("Status").selectOption("mastered");
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByLabel("Pagination")).toContainText("Showing 1–8 of 8");

  await page.goto("/dsa/arrays?page=99&status=mastered");
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByRole("link", { name: "Problem 03", exact: true }).first()).toBeVisible();

  await page.getByPlaceholder("Search problems").fill("No such problem");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("heading", { name: "No problems match these filters" })).toBeVisible();
  await expect(page.getByLabel("Pagination")).toContainText("Showing 0–0 of 0");

  await page.unroute("**/api/v1/categories/*/content*");
  await page.route("**/api/v1/categories/*/content*", (route) => route.fulfill({ status: 500, json: { detail: "failed" } }));
  await page.goto("/dsa/failing");
  await expect(page.getByRole("alert").filter({ hasText: "Failed to load content" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("keeps pagination, status and actions usable without horizontal overflow on mobile", async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockCategoryContent(page, makeProblems(26));
  await page.goto("/dsa/arrays");

  const mobileList = page.getByRole("list", { name: "Problems" });
  await expect(mobileList).toBeVisible();
  await expect(mobileList.getByText("Not Started", { exact: true }).first()).toBeVisible();
  await expect(mobileList.getByRole("link", { name: "Practice →", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("link", { name: "Problem 26", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
