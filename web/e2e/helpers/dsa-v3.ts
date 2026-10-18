import type { Page } from "@playwright/test";
import type { Problem } from "../../src/features/dsa/workspace/api";
import { createPagination, createProfile } from "./factories";
export const ID = "10000000-0000-4000-8000-000000000001",
  VERSION = "20000000-0000-4000-8000-000000000001",
  CATEGORY = "30000000-0000-4000-8000-000000000001";
export const canonical = `/dsa/problem/array-total?version=${VERSION}`;
export const baseProblem: Problem = {
  id: ID,
  problem_version_id: VERSION,
  slug: "array-total",
  title: "Array total",
  difficulty: "easy",
  availability: "available",
  categories: [{ id: CATEGORY, slug: "arrays", name: "Arrays" }],
  topics: [
    {
      id: "50000000-0000-4000-8000-000000000001",
      slug: "two-pointers",
      name: "Two Pointers",
    },
  ],
  description: "Return the sum of every number in the array.",
  constraints: [],
  function_contract: {
    function: "solve",
    input: { nums: "list[int]" },
    output: "int",
  },
  examples: [{ input: { nums: [1, 2] }, output: 3 }],
  supported_contract_languages: ["python"],
};
export function makeProblems(count: number): Problem[] {
  return Array.from({ length: count }, (_, i) => ({
    ...baseProblem,
    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    problem_version_id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    slug: i === 0 ? "array-total" : `problem-${i + 1}`,
    title:
      i === 0 ? "Array total" : `Problem ${String(i + 1).padStart(3, "0")}`,
    difficulty: (["easy", "medium", "hard"] as const)[i % 3],
  }));
}
export async function installV3API(
  page: Page,
  options: {
    count?: number;
    metadataUnavailable?: boolean;
    bookmarked?: boolean;
  } = {},
) {
  const problems = makeProblems(options.count ?? 4),
    calls: URL[] = [];
  let board = {
    categoryId: CATEGORY,
    rowVersion: 0,
    layout: {
      schema: 1,
      lanes: {
        easy: [] as string[],
        medium: [] as string[],
        hard: [] as string[],
      },
      collections: [] as Array<{
        id: string;
        title: string;
        problemIds: string[];
      }>,
    },
  };
  let failSave = false;
  let bookmarked = options.bookmarked === false ? [] : [ID];
  await page.route("**/api/v1/me", (r) => r.fulfill({ json: createProfile() }));
  await page.route("**/api/dsa/learner-progress", (r) =>
    r.fulfill({
      json: {
        items: problems.map((p, i) => ({
          problemId: p.id,
          problemVersionId: p.problem_version_id,
          categoryIds: [CATEGORY],
          learningStatus: i === 0 ? "mastered" : "new",
          executionStatus: i === 0 ? "solved" : null,
          previousVersionPassed: false,
        })),
      },
    }),
  );
  await page.route("**/api/v1/me/bookmarks/*", (r) => {
    bookmarked = r.request().method() === "DELETE" ? [] : [ID];
    return r.fulfill({ json: { changed: true } });
  });
  await page.route("**/api/v1/dsa/**", (r) => {
    const u = new URL(r.request().url());
    calls.push(u);
    const path = u.pathname;
    let json: unknown;
    if (path.endsWith("/categories"))
      json = {
        items: [
          { ...baseProblem.categories[0], problem_count: problems.length },
          {
            id: CATEGORY.slice(0, -1) + "2",
            slug: "graphs",
            name: "Graphs",
            problem_count: 0,
          },
        ],
      };
    else if (path.endsWith("/topics"))
      json = {
        items: baseProblem.topics.map((topic) => ({
          ...topic,
          problem_count: problems.length,
        })),
      };
    else if (path.endsWith("/topic-progress"))
      json = {
        items: [{ id: CATEGORY, attempted_count: 2, mastered_count: 1 }],
      };
    else if (path.endsWith("/statistics"))
      json = {
        total_catalog_problems: problems.length,
        attempted_problem_count: 2,
        mastered_problem_count: 1,
        practice_attempt_count: 2,
        learning_status_counts: {},
        self_reported_solved_attempt_count: 0,
      };
    else if (path.endsWith("/me/progress"))
      json = {
        items: [{ content_item_id: ID, status: "mastered" }],
        pagination: createPagination(1),
      };
    else if (path.endsWith("/progress"))
      json = {
        content_item_id: ID,
        status: "new",
        confidence: 0,
        row_version: 0,
        updated_at: null,
        last_opened_at: null,
      };
    else if (path.endsWith("/bookmarks"))
      json = {
        items: bookmarked.map((id) => ({ content_item_id: id })),
        pagination: createPagination(bookmarked.length),
      };
    else if (path.endsWith("/notes"))
      json = { items: [], pagination: createPagination() };
    else if (path.endsWith("/test-cases"))
      json = {
        problem_version_id: VERSION,
        items: [],
        has_verified_public_tests: false,
        has_more: false,
        next_cursor: null,
      };
    else if (path.endsWith("/problems")) {
      const start = Number(u.searchParams.get("cursor") ?? 0),
        size = Number(u.searchParams.get("limit") ?? 50);
      json = {
        items: problems.slice(start, start + size),
        has_more: start + size < problems.length,
        next_cursor:
          start + size < problems.length ? String(start + size) : null,
      };
    } else
      json = {
        ...baseProblem,
        problem_version_id: u.searchParams.get("problem_version_id") ?? VERSION,
      };
    return r.fulfill({ json });
  });
  await page.route("**/api/dsa/boards/*", (r) => {
    if (options.metadataUnavailable)
      return r.fulfill({
        status: 503,
        json: { error: "Storage migration pending." },
      });
    if (r.request().method() === "PUT") {
      if (failSave) {
        failSave = false;
        return r.fulfill({
          status: 409,
          json: { error: "Changed in another session." },
        });
      }
      const change = r.request().postDataJSON();
      if (change.rowVersion !== board.rowVersion)
        return r.fulfill({ status: 409, json: { error: "Conflict" } });
      board = {
        ...board,
        rowVersion: board.rowVersion + 1,
        layout: change.layout,
      };
    }
    return r.fulfill({ json: board });
  });
  await page.route("**/api/dsa/board-companies", (r) =>
    options.metadataUnavailable
      ? r.fulfill({ status: 503, json: { error: "Metadata pending." } })
      : r.fulfill({
          json: {
            items: problems.map((p, i) => ({
              problemVersionId: p.problem_version_id,
              slug: i % 2 ? "amazon" : "google",
              name: i % 2 ? "Amazon" : "Google",
            })),
          },
        }),
  );
  await page.route("**/api/dsa/execution-capabilities?**", (r) =>
    r.fulfill({
      json: {
        run: false,
        submit: false,
        languages: [],
        runReason: "Not certified",
        submitReason: "Not certified",
      },
    }),
  );
  await page.route("**/api/dsa/practice-submissions?**", (r) =>
    r.fulfill({ json: { latest: null } }),
  );
  return {
    calls,
    problems,
    failNextSave: () => {
      failSave = true;
    },
    getBoard: () => board,
  };
}
