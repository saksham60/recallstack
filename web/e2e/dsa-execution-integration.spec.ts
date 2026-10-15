import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { SupabaseExecutionRepository } from "../src/lib/dsa-execution/repository";
import { createSandboxAdapter } from "../src/lib/dsa-execution/contree";
import {
  processExecution,
  RetryExecution,
} from "../src/lib/dsa-execution/worker";
import type { SandboxAdapter } from "../src/lib/dsa-execution/types";
import type { ExecutionRequest } from "../src/features/dsa/execution/contract";

test("worker repository uses HTTP RPC, real PostgreSQL leases, and trusted persisted results", async () => {
  test.skip(
    !process.env.DSA_EXECUTION_TEST_API_URL,
    "Launched by the isolated PostgreSQL test fixture.",
  );
  const endpoint = new URL(process.env.DSA_EXECUTION_TEST_API_URL!);
  expect(endpoint.hostname).toBe("127.0.0.1");
  const repository = new SupabaseExecutionRepository(
    createClient(endpoint.href, "local-test-service-role", {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
  const user = process.env.DSA_EXECUTION_TEST_USER!,
    problemId = process.env.DSA_EXECUTION_TEST_PROBLEM!,
    problemVersionId = process.env.DSA_EXECUTION_TEST_VERSION!;
  expect(await repository.availability(problemId, problemVersionId)).toEqual({
    run: true,
    submit: true,
  });
  const owned = new Set<string>();
  const base =
    process.env.DSA_LIVE_SANDBOX === "1" ? createSandboxAdapter() : undefined;
  const sandbox: SandboxAdapter = base
    ? {
        ...base,
        start: async (...args) => {
          const id = await base.start(...args);
          owned.add(id);
          return id;
        },
      }
    : {
        start: async () => crypto.randomUUID(),
        find: async () => undefined,
        cancel: async () => {},
        inspect: async () => {
          throw new Error("Per-job inspector must be set.");
        },
      };
  try {
    const problems = [
      { problemId, problemVersionId, code: "def solve(nums):\n    return sum(nums)" },
      { problemId: process.env.DSA_EXECUTION_TEST_SECOND_PROBLEM!, problemVersionId: process.env.DSA_EXECUTION_TEST_SECOND_VERSION!, code: "def solve(nums, target):\n    lo, hi = 0, len(nums)-1\n    while lo <= hi:\n        mid = (lo+hi)//2\n        if nums[mid] == target: return mid\n        if nums[mid] < target: lo = mid+1\n        else: hi = mid-1\n    return -1" },
    ];
    for (const problem of problems) for (const scenario of ["run", "submit", "wrong"] as const) {
      const mode = scenario === "submit" ? "submit" : "run";
      const request: ExecutionRequest = {
        ...problem,
        code: scenario === "wrong" ? "def solve(**kwargs): return 0" : problem.code,
        language: "python" as const,
        mode,
        idempotencyKey: crypto.randomUUID(),
      };
      const job = await repository.create(
        user,
        request,
        createHash("sha256").update(JSON.stringify(request)).digest("hex"),
      );
      if (!base) {
        const client = createClient(endpoint.href, "local-test-service-role");
        const { data } = await client.rpc("dsa_execution_command", {
          p_action: "availability",
          p_args: { problemId: problem.problemId, problemVersionId: problem.problemVersionId },
        });
        sandbox.inspect = async () => ({
          terminal: true,
          cases: data[mode].cases.map(
            (row: { id: string; input: { nums: number[]; target?: number } }) => ({
              id: row.id,
              actual: scenario === "wrong" ? 0 : row.input.target !== undefined ? row.input.nums.indexOf(row.input.target) : row.input.nums.reduce((a, b) => a + b, 0),
              status: "ok",
            }),
          ),
        });
      }
      await expect
        .poll(
          async () => {
            try {
              await processExecution(job.submissionId, repository, sandbox);
            } catch (error) {
              if (!(error instanceof RetryExecution)) throw error;
            }
            return (await repository.get(user, job.submissionId))?.status;
          },
          { timeout: 70000, intervals: [1000] },
        )
        .toBe("completed");
      const result = await repository.get(user, job.submissionId);
      expect(result?.result?.verdict).toBe(
        scenario === "wrong" ? "wrong_answer" : mode === "run" ? "passed_public_tests" : "accepted",
      );
      if (mode === "run") expect(result?.result?.publicCases).toHaveLength(1);
      else {
        expect(result?.result).not.toHaveProperty("publicCases");
        expect(result?.result).not.toHaveProperty("totalTests");
      }
    }
  } finally {
    for (const id of owned) {
      try {
        if (!(await sandbox.inspect(id)).terminal) await sandbox.cancel(id);
      } catch {
        await sandbox.cancel(id);
      }
    }
  }
});
