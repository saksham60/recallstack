import { expect, test } from "./fixtures/authenticated-test";
import type { Page } from "@playwright/test";
import { createProfile, createPagination } from "./helpers/factories";
import type {
  ExecutionRequest,
  ExecutionView,
} from "../src/features/dsa/execution/contract";

const problemId = "10000000-0000-4000-8000-000000000001",
  problemVersionId = "20000000-0000-4000-8000-000000000001",
  submissionId = "40000000-0000-4000-8000-000000000001";
const code = "def solve(nums):\n    return sum(nums)";
const url = `/dsa?problem=${problemId}&version=${problemVersionId}`;
function job(
  status: ExecutionView["status"],
  mode: "run" | "submit" = "run",
): ExecutionView {
  return {
    submissionId,
    problemId,
    problemVersionId,
    mode,
    status,
    language: "python",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
async function setup(page: Page, available = { run: true, submit: true }) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: createProfile() }),
  );
  await page.route("**/api/v1/dsa/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/notes") || path.endsWith("/bookmarks"))
      return route.fulfill({
        json: { items: [], pagination: createPagination() },
      });
    if (path.endsWith("/progress"))
      return route.fulfill({
        json: {
          content_item_id: problemId,
          status: "new",
          confidence: 0,
          row_version: 0,
        },
      });
    if (path.endsWith("/test-cases"))
      return route.fulfill({
        json: {
          problem_version_id: problemVersionId,
          items: [],
          next_cursor: null,
          has_more: false,
          has_verified_public_tests: false,
        },
      });
    return route.fulfill({
      json: {
        id: problemId,
        problem_version_id: problemVersionId,
        title: "Array total",
        slug: "array-total",
        description: "Return the sum of the array.",
        difficulty: "easy",
        availability: "available",
        categories: [],
        topics: [],
        function_contract: {
          function: "solve",
          input: { nums: "integer[]" },
          output: "integer",
        },
        constraints: [],
        examples: [],
        supported_contract_languages: ["python"],
      },
    });
  });
  await page.route("**/api/dsa/execution-capabilities?**", (route) =>
    route.fulfill({
      json: {
        ...available,
        languages: ["python"],
        ...(!available.submit
          ? { submitReason: "Hidden suite is not certified." }
          : {}),
      },
    }),
  );
  await page.addInitScript(
    ({ key, code }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ schema: 1, code, approach: "" }),
      );
    },
    {
      key: `reasonai:dsa:draft:1:test-user-id:${problemId}:${problemVersionId}:python`,
      code,
    },
  );
}
test("Run renders queued/running/real public results and keeps them across layouts", async ({
  authenticatedPage: page,
}) => {
  await setup(page);
  let polls = 0;
  const requests: ExecutionRequest[] = [];
  await page.route("**/api/dsa/executions", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, json: job("queued") });
  });
  await page.route(`**/api/dsa/executions/${submissionId}`, (route) =>
    route.fulfill({
      json:
        ++polls === 1
          ? job("running")
          : {
              ...job("completed"),
              result: {
                verdict: "passed_public_tests",
                totalTests: 1,
                passedTests: 1,
                executionTimeMs: 14,
                publicCases: [
                  {
                    id: "public-one",
                    input: { nums: [1, 2] },
                    expectedOutput: 3,
                    actualOutput: 3,
                    verdict: "passed_public_tests",
                    stdout: "user diagnostic",
                  },
                ],
              },
            },
    }),
  );
  await page.goto(url);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Execution (queued|running)/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Execution completed" }),
  ).toBeVisible();
  await expect(page.getByText("1 / 1 tests passed")).toBeVisible();
  await expect(
    page.getByText("user diagnostic", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Workspace layout").selectOption("classic");
  await expect(page.getByText("1 / 1 tests passed")).toBeVisible();
  expect(requests[0]).toMatchObject({
    problemId,
    problemVersionId,
    mode: "run",
    language: "python",
    code,
  });
  expect(requests[0]).not.toHaveProperty("userId");
});
test("Submit displays only aggregates, while uncertified submission stays disabled", async ({
  authenticatedPage: page,
}) => {
  await setup(page);
  await page.route("**/api/dsa/executions", (route) =>
    route.fulfill({ status: 202, json: job("queued", "submit") }),
  );
  await page.route(`**/api/dsa/executions/${submissionId}`, (route) =>
    route.fulfill({
      json: {
        ...job("completed", "submit"),
        result: {
          verdict: "accepted",
          totalTests: 2,
          passedTests: 2,
          publicCases: [
            {
              input: "NEVER_SHOW_HIDDEN_DATA",
              stdout: "NEVER_SHOW_HIDDEN_LOG",
            },
          ],
        },
      },
    }),
  );
  await page.goto(url);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("accepted", { exact: true })).toBeVisible();
  await expect(page.getByText("NEVER_SHOW_HIDDEN_DATA")).toHaveCount(0);
  await expect(page.getByText("NEVER_SHOW_HIDDEN_LOG")).toHaveCount(0);
  await page.route("**/api/dsa/execution-capabilities?**", (route) =>
    route.fulfill({
      json: {
        run: true,
        submit: false,
        languages: ["python"],
        submitReason: "Hidden suite is not certified.",
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toBeDisabled();
});
test("unknown create response retries the original code/key after refresh", async ({
  authenticatedPage: page,
}) => {
  await setup(page);
  const requests: ExecutionRequest[] = [];
  await page.route("**/api/dsa/executions", (route) => {
    requests.push(route.request().postDataJSON());
    return requests.length === 1
      ? route.abort("failed")
      : route.fulfill({ status: 202, json: job("queued") });
  });
  await page.route(`**/api/dsa/executions/${submissionId}`, (route) =>
    route.fulfill({ json: job("completed") }),
  );
  await page.goto(url);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry execution request" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.getByRole("button", { name: "Retry execution request" }).click();
  await expect(
    page.getByRole("heading", { name: "Execution completed" }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});
test("cancellation stays requested until the backend confirms terminal status", async ({
  authenticatedPage: page,
}) => {
  await setup(page);
  let cancelled = false;
  await page.route("**/api/dsa/executions", (route) =>
    route.fulfill({ status: 202, json: job("queued") }),
  );
  await page.route(`**/api/dsa/executions/${submissionId}`, async (route) => {
    if (route.request().method() === "DELETE") {
      cancelled = true;
      return route.fulfill({ status: 202, json: job("running") });
    }
    return route.fulfill({ json: job(cancelled ? "cancelled" : "running") });
  });
  await page.goto(url);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Cancel execution" }).click();
  await expect(
    page.getByRole("heading", { name: "Execution cancelled" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
});
test("refresh recovers the durable job and never creates a duplicate execution", async ({
  authenticatedPage: page,
}) => {
  await setup(page);
  let posts = 0,
    completed = false;
  await page.route("**/api/dsa/executions", (route) => {
    posts++;
    return route.fulfill({ status: 202, json: job("queued") });
  });
  await page.route(`**/api/dsa/executions/${submissionId}`, (route) =>
    route.fulfill({ json: job(completed ? "completed" : "running") }),
  );
  await page.goto(url);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Execution running" }),
  ).toBeVisible();
  completed = true;
  await page.reload();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Execution completed" }),
  ).toBeVisible();
  expect(posts).toBe(1);
});
test("execution API rejects anonymous and cross-origin requests even with an E2E login cookie", async ({
  request,
}) => {
  const anonymous = await request.post("/api/dsa/executions", {
    data: {},
    headers: { Cookie: "e2e-bypass-auth=1" },
  });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["content-type"]).toContain("application/json");
  const crossOrigin = await request.post("/api/dsa/executions", {
    data: {},
    headers: { Origin: "https://evil.example" },
  });
  expect(crossOrigin.status()).toBe(403);
  expect((await request.get("/api/dsa/execution-recovery")).status()).toBe(401);
});
