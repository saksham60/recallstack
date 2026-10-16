import { expect, test } from "./fixtures/authenticated-test";
import type { Page } from "@playwright/test";
import { createPagination, createProfile } from "./helpers/factories";
import { setupAuth } from "./helpers/auth";
import { visualLesson } from "./helpers/dsa-visual";
import type { Problem } from "../src/features/dsa/workspace/api";

const ID = "10000000-0000-4000-8000-000000000001",
  VERSION = "20000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const problem: Problem = {
  id: ID,
  problem_version_id: VERSION,
  slug: "array-total",
  title: "Array total",
  difficulty: "easy",
  availability: "available",
  categories: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      name: "Arrays",
      slug: "arrays",
    },
  ],
  topics: [],
  description:
    "Return the sum of all integers in the array.\n\nKeep the input unchanged.",
  function_contract: {
    function: "array_total",
    input: { nums: "array of integers" },
    output: "integer",
  },
  constraints: ["0 ≤ nums.length ≤ 10000"],
  examples: [{ input: { nums: [1, 2, 3] }, output: 6 }],
  supported_contract_languages: ["python", "typescript"],
};
const second = {
  ...problem,
  id: OTHER,
  slug: "binary-search",
  title: "Binary search",
};
const KEY = `reasonai:dsa:draft:1:test-user-id:${ID}:${VERSION}:python`;
const path = `/dsa?problem=${ID}&version=${VERSION}`;

async function installAPI(page: Page) {
  await page.route("**/api/dsa/execution-capabilities?**", (route) => route.fulfill({ json: { run: false, submit: false, languages: [], runReason: "Code execution is not enabled.", submitReason: "Judged submissions are not enabled." } }));
  const calls: {
    path: string;
    query: URLSearchParams;
    method: string;
    body: Record<string, unknown> | null;
    auth?: string;
  }[] = [];
  let notes: {
    id: string;
    content_item_id: string;
    title: string | null;
    body: string;
    kind: string;
    row_version: number;
    created_at: string;
    updated_at: string;
  }[] = [];
  let progress = {
    content_item_id: ID,
    status: "new",
    confidence: 0,
    row_version: 0,
    updated_at: null,
    last_opened_at: null,
  };
  let bookmarked = false;
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: createProfile() }),
  );
  await page.route("**/api/v1/dsa/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method(),
      body = method === "GET" ? null : request.postDataJSON();
    calls.push({
      path: url.pathname,
      query: url.searchParams,
      method,
      body,
      auth: request.headers().authorization,
    });
    let json: unknown;
    if (url.pathname.endsWith("/capabilities"))
      json = {
        catalog: true,
        progress: true,
        bookmarks: true,
        notes: true,
        practice_history: true,
        sandbox_execution: false,
        ai_tutoring: false,
        execution_languages: [],
        published_contract_languages: [],
        configured_runtime_languages: [],
      };
    else if (url.pathname.endsWith("/statistics"))
      json = {
        total_catalog_problems: 2,
        attempted_problem_count: 0,
        practice_attempt_count: 0,
        mastered_problem_count: 0,
        self_reported_solved_attempt_count: 0,
        learning_status_counts: {},
      };
    else if (url.pathname.endsWith("/categories"))
      json = { items: [{ ...problem.categories[0], problem_count: 2 }] };
    else if (url.pathname.endsWith("/topics")) json = { items: [] };
    else if (url.pathname.endsWith("/test-cases"))
      json = {
        problem_version_id: VERSION,
        items: [],
        has_verified_public_tests: false,
        next_cursor: null,
        has_more: false,
      };
    else if (url.pathname.endsWith("/me/progress"))
      json = { items: [progress], pagination: createPagination(1) };
    else if (url.pathname.endsWith("/progress")) {
      if (method === "PATCH")
        progress = {
          ...progress,
          ...body,
          row_version: progress.row_version + 1,
        };
      json = progress;
    } else if (url.pathname.endsWith("/bookmarks") && method === "GET")
      json = {
        items: bookmarked
          ? [
              {
                content_item_id: ID,
                slug: problem.slug,
                title: problem.title,
                created_at: "2026-10-15T00:00:00Z",
              },
            ]
          : [],
        pagination: createPagination(bookmarked ? 1 : 0),
      };
    else if (url.pathname.includes("/bookmarks") && method !== "GET") {
      bookmarked = method === "POST";
      if (method === "DELETE") return route.fulfill({ status: 204 });
      json = { changed: true, sync_cursor: 1 };
    } else if (url.pathname.endsWith("/notes") && method === "GET")
      json = { items: notes, pagination: createPagination(notes.length) };
    else if (url.pathname.includes("/notes") && method !== "GET") {
      if (method === "POST") {
        const note = {
          id: "40000000-0000-4000-8000-000000000001",
          content_item_id: ID,
          title: null,
          body: "",
          kind: "note",
          ...body,
          row_version: 1,
          created_at: "2026-10-15T00:00:00Z",
          updated_at: "2026-10-15T00:00:00Z",
        };
        notes.push(note);
        json = note;
      } else if (method === "PATCH") {
        notes = notes.map((note) => ({
          ...note,
          ...body,
          row_version: note.row_version + 1,
        }));
        json = notes[0];
      } else {
        notes = [];
        return route.fulfill({ status: 204 });
      }
    } else if (url.pathname.endsWith("/problems")) {
      const search = url.searchParams.get("search"),
        cursor = url.searchParams.get("cursor");
      const items = search
        ? [problem, second].filter((item) =>
            item.title.toLowerCase().includes(search.toLowerCase()),
          )
        : cursor
          ? [second]
          : [problem];
      json = {
        items,
        has_more: !search && !cursor,
        next_cursor: !search && !cursor ? "next-page" : null,
      };
    } else
      json = {
        ...(url.pathname.endsWith(OTHER) ? second : problem),
        problem_version_id:
          url.searchParams.get("problem_version_id") ?? VERSION,
      };
    await route.fulfill({ json });
  });
  return calls;
}
async function enterCode(page: Page, code: string) {
  const input = page.getByRole("textbox", {
    name: "Solution code",
    exact: true,
  });
  await expect(input).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await input.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "{}").code,
        KEY,
      ),
    )
    .toBe(code);
}

