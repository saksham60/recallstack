import { expect, test } from "./fixtures/authenticated-test";
import { createPagination, createProfile, createStudyNoteResponse } from "./helpers/factories";
import type { DSATutorRequest } from "../src/features/dsa/reasonai/contract";

const problem = createStudyNoteResponse({
  title: "3Sum", slug: "3sum", difficulty: "medium", topics: [], primary_topic: null,
  categories: [{ id: "arrays", name: "Arrays", slug: "arrays", sort_order: 0 }],
  summary: "Practice problem from the Ultimate DSA sheet in Arrays.",
  practice_resources: [{ id: "p1", provider_name: "LeetCode", provider_slug: "leetcode", url: "https://leetcode.com/problems/3sum/", external_key: "3sum", title: "3Sum", is_primary: true, sort_order: 0 }],
});
test.beforeEach(async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile() }));
  await page.route("**/api/v1/content/*", (route) => route.fulfill({ json: problem }));
  await page.route("**/api/v1/me/content/*/notes", (route) => route.fulfill({ json: { items: [], pagination: createPagination() } }));
});

test("3Sum workspace sends approach, code, notes and progressive hints through the DSA API", async ({ authenticatedPage: page }) => {
  const requests: DSATutorRequest[] = [];
  await page.route("**/api/v1/me/content/*/notes", (route) => route.fulfill({ json: { items: [{ id: "n1", body: "Remember to check assumptions", kind: "note", created_at: "2026-09-13T00:00:00Z" }], pagination: createPagination(1) } }));
  await page.route("**/api/reasonai/dsa/chat", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { text: `Tutor response ${requests.length}`, sources: [], webStatus: "off" } });
  });
  await page.goto("/dsa/problem/3sum");
  await expect(page.getByRole("heading", { name: "3Sum", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on LeetCode" })).toHaveAttribute("href", problem.practice_resources[0].url);
  await expect(page.getByRole("tab", { name: "Workspace", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Problem Statement", { exact: true })).toHaveCount(0);
  await page.getByLabel("My approach", { exact: true }).fill("I think I'll sort the array and loop over each value...");
  await page.getByRole("button", { name: "Review with ReasonAI" }).click();
  await expect(page.getByText("Tutor response 1", { exact: true })).toBeVisible();
  expect(requests[0]).toMatchObject({ action: "review", searchWeb: false, context: { title: "3Sum", category: "Arrays", userApproach: "I think I'll sort the array and loop over each value...", userNotes: "Remember to check assumptions" } });
  expect(requests[0].context).not.toHaveProperty("studyText");
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByText("Tutor response 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByText("Tutor response 3", { exact: true })).toBeVisible();
  expect(requests[1].hintLevel).toBe(1); expect(requests[2].hintLevel).toBe(2);
  expect(requests[2].history).toHaveLength(4);
  await page.getByText("My code", { exact: true }).click();
  await page.getByPlaceholder("Paste or type your code here...").fill("def solve(nums):\n    nums.sort()");
  await page.getByRole("button", { name: "Review my code" }).click();
  await expect(page.getByText("Tutor response 4", { exact: true })).toBeVisible();
  expect(requests[3].context.userCode).toContain("nums.sort()");
});

test("web search toggle and compact sources, with no raw retrieved content", async ({ authenticatedPage: page }) => {
  let sent: DSATutorRequest | undefined;
  await page.route("**/api/reasonai/dsa/chat", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { text: "Here is the source-grounded explanation [1].", webStatus: "used", sources: [{ title: "3Sum", url: problem.practice_resources[0].url }] } });
  });
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Search web", exact: true }).click();
  await page.getByLabel("Ask ReasonAI", { exact: true }).fill("What exactly is this problem asking?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Here is the source-grounded explanation [1].")).toBeVisible();
  expect(sent?.searchWeb).toBe(true);
  await expect(page.getByText("Powered by Tavily", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /1\. leetcode.com/ })).toHaveAttribute("rel", "noopener noreferrer");
});

test("empty editors, errors, retry, collapse and draft preservation", async ({ authenticatedPage: page }) => {
  let attempts = 0;
  await page.route("**/api/reasonai/dsa/chat", (route) => {
    attempts++;
    return route.fulfill(attempts === 1 ? { status: 504, json: { error: "ReasonAI timed out. Please try again." } } : { json: { text: "Try a small first step.", sources: [], webStatus: "off" } });
  });
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Review with ReasonAI" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Write your approach first" })).toBeVisible();
  expect(attempts).toBe(0);
  await page.getByText("My code", { exact: true }).click();
  await page.getByRole("button", { name: "Review my code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Write your code first" })).toBeVisible();
  await page.getByLabel("My approach", { exact: true }).fill("My working idea");
  await page.getByRole("button", { name: "Review with ReasonAI" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "timed out" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on LeetCode" })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Try a small first step.")).toBeVisible();
  await page.getByLabel("Ask ReasonAI", { exact: true }).fill("My next question");
  await page.getByRole("button", { name: "Collapse ReasonAI" }).click();
  await page.getByRole("button", { name: "ReasonAI", exact: true }).first().click();
  await expect(page.getByLabel("Ask ReasonAI", { exact: true })).toHaveValue("My next question");
  await expect(page.getByLabel("My approach", { exact: true })).toHaveValue("My working idea");
  await expect(page.getByText("Try a small first step.")).toBeVisible();
});

