import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createSandboxAdapter } from "../src/lib/dsa-execution/contree";
import { judge } from "../src/lib/dsa-execution/judge";
import { HARNESS_SHA256 } from "../src/lib/dsa-execution/python/harness.generated";
import {
  planSchema,
  type OperationResult,
} from "../src/lib/dsa-execution/types";

test("explicitly opted-in canonical 3Sum shared-harness component proof in real Nebius", async () => {
  test.skip(
    process.env.DSA_V3_LIVE_COMPONENT !== "1",
    "Explicit opt-in only; shares the five-call budget with AI verification.",
  );
  test.setTimeout(120000);
  const source = JSON.parse(
    await readFile(".next/cache/dsa-v3-private/three-sum-source.json", "utf8"),
  );
  expect(source.problem.id).toBe("62b831b6-4c58-438e-9442-a78be83e3469");
  const local = JSON.parse(
    await readFile("../artifacts/dsa-v3-three-sum-local.json", "utf8"),
  );
  expect(local.fixtureResults).toHaveLength(source.cases.length);
  expect(
    local.fixtureResults.every(
      (row: { bothMatchExpected: boolean }) => row.bothMatchExpected,
    ),
  ).toBe(true);
  expect(local.harnessSha256).toBe(HARNESS_SHA256);
  const code =
    source.problem.provenance.reference_solution_python +
    "\n\ndef three_sum(values):\n    return solve({'values': values})\n";
  const proofPath = path.resolve("../artifacts/dsa-v3-live-component.json"),
    budgetPath = path.resolve("../artifacts/dsa-v3-live-budget.json");
  const proof = await readFile(proofPath, "utf8")
    .then(JSON.parse)
    .catch(() => undefined);
  if (
    proof?.passed &&
    proof.harnessSha256 === HARNESS_SHA256 &&
    proof.codeSha256 === createHash("sha256").update(code).digest("hex") &&
    proof.fixtureContentSha256 === local.fixtureContentSha256 &&
    proof.suiteId === source.problem.suite_id
  ) {
    expect(proof.componentVerdict).toBe("accepted");
    return;
  }
  const budget = await readFile(budgetPath, "utf8")
    .then(JSON.parse)
    .catch(() => ({
      schemaVersion: 1,
      maxCombinedCallsIncludingRetries: 5,
      callsUsed: 0,
      entries: [],
    }));
  expect(budget.callsUsed).toBeLessThan(5);
  expect(
    budget.entries.every(
      (entry: { status: string }) => entry.status !== "reserved-unknown",
    ),
  ).toBe(true);
  const componentId = crypto.randomUUID();
  const entry = {
    id: componentId,
    kind: "Nebius 3Sum component compatibility",
    status: "reserved-unknown",
    reservedAt: new Date().toISOString(),
    operationId: undefined as string | undefined,
  };
  budget.callsUsed++;
  budget.entries.push(entry);
  await writeFile(budgetPath, JSON.stringify(budget, null, 2) + "\n");
  const plan = planSchema.parse({
    problemId: local.problemId,
    problemVersionId: source.problem.id,
    suiteId: source.problem.suite_id,
    certificateId: componentId, // Local correlation marker only; NOT a production certificate.
    exposeCounts: false,
    contract: local.contract,
    cases: source.cases.map(
      (row: {
        id: string;
        input_json: unknown;
        expected_json: unknown;
        visibility: string;
      }) => ({
        id: row.id,
        input: row.input_json,
        expected: row.expected_json,
        visibility: row.visibility,
      }),
    ),
  });
  const adapter = createSandboxAdapter(),
    started = Date.now();
  let operation: OperationResult = { terminal: false };
  try {
    entry.operationId = await adapter.start(
      componentId,
      {
        problemId: plan.problemId,
        problemVersionId: plan.problemVersionId,
        language: "python",
        mode: "submit",
        code,
        idempotencyKey: crypto.randomUUID(),
      },
      plan,
    );
    entry.status = "operation-confirmed";
    await writeFile(budgetPath, JSON.stringify(budget, null, 2) + "\n");
    await expect
      .poll(
        async () => {
          operation = await adapter.inspect(entry.operationId!);
          return operation.terminal;
        },
        { timeout: 70000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    const result = judge(plan, operation, "submit", Date.now() - started);
    const evidence = {
      schemaVersion: 1,
      kind: "real-nebius-component-proof",
      componentId,
      operationId: entry.operationId,
      problemId: plan.problemId,
      problemVersionId: plan.problemVersionId,
      suiteId: plan.suiteId,
      harnessSha256: HARNESS_SHA256,
      fixtureContentSha256: local.fixtureContentSha256,
      codeSha256: createHash("sha256").update(code).digest("hex"),
      componentVerdict: result.verdict,
      actualCaseCount: operation.cases?.length ?? 0,
      executionTimeMs: result.executionTimeMs,
      memoryKiB: result.memoryKiB,
      elapsedMs: Date.now() - started,
      passed: result.verdict === "accepted",
      completedAt: new Date().toISOString(),
      persistedSubmission: false,
      productionMutations: 0,
      releaseE2EProven: false,
    };
    await writeFile(proofPath, JSON.stringify(evidence, null, 2) + "\n");
    entry.status = evidence.passed ? "passed" : "failed";
    await writeFile(budgetPath, JSON.stringify(budget, null, 2) + "\n");
    expect(result.verdict).toBe("accepted");
    expect(operation.cases).toHaveLength(source.cases.length);
  } finally {
    if (entry.operationId && !operation.terminal) {
      try {
        await adapter.cancel(entry.operationId);
      } catch {
        /* Unknown outcome remains reserved in the budget ledger. */
      }
    }
  }
});