test("Python starter is shown only for missing drafts and reset restores it", async ({
  authenticatedPage: page,
}) => {
  await installAPI(page);
  await page.goto(path);
  const editorLines = page.locator(".monaco-editor .view-lines");
  await expect(editorLines).toContainText("def array_total(*args, **kwargs):");
  await expect(editorLines).toContainText("NotImplementedError");

  await enterCode(page, "def array_total(nums): return sum(nums)");
  await page.reload();
  await expect(editorLines).toContainText("return sum(nums)");

  await page.getByRole("button", { name: "Reset code" }).click();
  await page.getByRole("button", { name: "Reset draft" }).click();
  await expect(editorLines).toContainText("def array_total(*args, **kwargs):");

  // Explicitly saved empty code is a user draft, not a missing draft.
  await page.evaluate(
    (key) => localStorage.setItem(
      key,
      JSON.stringify({ schema: 1, code: "", approach: "" }),
    ),
    KEY,
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Insert starter code" })).toBeVisible();
  await page.getByRole("button", { name: "Insert starter code" }).click();
  await expect(editorLines).toContainText("def array_total(*args, **kwargs):");
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").code, KEY),
    )
    .toContain("NotImplementedError");
});

test("explorer debounces filters, uses opaque cursors and opens the exact canonical version", async ({
  authenticatedPage: page,
}) => {
  const calls = await installAPI(page);
  await page.goto("/dsa");
  await expect(
    page.getByRole("dialog", { name: "Problem explorer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more problems" }).click();
  await expect(
    page.getByRole("button", { name: /Binary search/ }),
  ).toBeVisible();
  expect(
    calls.some((call) => call.query.get("cursor") === "next-page"),
  ).toBeTruthy();
  await page.getByLabel("Search problems").fill("array");
  await page.getByLabel("Difficulty filter").selectOption("easy");
  await expect(page.getByRole("button", { name: /Binary search/ })).toHaveCount(
    0,
  );
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.query.get("search") === "array" &&
          call.query.get("difficulty") === "easy" &&
          !call.query.has("cursor"),
      ),
    )
    .toBeTruthy();
  await page.getByRole("button", { name: /Array total/ }).click();
  await expect(
    page.getByRole("heading", { name: "Array total", exact: true }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`problem=${ID}&version=${VERSION}`));
  expect(
    calls.some(
      (call) =>
        call.path.endsWith(ID) &&
        call.query.get("problem_version_id") === VERSION,
    ),
  ).toBeTruthy();
});

