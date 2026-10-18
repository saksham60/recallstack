import { test, expect } from "@playwright/test";
import {
  learnerProgressSchema,
  progressLabel,
  hasPassed,
  topicProgress,
  type LearnerProgress,
} from "../src/features/dsa/progress/contract";
const item: LearnerProgress = {
  problemId: "10000000-0000-4000-8000-000000000001",
  problemVersionId: "20000000-0000-4000-8000-000000000001",
  categoryIds: ["30000000-0000-4000-8000-000000000001"],
  learningStatus: "new",
  executionStatus: "solved",
  previousVersionPassed: false,
};
test("completion labels retain provenance, independent manual mastery and version identity", () => {
  expect(progressLabel(item)).toBe("Solved");
  expect(
    progressLabel({ ...item, executionStatus: "passed_current_tests" }),
  ).toBe("Passed current tests");
  expect(
    progressLabel({
      ...item,
      learningStatus: "mastered",
      executionStatus: null,
    }),
  ).toBe("Mastered");
  expect(
    hasPassed({ ...item, learningStatus: "mastered", executionStatus: null }),
  ).toBe(false);
  expect(hasPassed(item, "other-version")).toBe(false);
  expect(progressLabel(item, "other-version")).toBe(
    "Not started · Passed earlier version",
  );
  expect(
    progressLabel({
      ...item,
      executionStatus: "attempted",
      previousVersionPassed: true,
    }),
  ).toBe("Attempted · Passed earlier version");
  expect(progressLabel(undefined)).toBe("Not started");
  for (const state of [
    "execution_failed",
    "cancelled",
    "queued",
    "running",
    "attempted",
  ] as const)
    expect(hasPassed({ ...item, executionStatus: state })).toBe(false);
});
test("topic totals distinguish official, provisional and manual mastery without double counting categories", () => {
  const rows = [
    item,
    {
      ...item,
      executionStatus: "passed_current_tests" as const,
      learningStatus: "mastered" as const,
      categoryIds: [...item.categoryIds, ...item.categoryIds],
    },
    { ...item, executionStatus: "execution_failed" as const },
  ];
  expect(topicProgress(rows)).toEqual([
    {
      id: item.categoryIds[0],
      attempted_count: 2,
      mastered_count: 1,
      solved_count: 1,
      passed_count: 1,
    },
  ]);
  expect(topicProgress([])).toEqual([]);
});
test("projection contract rejects privileged fields, fabricated statuses and malformed IDs", () => {
  expect(learnerProgressSchema.safeParse({ items: [item] }).success).toBe(true);
  for (const invalid of [
    { ...item, sourceCode: "private" },
    { ...item, executionStatus: "certified" },
    { ...item, problemId: "bad" },
  ])
    expect(learnerProgressSchema.safeParse({ items: [invalid] }).success).toBe(
      false,
    );
});
