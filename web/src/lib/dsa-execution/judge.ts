import type {
  ExecutionResult,
  Verdict,
} from "@/features/dsa/execution/contract";
import {
  ExecutionError,
  MAX_INPUT_BYTES,
  planSchema,
  type EvaluationPlan,
  type OperationResult,
} from "./types";

import { safeJson, equal } from "./public-comparator";
export { safeJson, equal };

export function validatePlan(raw: unknown): EvaluationPlan {
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success)
    throw new ExecutionError(
      "CONTRACT_UNAVAILABLE",
      "This version does not have a supported certified execution contract.",
      409,
    );
  const plan = parsed.data;
  if (
    !plan.cases.every(
      (item) => safeJson(item.input) && safeJson(item.expected),
    ) ||
    Buffer.byteLength(JSON.stringify(plan.cases.map(({ input }) => input))) >
      MAX_INPUT_BYTES ||
    new Set(plan.cases.map((item) => item.id)).size !== plan.cases.length ||
    plan.cases.some(
      (item) => Buffer.byteLength(JSON.stringify(item.expected)) > 8192,
    ) ||
    plan.cases.some(({ input }) =>
      plan.contract.inputMode === "args"
        ? !Array.isArray(input)
        : plan.contract.inputMode === "kwargs"
          ? !input || typeof input !== "object" || Array.isArray(input)
          : false,
    )
  ) {
    throw new ExecutionError(
      "CONTRACT_UNAVAILABLE",
      "The certified fixtures are outside the supported execution limits.",
      409,
    );
  }
  return plan;
}
export function judge(
  plan: EvaluationPlan,
  operation: OperationResult,
  mode: "run" | "submit",
  wallTimeMs: number,
): ExecutionResult {
  // VM output contains actual values only. Expectations and comparison stay here.
  const rows = operation.cases;
  if (
    !rows ||
    rows.length !== plan.cases.length ||
    rows.some((row, index) => row.id !== plan.cases[index].id)
  ) {
    return {
      verdict: operation.timedOut ? "time_limit_exceeded" : "runtime_error",
      wallTimeMs,
    };
  }
  const results = rows.map((row, index) => {
    const fixture = plan.cases[index];
    const verdict: Verdict =
      row.status === "ok"
        ? equal(row.actual, fixture.expected, plan.contract, fixture.input)
          ? "passed_public_tests"
          : "wrong_answer"
        : row.status;
    return {
      id: fixture.id,
      input: fixture.input,
      expectedOutput: fixture.expected,
      ...(row.status === "ok" ? { actualOutput: row.actual } : {}),
      verdict,
      ...(row.stdout ? { stdout: row.stdout.slice(0, 4096) } : {}),
      ...(row.stderr ? { stderr: row.stderr.slice(0, 4096) } : {}),
      executionTimeMs: row.executionTimeMs,
      memoryKiB: row.memoryKiB,
    };
  });
  const passed = results.filter(
    (row) => row.verdict === "passed_public_tests",
  ).length;
  const verdict =
    results.find((row) => row.verdict !== "passed_public_tests")?.verdict ??
    (mode === "submit" ? "accepted" : "passed_public_tests");
  const executionTimeMs = rows.reduce(
    (sum, row) => sum + (row.executionTimeMs ?? 0),
    0,
  );
  const memoryKiB = operation.memoryKiB;
  return {
    verdict,
    wallTimeMs,
    executionTimeMs,
    memoryKiB,
    ...(mode === "run" || plan.exposeCounts
      ? { passedTests: passed, totalTests: results.length }
      : {}),
    ...(mode === "run" ? { publicCases: results } : {}),
  };
}