test("Monaco drafts, cursor, examples and tutor conversation survive layout changes and refresh", async ({
  authenticatedPage: page,
}) => {
  const calls = await installAPI(page);
  const tutorRequests: Record<string, unknown>[] = [];
  await page.route("**/api/reasonai/dsa/chat", (route) => {
    tutorRequests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        text: "Consider the accumulator invariant.",
        sources: [],
        webStatus: "off",
      },
    });
  });
  await page.goto(path);
  await enterCode(page, "def array_total(nums):\n    return sum(nums)");
  await page
    .getByLabel("My approach", { exact: true })
    .fill("Accumulate without changing the array.");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(
    page.getByText("Consider the accumulator invariant.", { exact: true }),
  ).toBeVisible();
  expect(tutorRequests[0]).toMatchObject({
    context: {
      contentId: ID,
      userCode: "def array_total(nums):\n    return sum(nums)",
      userApproach: "Accumulate without changing the array.",
    },
  });
  await page.getByLabel("Workspace layout").selectOption("classic");
  await expect(
    page.getByText("Consider the accumulator invariant.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Workspace layout").selectOption("visual");
  await expect(
    page.getByRole("heading", { name: "See the idea take shape" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "AI Tutor", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Consider the accumulator invariant.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Workspace layout").selectOption("judgment");
  await page.getByLabel("Editor language").selectOption("typescript");
  await expect(
    page.getByText("Consider the accumulator invariant.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Editor language").selectOption("python");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "return sum(nums)",
  );
  const separator = page.getByRole("separator", {
    name: "Resize specification",
    exact: true,
  });
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "36");
  await page.reload();
  await expect(page.getByLabel("My approach", { exact: true })).toHaveValue(
    "Accumulate without changing the array.",
  );
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "return sum(nums)",
  );
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).view.cursorState.length,
      KEY,
    ),
  ).toBeGreaterThan(0);
  expect(
    calls
      .filter((call) => call.path.endsWith("test-cases"))
      .every((call) => call.query.get("problem_version_id") === VERSION),
  ).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toBeEnabled();
});

test("drafts are isolated by problem, version, language and account; reset requires confirmation", async ({
  authenticatedPage: page,
}) => {
  await installAPI(page);
  await page.goto(path);
  await enterCode(page, "print('private draft')");
  await page.getByRole("button", { name: "Reset code" }).click();
  await page.getByRole("button", { name: "Keep code" }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "private draft",
  );
  await page.goto(`/dsa?problem=${OTHER}&version=${VERSION}`);
  await expect(
    page.getByRole("heading", { name: "Binary search", exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText(
    "private draft",
  );
  await page.goto(path);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "private draft",
  );
  await page.getByLabel("Editor language").selectOption("typescript");
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText(
    "private draft",
  );
  await page.getByLabel("Editor language").selectOption("python");
  await page.getByRole("button", { name: "Reset code" }).click();
  await page.getByRole("button", { name: "Reset draft", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).code, KEY),
    )
    .toContain("def array_total(*args, **kwargs):");
  await enterCode(page, "print('account one')");
  await page.goto(
    `/dsa?problem=${ID}&version=20000000-0000-4000-8000-000000000002`,
  );
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText(
    "account one",
  );
  await page.goto(path);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "account one",
  );
  await setupAuth(page, { id: "second-user" });
  await page.reload();
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText(
    "account one",
  );
});