test("mobile tutor works as a tab and keeps workspace edits", async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dsa/problem/3sum");
  await page.getByLabel("My approach", { exact: true }).fill("A mobile idea");
  await page.getByRole("button", { name: "ReasonAI", exact: true }).click();
  await expect(page.getByLabel("Ask ReasonAI", { exact: true })).toBeVisible();
  await expect(page.getByLabel("My approach", { exact: true })).not.toBeVisible();
  await page.getByLabel("Ask ReasonAI", { exact: true }).fill("Keep this draft");
  await page.getByRole("button", { name: "Learning workspace", exact: true }).click();
  await expect(page.getByLabel("My approach", { exact: true })).toHaveValue("A mobile idea");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("missing URL and arbitrary providers render safely on legacy URLs", async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/content/missing", (route) => route.fulfill({ json: { ...problem, slug: "missing", practice_resources: [] } }));
  await page.goto("/content/missing");
  await expect(page.getByText("No practice link available", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("My approach", { exact: true })).toBeVisible();
  await page.route("**/api/v1/content/custom", (route) => route.fulfill({ json: { ...problem, slug: "custom", practice_resources: [{ ...problem.practice_resources[0], provider_name: "InterviewBit", url: "https://www.interviewbit.com/problems/3-sum/" }] } }));
  await page.goto("/content/custom");
  await expect(page.getByRole("link", { name: "Open on InterviewBit" })).toBeVisible();
});

test("expired chat session retains the external link and offers login", async ({ authenticatedPage: page }) => {
  await page.route("**/api/reasonai/dsa/chat", (route) => route.fulfill({ status: 401, json: { error: "Your session has expired. Sign in to use ReasonAI." } }));
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Help me start" }).click();
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", /\/login\?next=/);
  await expect(page.getByRole("link", { name: "Open on LeetCode" })).toBeVisible();
});

test("category Practice opens the dedicated workspace", async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/categories/*/content*", (route) => route.fulfill({ json: {
    items: [{ content_item_id: problem.content_item_id, title: problem.title, slug: problem.slug, difficulty: problem.difficulty, primary_topic: null, user_progress: problem.user_progress, is_bookmarked: false }],
    pagination: createPagination(1),
  } }));
  await page.goto("/dsa/arrays");
  const link = page.getByRole("link", { name: /Practice/ });
  await expect(link).toHaveAttribute("href", "/dsa/problem/3sum");
  await link.click();
  await expect(page.getByLabel("My approach", { exact: true })).toBeVisible();
});

test("workbook attribution, related links and practice tracking remain available", async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/content/*", (route) => route.fulfill({ json: { ...problem,
    blocks: [{ id: "b1", type: "recognize", position: 0, heading: "Source", payload: { source: { companies: "Workbook Company", remarks: "Original workbook remark" } } }],
    related_content: [{ content_item_id: "c2", slug: "related", title: "Related catalog entry", relation_type: "related", sort_order: 0, difficulty: "easy", summary: null, type: "problem" }],
  } }));
  await page.goto("/dsa/problem/3sum");
  await page.getByText("Problem info", { exact: true }).click();
  await expect(page.getByText("Workbook Company", { exact: true })).toBeVisible();
  await expect(page.getByText("Original workbook remark", { exact: true })).toBeVisible();
  await page.getByText("Track practice & revision", { exact: true }).click();
  await page.getByRole("button", { name: "Update Progress" }).click();
  await expect(page.getByRole("heading", { name: "Log Practice Attempt" })).toBeVisible();
  await page.getByRole("tab", { name: "Similar", exact: true }).click();
  await expect(page.getByRole("link", { name: "Related catalog entry" })).toHaveAttribute("href", "/content/related");
});

test("DSA route validates requests and guards unknown requirements without a provider call", async ({ authenticatedPage: page }) => {
  const request = { action: "chat", message: "What exactly is this problem asking?", searchWeb: false, hintLevel: 0, history: [], context: { contentId: "c1", slug: "3sum", title: "3Sum", userApproach: "", userCode: "", userNotes: "" } };
  const response = await page.request.post("/api/reasonai/dsa/chat", { data: request });
  expect(response.status()).toBe(200);
  expect((await response.json()).text).toContain("not the original requirements");
  const invalid = await page.request.post("/api/reasonai/dsa/chat", { data: { ...request, context: { ...request.context, studyText: "fake" } } });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await page.request.post("/api/reasonai/dsa/chat", { headers: { origin: "https://untrusted.example" }, data: request });
  expect(crossOrigin.status()).toBe(403);
});

test("unauthenticated DSA requests return JSON 401 instead of a login redirect", async ({ request }) => {
  const response = await request.post("/api/reasonai/dsa/chat", { data: {} });
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("application/json");
});

test("desktop workspace visual and metadata integrity", async ({ authenticatedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dsa/problem/3sum");
  await page.getByLabel("My approach", { exact: true }).fill("I think I'll sort the array and loop over each value.\n\nHow can I make use of the sorted order for the remaining elements?");
  await expect(page.getByRole("region", { name: "ReasonAI AI Tutor" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dsa-desktop.png"), fullPage: true });
  await page.getByText("Problem info", { exact: true }).click();
  await expect(page.getByText("Companies", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Remarks", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "ReasonAI", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("dsa-mobile.png"), fullPage: true });
});
