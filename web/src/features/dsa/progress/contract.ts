import { z } from "zod";

export const learnerProgressItemSchema = z
  .object({
    problemId: z.uuid(),
    problemVersionId: z.uuid(),
    categoryIds: z.array(z.uuid()),
    learningStatus: z.enum([
      "new",
      "learning",
      "attempted",
      "confident",
      "mastered",
    ]),
    executionStatus: z
      .enum([
        "solved",
        "passed_current_tests",
        "attempted",
        "queued",
        "running",
        "cancelled",
        "execution_failed",
      ])
      .nullable(),
    previousVersionPassed: z.boolean(),
  })
  .strict();
export const learnerProgressSchema = z
  .object({ items: z.array(learnerProgressItemSchema).max(10000) })
  .strict();
export type LearnerProgress = z.infer<typeof learnerProgressItemSchema>;

export function completionStatus(
  item: LearnerProgress | undefined,
  version?: string,
) {
  return item && (!version || item.problemVersionId === version)
    ? item.executionStatus
    : null;
}
export function hasPassed(item: LearnerProgress | undefined, version?: string) {
  return ["solved", "passed_current_tests"].includes(
    completionStatus(item, version) ?? "",
  );
}
export function progressLabel(
  item: LearnerProgress | undefined,
  version?: string,
) {
  const status = completionStatus(item, version);
  const labels = {
    solved: "Solved",
    passed_current_tests: "Passed current tests",
    attempted: "Attempted",
    queued: "Queued",
    running: "Judging",
    cancelled: "Cancelled",
    execution_failed: "Execution failed",
  };
  const previous =
    item?.previousVersionPassed ||
    (item && version && item.problemVersionId !== version && hasPassed(item));
  return `${status ? labels[status] : item?.learningStatus === "new" || !item ? "Not started" : item.learningStatus[0].toUpperCase() + item.learningStatus.slice(1)}${previous ? " · Passed earlier version" : ""}`;
}
export function topicProgress(items: LearnerProgress[]) {
  const totals = new Map<
    string,
    {
      id: string;
      attempted_count: number;
      mastered_count: number;
      solved_count: number;
      passed_count: number;
    }
  >();
  for (const item of items)
    for (const id of new Set(item.categoryIds)) {
      const total = totals.get(id) ?? {
        id,
        attempted_count: 0,
        mastered_count: 0,
        solved_count: 0,
        passed_count: 0,
      };
      if (
        ["attempted", "confident", "mastered"].includes(item.learningStatus) ||
        ["attempted", "solved", "passed_current_tests"].includes(
          item.executionStatus ?? "",
        )
      )
        total.attempted_count++;
      if (item.learningStatus === "mastered") total.mastered_count++;
      if (item.executionStatus === "solved") total.solved_count++;
      if (item.executionStatus === "passed_current_tests") total.passed_count++;
      totals.set(id, total);
    }
  return [...totals.values()];
}
export function progressCounts(items: LearnerProgress[]) {
  return (
    topicProgress(
      items.map((item) => ({ ...item, categoryIds: ["all"] })),
    )[0] ?? {
      attempted_count: 0,
      mastered_count: 0,
      solved_count: 0,
      passed_count: 0,
    }
  );
}