test("notes, progress and bookmarks use authenticated learner APIs with row versions", async ({
  authenticatedPage: page,
}) => {
  const calls = await installAPI(page);
  await page.goto(path);
  await page
    .getByRole("button", { name: "Bookmark problem", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove bookmark" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByLabel("Learning status").selectOption("learning");
  await expect(page.getByLabel("Learning status")).toHaveValue("learning");
  await page.getByLabel("Note title").fill("Invariant");
  await page
    .getByLabel("Note body")
    .fill("The accumulator contains the processed prefix.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Invariant", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Invariant" }).click();
  await page.getByLabel("Note body").fill("Retain the prefix sum.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Retain the prefix sum.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete Invariant" }).click();
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Invariant", exact: true }),
  ).toHaveCount(0);
  expect(
    calls.find(
      (call) => call.method === "PATCH" && call.path.endsWith("progress"),
    )?.body,
  ).toMatchObject({ row_version: 0, status: "learning" });
  expect(
    calls.find(
      (call) => call.method === "PATCH" && call.path.includes("/notes/"),
    )?.body,
  ).toMatchObject({ row_version: 1 });
  expect(
    calls.find(
      (call) => call.method === "DELETE" && call.path.includes("/notes/"),
    )?.body,
  ).toEqual({ row_version: 2 });
  expect(
    calls
      .filter((call) => call.path.includes("/me/"))
      .every((call) => call.auth?.startsWith("Bearer ")),
  ).toBeTruthy();
});

test("reviewer denial, empty approved fixtures and unavailable specifications have truthful states", async ({
  authenticatedPage: page,
}) => {
  await installAPI(page);
  await page.goto(path);
  await page
    .getByRole("button", { name: "Approved tests", exact: true })
    .click();
  await expect(
    page.getByText("No approved public tests are available for this version."),
  ).toBeVisible();
  await page.route("**/api/v1/dsa/problems?**", (route) =>
    route.fulfill({
      status: 403,
      json: { detail: "Reviewer access required" },
    }),
  );
  await page.goto("/dsa?preview=true");
  await expect(
    page.getByText("You do not have permission to perform this action."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Array total/ })).toHaveCount(
    0,
  );
  await page.route(`**/api/v1/dsa/problems/${ID}?**`, (route) =>
    route.fulfill({ status: 404, json: { detail: "Unavailable version" } }),
  );
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Problem unavailable" }),
  ).toBeVisible();
});

test("responsive browser panels preserve code and display without horizontal overflow", async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAPI(page);
  await page.goto(path);
  const navigation = page.getByRole("navigation", { name: "Workspace panels" });
  await navigation.getByRole("button", { name: "Code", exact: true }).click();
  await enterCode(page, "print('mobile browser')");
  // Keep the development-only Next.js badge clear of the first navigation item.
  await page.addStyleTag({
    content:
      "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  for (const label of ["Spec", "Canvas", "AI Tutor", "Tests", "Code"])
    await navigation.getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "mobile browser",
  );
  await page.screenshot({
    path: "test-results/dsa-studio-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .map((element) => ({
        tag: element.tagName,
        class: element.className.toString(),
        right: element.getBoundingClientRect().right,
      }))
      .filter((element) => element.right > innerWidth + 1),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    JSON.stringify(overflow),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/dsa-studio-mobile.png",
    fullPage: true,
  });
});

test("desktop reference layout is rendered with local Monaco assets and no page errors", async ({
  authenticatedPage: page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installAPI(page);
  await page.goto(path);
  await enterCode(
    page,
    "def array_total(nums):\n    total = 0\n    for value in nums:\n        total += value\n    return total",
  );
  await expect(
    page.getByRole("heading", { name: "Array total", exact: true }).first(),
  ).toBeVisible();
  await page.addStyleTag({
    content:
      "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/dsa-studio-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((resource) => resource.name.includes("/monaco/vs/")),
    ),
  ).toBeTruthy();
});

test("approved public fixtures paginate separately from statement examples", async ({
  authenticatedPage: page,
}) => {
  await installAPI(page);
  const fixtureQueries: URLSearchParams[] = [];
  await page.route(`**/api/v1/dsa/problems/${ID}/test-cases?**`, (route) => {
    const query = new URL(route.request().url()).searchParams;
    fixtureQueries.push(query);
    return route.fulfill({
      json: {
        problem_version_id: VERSION,
        items: [
          {
            id: query.has("cursor") ? "case-two" : "case-one",
            input_json: query.has("cursor") ? { nums: [] } : { nums: [-3, 3] },
            expected_output_json: query.has("cursor") ? null : 0,
          },
        ],
        has_verified_public_tests: true,
        next_cursor: query.has("cursor") ? null : "fixture-page-two",
        has_more: !query.has("cursor"),
      },
    });
  });
  await page.goto(path);
  await page
    .getByRole("button", { name: "Approved tests", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Public test 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more tests" }).click();
  await expect(
    page.getByRole("heading", { name: "Public test 2" }),
  ).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: /^null$/ })).toBeVisible();
  expect(
    fixtureQueries.every(
      (query) => query.get("problem_version_id") === VERSION,
    ),
  ).toBeTruthy();
  expect(fixtureQueries.at(-1)?.get("cursor")).toBe("fixture-page-two");
});

