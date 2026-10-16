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
  await page.route("**/dsa/python-worker.mjs", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `self.onmessage = (event) => {
        const cases = event.data.cases;
        self.postMessage({ results: cases.map(c => ({id: c.id, ok: true, actual: 3, durationMs: 2})) });
      };`,
    }),
  );
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
          items: available.run ? [{
            id: "30000000-0000-4000-8000-000000000001",
            input_json: { nums: [1, 2] },
            expected_output_json: 3,
            visibility: "public",
          }] : [],
          next_cursor: null,
          has_more: false,
          has_verified_public_tests: available.run,
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
        examples: [{ input: { nums: [1, 2] }, output: 3 }],
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
test("Run executes Python locally and makes no execution POST", async ({
  authenticatedPage: page,
}) => {
  await setup(page);
  const requests: ExecutionRequest[] = [];
  await page.route("**/api/dsa/executions", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, json: job("queued") });
  });
  await page.goto(url);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Local Run · All displayed cases passed" })).toBeVisible();
  await expect(page.getByText("Locally checked against verified public fixtures. This is not hidden-test acceptance.")).toBeVisible();
  await page.getByLabel("Workspace layout").selectOption("classic");
  await expect(page.getByText("Local case 1 · Passed")).toBeVisible();
  expect(requests).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
});

test("Submit displays only trusted aggregates, with no required prior Run", async ({
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
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
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
  ).toBeEnabled();
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
  await expect(page.getByRole("heading", { name: "Local Run · All displayed cases passed" })).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Local Run · All displayed cases passed" })).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Local Run · All displayed cases passed" })).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
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
test("all uncertified problems allow direct Submit, storing persistent attempts", async ({
  authenticatedPage: page,
}) => {
  await setup(page, { run: false, submit: false });
  let receipt: Record<string, unknown> | null = null;
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/dsa/practice-submissions**", (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      receipt = {
        id: "77777777-0000-4000-8000-000000000001",
        createdAt: new Date().toISOString(),
        checkStatus: submitted?.checkStatus,
        clientCheckedCount: submitted?.clientCheckedCount,
        clientPassedCount: submitted?.clientPassedCount,
        gradingLevel: "browser_examples_unverified",
      };
      return route.fulfill({ status: 201, json: receipt });
    }
    return route.fulfill({ json: { latest: receipt } });
  });
  const remoteExecutions: unknown[] = [];
  await page.route("**/api/dsa/executions", (route) => {
    remoteExecutions.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { error: "Not certified" } });
  });
  await page.goto(url);
  const submitButton = page.getByRole("button", { name: "Submit", exact: true });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await expect(page.getByRole("heading", { name: "Submission recorded" })).toBeVisible();
  await expect(page.getByText(/3\/3 statement examples passed locally/)).toBeVisible();
  expect(submitted).toMatchObject({
    code,
    problemId,
    problemVersionId,
    language: "python",
    checkStatus: "examples_passed",
    clientCheckedCount: 1,
    clientPassedCount: 1,
  });
  expect(remoteExecutions).toHaveLength(0);
  await page.reload();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Submission recorded" })).toBeVisible();
});

test("practice Submit stores failed checks rather than falsely claiming acceptance", async ({
  authenticatedPage: page,
}) => {
  await setup(page, { run: false, submit: false });
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/dsa/python-worker.mjs", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `self.onmessage = e => self.postMessage({results:e.data.cases.map(c=>({id:c.id,ok:true,actual:-42}))});`,
    }),
  );
  await page.route("**/api/dsa/practice-submissions**", (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: {
        id: "77777777-0000-4000-8000-000000000002",
        createdAt: new Date().toISOString(),
        checkStatus: "examples_failed",
        clientCheckedCount: 1,
        clientPassedCount: 0,
        gradingLevel: "browser_examples_unverified",
      } });
    }
    return route.fulfill({ json: { latest: null } });
  });
  await page.goto(url);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Submission recorded" })).toBeVisible();
  expect(submitted).toMatchObject({
    checkStatus: "examples_failed",
    clientCheckedCount: 1,
    clientPassedCount: 0,
  });
  await expect(page.getByText(/not a hidden-test/)).toBeVisible();
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
