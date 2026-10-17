import { test, expect } from "./fixtures/authenticated-test";
import type { Page } from "@playwright/test";
import { installV3API, ID, VERSION, canonical } from "./helpers/dsa-v3";
import { exampleAnalysis } from "./helpers/dsa-report";
import type { ExecutionView } from "../src/features/dsa/execution/contract";
const latestId = "40000000-0000-4000-8000-000000000001",
  oldId = "40000000-0000-4000-8000-000000000002";
const activeDraft =
  "def solve(nums):\n    # MY CURRENT DRAFT\n    return sum(nums)";
async function paste(page: Page, code: string) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((code) => navigator.clipboard.writeText(code), code);
  await page
    .getByRole("textbox", { name: "Solution code", exact: true })
    .focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}
async function fixture(page: Page) {
  await installV3API(page);
  const now = new Date().toISOString();
  let job: ExecutionView = {
    submissionId: latestId,
    problemId: ID,
    problemVersionId: VERSION,
    language: "python",
    mode: "submit",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  const older: ExecutionView = {
    ...job,
    submissionId: oldId,
    status: "completed",
    createdAt: "2026-10-01T00:00:00Z",
    result: { verdict: "wrong_answer", executionTimeMs: 8 },
  };
  let reportStatus = "queued",
    posts = 0,
    retries = 0,
    reportGets = 0,
    delayOld = false;
  let cancellations = 0;
  let latestReportGets = 0;
  const tutorRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/dsa/execution-capabilities?**", (r) =>
    r.fulfill({ json: { run: true, submit: true, languages: ["python"] } }),
  );
  await page.route("**/api/dsa/executions", async (r) => {
    posts++;
    job = { ...job, status: "queued" };
    await r.fulfill({ status: 202, json: job });
  });
  await page.route(`**/api/dsa/executions/${latestId}`, (r) => {
    if (r.request().method() === "DELETE") {
      cancellations++;
      return r.fulfill({ status: 202, json: job });
    }
    return r.fulfill({ json: job });
  });
  await page.route(`**/api/dsa/executions/${oldId}`, async (r) => {
    if (delayOld) await new Promise((resolve) => setTimeout(resolve, 900));
    await r.fulfill({ json: older }).catch(() => {});
  });
  await page.route("**/api/dsa/submissions?**", (r) =>
    r.fulfill({
      json: { items: [...(posts ? [job] : []), older], next: null },
    }),
  );
  await page.route("**/api/dsa/submissions/*/report", async (r) => {
    const selected = r.request().url().includes(oldId);
    if (r.request().method() === "POST") {
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      reportStatus = "queued";
      return r.fulfill({ status: 202, json: { status: "queued" } });
    }
    reportGets++;
    if (!selected) latestReportGets++;
    await r.fulfill({
      json: {
        submissionId: selected ? oldId : latestId,
        sourceCode: selected ? "def solve(nums): return 0" : activeDraft,
        codeSha256: (selected ? "b" : "a").repeat(64),
        enabled: true,
        report: {
          id: selected
            ? "60000000-0000-4000-8000-000000000002"
            : "60000000-0000-4000-8000-000000000001",
          status: selected ? "completed" : reportStatus,
          createdAt: now,
          updatedAt: now,
          model: "fixture/model",
          rubric: "dsa-code-intelligence:1",
          attempts: 1,
          ...(selected || reportStatus === "completed"
            ? {
                analysis: {
                  ...exampleAnalysis,
                  summary: selected
                    ? "Historical review: this saved code returns zero."
                    : exampleAnalysis.summary,
                },
              }
            : {}),
        },
      },
    });
  });
  await page.route("**/api/reasonai/dsa/chat", async (r) => {
    tutorRequests.push(r.request().postDataJSON());
    await r.fulfill({
      headers: {
        "X-ReasonAI-Conversation-Id": "70000000-0000-4000-8000-000000000001",
      },
      json: { text: "Fixture Tutor reply", sources: [], webStatus: "off" },
    });
  });
  await page.goto(canonical);
  await expect(
    page.getByRole("textbox", { name: "Solution code", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await paste(page, activeDraft);
  return {
    get posts() {
      return posts;
    },
    get retries() {
      return retries;
    },
    get reportGets() {
      return reportGets;
    },
    get cancellations() {
      return cancellations;
    },
    get latestReportGets() {
      return latestReportGets;
    },
    confirmCancellation() {
      job = { ...job, status: "cancelled" };
    },
    tutorRequests,
    setStatus(status: string) {
      reportStatus = status;
    },
    complete(
      verdict: "provisional_pass" | "wrong_answer" = "provisional_pass",
      metrics: Partial<NonNullable<ExecutionView["result"]>> = {},
    ) {
      job = {
        ...job,
        status: "completed",
        result: {
          verdict,
          gradingLevel: "provisional",
          executionTimeMs: 9,
          ...metrics,
        },
      };
    },
    delayHistory() {
      delayOld = true;
    },
  };
}
test.describe.configure({ timeout: 120000 });
test("cancelling direct Submit has one control and waits for a saved terminal status", async ({
  authenticatedPage: page,
}) => {
  const h = await fixture(page);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancel execution", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Cancel execution", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancellation requested", exact: true }),
  ).toBeDisabled();
  h.confirmCancellation();
  await expect(
    page.getByRole("heading", { name: "Submission cancelled", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(h.posts).toBe(1);
  expect(h.cancellations).toBe(1);
  expect(h.latestReportGets).toBe(0);
});
test("direct Submit opens right Results and preserves judge evidence through queued, generating, saved and terminal polling", async ({
  authenticatedPage: page,
}, info) => {
  const h = await fixture(page);
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Results", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Queued for sandbox" }),
  ).toBeVisible();
  h.complete("provisional_pass", { totalTests: 3 });
  await expect(
    page
      .locator("#reasonai-panel-results")
      .getByRole("heading", { name: "Passed current tests" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".studio-judge-metrics")).not.toContainText("0/3");
  await expect(
    page.getByRole("heading", { name: "Code Intelligence queued" }),
  ).toBeVisible();
  h.setStatus("generating");
  await expect(
    page.getByRole("heading", { name: "Generating Code Intelligence" }),
  ).toBeVisible();
  h.setStatus("completed");
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible();
  const polls = h.reportGets;
  await page.waitForTimeout(2300);
  expect(h.reportGets).toBe(polls);
  expect(h.posts).toBe(1);
  expect(await page.locator('[aria-label="Code Intelligence"]').count()).toBe(
    1,
  );
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "MY CURRENT DRAFT",
  );
  await page.screenshot({
    path: info.outputPath("results-studio-desktop.png"),
    fullPage: true,
  });
});
test("failed review retry is separate from judging and repeated clicks do not duplicate requests", async ({
  authenticatedPage: page,
}) => {
  const h = await fixture(page);
  h.setStatus("failed");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  h.complete("wrong_answer");
  await expect(
    page.getByRole("button", { name: "Retry AI Review" }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Retry AI Review" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Code Intelligence queued" }),
  ).toBeVisible();
  expect(h.retries).toBe(1);
  expect(h.posts).toBe(1);
  h.setStatus("completed");
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("#reasonai-panel-results")
      .getByRole("heading", { name: "wrong answer", exact: true }),
  ).toBeVisible();
});
test("History selects saved context without replacing draft; Discuss preserves Tutor conversation and latest result can reopen", async ({
  authenticatedPage: page,
}) => {
  const h = await fixture(page);
  h.setStatus("completed");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  h.complete();
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Discuss with ReasonAI", exact: true })
    .click();
  await expect(
    page.getByText("Fixture Tutor reply", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page.locator(`a[href*="submission=${oldId}"]`).click();
  await expect(
    page.getByText("Historical review: this saved code returns zero.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "MY CURRENT DRAFT",
  );
  await page.getByText("Submitted source · read only", { exact: true }).click();
  await expect(
    page.getByText("def solve(nums): return 0", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discuss with ReasonAI", exact: true })
    .click();
  await expect.poll(() => h.tutorRequests.length).toBe(2);
  expect(
    (h.tutorRequests[1].context as Record<string, unknown>)
      .selectedSubmissionId,
  ).toBe(oldId);
  expect(h.tutorRequests[1].conversationId).toBe(
    "70000000-0000-4000-8000-000000000001",
  );
  await expect(page.locator(".studio-discussion-context")).toContainText(
    oldId.slice(0, 8),
  );
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await page.getByRole("link", { name: "View latest submission" }).click();
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "MY CURRENT DRAFT",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible();
});
test("rapid history navigation isolates late responses and responsive Results stay scrollable", async ({
  authenticatedPage: page,
}, info) => {
  const h = await fixture(page);
  h.setStatus("completed");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  h.complete();
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  h.delayHistory();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page.locator(`a[href*="submission=${oldId}"]`).click();
  await page.getByRole("link", { name: "View latest submission" }).click();
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(
    page.getByText("Historical review: this saved code returns zero.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Workspace panels" })
    .getByRole("button", { name: "AI Tutor", exact: true })
    .click();
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible();
  const dimensions = await page
    .locator("#reasonai-panel-results")
    .evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return {
        top: el.scrollTop,
        docWidth: document.documentElement.scrollWidth,
        width: innerWidth,
      };
    });
  expect(dimensions.top).toBeGreaterThan(0);
  expect(dimensions.docWidth).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({
    path: info.outputPath("results-studio-mobile.png"),
    fullPage: true,
  });
});
