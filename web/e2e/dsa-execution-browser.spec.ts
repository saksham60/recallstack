import { expect, test } from "./fixtures/authenticated-test";
import type { Page } from "@playwright/test";
import { HARNESS_SHA256 } from "../src/lib/dsa-execution/python/harness.generated";
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
async function setup(page: Page, available = { run: true, submit: true }, caseCount = 1) {
  await page.route("**/dsa/python-worker.mjs", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `self.onmessage = (event) => {
        if (event.data.action === "initialize") return;
        const cases = event.data.cases;
        self.postMessage({harnessSha256: "${HARNESS_SHA256}", phase: "running", initializationMs: 1});
        self.postMessage({harnessSha256: "${HARNESS_SHA256}", results: cases.map(c => ({id: c.id, status: "ok", actual: 3, durationMs: 2})) });
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
        ...(available.run ? { publicRun: {
          schemaVersion: 1, problemId, problemVersionId,
          suiteId: "60000000-0000-4000-8000-000000000001",
          revision: "a".repeat(64), contractRevision: "b".repeat(64), harnessSha256: HARNESS_SHA256,
          contract: {entrypoint: "solve", inputMode: "kwargs", checker: "exact_json"},
          cases: Array.from({length:caseCount},(_,index)=>({id: `30000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`, input: {nums:[1,2]}, expected:3})),
        }} : {}),
        languages: ["python"],
        ...(!available.submit
          ? { submitReason: "No executable test suite is available." }
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
  await expect(page.getByText("Locally checked against public test cases. Submit independently runs the sandbox suite.")).toBeVisible();
  await page.getByLabel("Workspace layout").selectOption("classic");
  await expect(page.getByText("Local case 1 · Passed")).toBeVisible();
  expect(requests).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
});

test("Submit works without local Run and displays only judge aggregates", async ({
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
  // No browser Run, certificate unlock, or public test pass is necessary.
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
        submitReason: "No executable test suite is available.",
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
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
test("without an executable suite, Submit stays unavailable; practice receipts remain readable", async ({authenticatedPage: page}) => {
  const availability={run:false,submit:false};
  await setup(page, availability);
  let writes = 0;
  await page.route("**/api/dsa/practice-submissions**", r => {
    if (r.request().method() === "POST") writes++;
    return r.fulfill({json:{latest:{id:"77777777-0000-4000-8000-000000000001", createdAt:new Date().toISOString(), checkStatus:"examples_passed", clientCheckedCount:1, clientPassedCount:1, gradingLevel:"browser_examples_unverified"}}});
  });
  await page.goto(url);
  await expect(page.getByRole("button", {name:"Submit", exact:true})).toBeDisabled();
  await page.getByRole("button", {name:"Run",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Local Run · All displayed cases passed"})).toBeVisible();
  await expect(page.getByText("1/1 statement examples passed in this Run.",{exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"Test results"}).getByText("This problem does not currently have an executable test suite.",{exact:true})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Historical practice attempt"})).toBeHidden();
  await page.getByText("Earlier saved practice attempt",{exact:true}).click();
  await expect(page.getByRole("button", {name:"Submit", exact:true})).toBeDisabled();
  await expect(page.getByRole("heading", {name:"Historical practice attempt"})).toBeVisible();
  expect(writes).toBe(0);
  await page.reload();
  await page.getByRole("button", {name:"Results",exact:true}).click();
  await page.getByText("Earlier saved practice attempt",{exact:true}).click();
  await expect(page.getByRole("heading", {name:"Historical practice attempt"})).toBeVisible();
  await expect(page.getByRole("button", {name:"Submit",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Run",exact:true}).click();
  await expect(page.getByText("1/1 statement examples passed in this Run.",{exact:true})).toBeVisible();
  availability.run=true; availability.submit=true;
  await page.getByRole("button",{name:"Check submission availability",exact:true}).click();
  await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Run",exact:true}).click();
  await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeEnabled();
});

test("wheel over a local testcase scrolls the results pane and keyboard reaches the end", async ({authenticatedPage:page}) => {
  await page.setViewportSize({width:1280,height:720});
  await setup(page,{run:true,submit:true},12);
  await page.goto(url);
  await page.getByRole("button",{name:"Run",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Local Run · All displayed cases passed"})).toBeVisible();
  const scroll=page.locator(".studio-results > .studio-scroll:not([hidden])");
  const bounds=await scroll.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+Math.min(120,bounds!.height-20));
  await page.mouse.wheel(0,650);
  await expect.poll(()=>scroll.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  await scroll.focus();
  await page.keyboard.press("End");
  await expect.poll(()=>scroll.evaluate(node=>node.scrollHeight-node.clientHeight-node.scrollTop)).toBeLessThanOrEqual(1);
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
