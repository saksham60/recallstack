import { test, expect } from "./fixtures/authenticated-test";
import { installV3API, ID, VERSION, canonical } from "./helpers/dsa-v3";
import { exampleAnalysis } from "./helpers/dsa-report";
const submissionId = "40000000-0000-4000-8000-000000000001",
  reportId = "80000000-0000-4000-8000-000000000001";
test("official failed verdict stays visible while analysis loads, persists on refresh and links to owned history", async ({
  authenticatedPage: page,
}, info) => {
  await installV3API(page);
  let ready = false;
  const job = {
    submissionId,
    problemId: ID,
    problemVersionId: VERSION,
    mode: "submit",
    language: "python",
    status: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: {
      verdict: "wrong_answer",
      passedTests: 2,
      totalTests: 3,
      executionTimeMs: 8,
    },
  };
  await page.route(`**/api/dsa/executions/${submissionId}`, (r) =>
    r.fulfill({ json: job }),
  );
  await page.route("**/api/dsa/submissions?**", (r) =>
    r.fulfill({ json: { items: [job], next: null } }),
  );
  await page.route(`**/api/dsa/submissions/${submissionId}/report`, (r) =>
    r.fulfill({
      json: {
        submissionId,
        enabled: true,
        sourceCode: "def solve(nums): return []",
        codeSha256: "a".repeat(64),
        report: {
          id: reportId,
          status: ready ? "completed" : "generating",
          model: "fixture/model",
          rubric: "dsa-code-intelligence:1",
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          attempts: 1,
          ...(ready ? { analysis: exampleAnalysis } : {}),
        },
      },
    }),
  );
  await page.goto(`${canonical}&submission=${submissionId}`);
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "wrong answer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Verified by Judge", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/queued or generating/)).toBeVisible();
  ready = true;
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible();
  await page.getByText("Submitted source · read only", { exact: true }).click();
  await expect(
    page.getByText("def solve(nums): return []", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Estimated by AI", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "wrong answer", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(
    page.getByText(exampleAnalysis.summary, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Saved submissions" }).getByRole("link"),
  ).toHaveAttribute("href", `${canonical}&submission=${submissionId}`);
  await page
    .getByRole("region", { name: "Code Intelligence" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("dsa-v3-report-fixture.png"),
    fullPage: true,
  });
});
test("report and history endpoints enforce real auth and reject cross-origin access", async ({
  request,
}) => {
  for (const path of [
    `/api/dsa/submissions?problemId=${ID}&problemVersionId=${VERSION}`,
    `/api/dsa/submissions/${submissionId}/report`,
  ]) {
    expect(
      (
        await request.get(path, { headers: { Cookie: "e2e-bypass-auth=1" } })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.get(path, { headers: { Origin: "https://evil.example" } })
      ).status(),
    ).toBe(403);
  }
});