test("a stale note retains edits and explicitly loads the latest row version before retrying", async ({
  authenticatedPage: page,
}) => {
  await installAPI(page);
  const note = {
    id: "40000000-0000-4000-8000-000000000001",
    content_item_id: ID,
    title: "Concurrent note",
    kind: "note",
    body: "Old text",
    row_version: 1,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
  };
  await page.route(`**/api/v1/dsa/me/problems/${ID}/notes?**`, (route) =>
    route.fulfill({ json: { items: [note], pagination: createPagination(1) } }),
  );
  const versions: number[] = [];
  await page.route(`**/api/v1/dsa/me/notes/${note.id}`, (route) => {
    const body = route.request().postDataJSON();
    versions.push(body.row_version);
    if (versions.length === 1) {
      note.row_version = 2;
      note.body = "Changed elsewhere";
      return route.fulfill({
        status: 409,
        json: { detail: "This note changed elsewhere." },
      });
    }
    Object.assign(note, body, { row_version: 3 });
    return route.fulfill({ json: note });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Edit Concurrent note" }).click();
  await page.getByLabel("Note body").fill("Keep my unsaved insight");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "This note changed elsewhere." }),
  ).toBeVisible();
  await expect(page.getByLabel("Note body")).toHaveValue(
    "Keep my unsaved insight",
  );
  await page
    .getByRole("button", { name: "Load latest version and keep my edits" })
    .click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Keep my unsaved insight", { exact: true }),
  ).toBeVisible();
  expect(versions).toEqual([1, 2]);
});

test("unavailable browser storage is reported while the editor remains usable", async ({
  authenticatedPage: page,
}) => {
  await installAPI(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("reasonai:dsa:"))
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto(path);
  await page
    .getByLabel("My approach", { exact: true })
    .fill("This edit remains in memory.");
  await expect(
    page.getByText("Draft not saved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("My approach", { exact: true })).toHaveValue(
    "This edit remains in memory.",
  );
});

test("generated canvas lessons step and retain their state across layouts", async ({
  authenticatedPage: page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installAPI(page);
  await page.route("**/api/reasonai/dsa/chat", (route) =>
    route.fulfill({
      json: {
        text: "An illustrative walkthrough.",
        sources: [],
        webStatus: "off",
        visual: visualLesson,
      },
    }),
  );
  await page.goto(path);
  await page
    .getByRole("button", { name: "Canvas", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Create visual walkthrough" }).click();
  const canvas = page.locator(".studio-canvas");
  await expect(
    canvas.getByRole("heading", { name: visualLesson.title }),
  ).toBeVisible();
  await canvas.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(
    canvas.getByText("Move one position", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Workspace layout").selectOption("classic");
  await page.getByLabel("Workspace layout").selectOption("visual");
  await expect(
    canvas.getByText("Move one position", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});


test("workspace tutor modes, actions and persisted conversation use versioned current context", async ({ authenticatedPage: page }) => {
  await installAPI(page);
  const conversationId = "40000000-0000-4000-8000-000000000001";
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/reasonai/dsa/chat", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ headers: { "X-ReasonAI-Conversation-Id": conversationId }, json: { text: "Saved tutor reply.", sources: [], webStatus: "off" } });
  });
  let restored = 0;
  await page.route(`**/api/reasonai/conversations/${conversationId}`, route => {
    restored++;
    return route.fulfill({ json: { conversation: { id: conversationId, surface: "dsa", contextId: ID, messages: [{ role: "assistant", status: "completed", parts: [{ type: "text", text: "Saved tutor reply." }] }] } } });
  });
  await page.goto(path);
  await expect(page.getByLabel("Teaching mode")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explain my failed public test", exact: true })).toBeDisabled();
  await page.getByLabel("Teaching mode").selectOption("direct");
  await enterCode(page, "def array_total(nums): return 0");
  await page.getByRole("button", { name: "Explain the problem", exact: true }).click();
  await expect(page.getByText("Saved tutor reply.", { exact: true })).toBeVisible();
  expect(requests[0]).toMatchObject({ teachingMode: "direct", action: "explain", context: { contentId: ID, problemVersionId: VERSION, language: "python", preview: false, userCode: "def array_total(nums): return 0" } });
  await page.reload();
  await expect(page.getByText("Saved tutor reply.", { exact: true })).toBeVisible();
  expect(restored).toBe(1);
  await page.getByLabel("Ask ReasonAI").fill("What does my loop do?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ conversationId, context: { problemVersionId: VERSION } });
  await expect(page.getByText("Saved tutor reply.", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Clear chat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Explain the problem", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Explain the problem", exact: true })).toBeVisible();
  expect(restored).toBe(1);
});
