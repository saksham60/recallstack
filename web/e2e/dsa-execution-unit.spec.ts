import { expect, test } from "@playwright/test";
import { equal, judge, validatePlan } from "../src/lib/dsa-execution/judge";
import {
  processExecution,
  RetryExecution,
} from "../src/lib/dsa-execution/worker";
import { executionRequestSchema } from "../src/features/dsa/execution/contract";
import { parseDSATutorRequest } from "../src/features/dsa/reasonai/contract";
import { hydrateTutorContext } from "../src/lib/dsa-execution/tutor-context";
import { turnInstruction } from "../src/features/dsa/reasonai/provider";
import type { components } from "../src/lib/api/types";
import {
  ExecutionError,
  type ClaimedJob,
  type EvaluationPlan,
  type ExecutionRepository,
  type SandboxAdapter,
} from "../src/lib/dsa-execution/types";

const id = () => crypto.randomUUID();
const problemId = id(),
  problemVersionId = id();
const plan: EvaluationPlan = {
  certificateId: id(),
  suiteId: id(),
  problemId,
  problemVersionId,
  contract: { entrypoint: "solve", inputMode: "kwargs", checker: "exact_json" },
  exposeCounts: false,
  cases: [
    { id: id(), input: { nums: [1, 2] }, expected: 3, visibility: "public" },
    { id: id(), input: { nums: [999] }, expected: 999, visibility: "hidden" },
  ],
};
const request = {
  problemId,
  problemVersionId,
  code: "def solve(nums): return sum(nums)",
  mode: "submit" as const,
  language: "python" as const,
  idempotencyKey: id(),
};
function harness(overrides: Partial<ClaimedJob> = {}) {
  const job: ClaimedJob = {
    id: id(),
    token: id(),
    request,
    phase: "prepared",
    cancelRequested: false,
    createdAt: new Date().toISOString(),
    attempts: 1,
    cleanupOnly: false,
    ...overrides,
  };
  const events: string[] = [];
  const finishes: unknown[][] = [];
  const repository: ExecutionRepository = {
    availability: async () => ({ run: true, submit: true }),
    create: async () => {
      throw new Error("unused");
    },
    get: async () => undefined,
    cancel: async () => undefined,
    claim: async () => {
      events.push("claim");
      return job;
    },
    plan: async () => {
      events.push("plan");
      return plan;
    },
    launch: async () => {
      events.push("launch");
      return true;
    },
    operation: async () => {
      events.push("operation");
      return true;
    },
    finish: async (...args) => {
      events.push("finish");
      finishes.push(args);
    },
    defer: async () => {
      events.push("defer");
    },
    dispatch: async () => [],
  };
  const sandbox: SandboxAdapter = {
    start: async () => {
      events.push("start");
      return id();
    },
    find: async () => {
      events.push("find");
      return id();
    },
    inspect: async () => {
      events.push("inspect");
      return {
        terminal: true,
        cases: plan.cases.map((row) => ({
          id: row.id,
          actual: row.expected,
          status: "ok",
          stdout: "PRIVATE_LOG",
        })),
      };
    },
    cancel: async () => {
      events.push("cancel");
    },
  };
  return { job, events, finishes, repository, sandbox };
}
test("strict requests reject identity injection, unsupported languages and blank/oversize source", () => {
  for (const update of [
    { userId: id() },
    { language: "cpp" },
    { code: " " },
    { code: "x".repeat(24001) },
    { problemVersionId: "bad" },
  ])
    expect(
      executionRequestSchema.safeParse({ ...request, ...update }).success,
    ).toBe(false);
});
test("trusted exact/unordered/numeric comparisons retain JSON type and duplicate semantics", () => {
  expect(
    equal({ b: [1], a: null }, { a: null, b: [1] }, plan.contract),
  ).toBeTruthy();
  expect(equal(false, 0, plan.contract)).toBeFalsy();
  expect(equal("3", 3, plan.contract)).toBeFalsy();
  expect(
    equal([2, 1, 1], [1, 2, 1], {
      ...plan.contract,
      checker: "unordered_json",
    }),
  ).toBeTruthy();
  expect(
    equal([1, 2], [1, 1, 2], { ...plan.contract, checker: "unordered_json" }),
  ).toBeFalsy();
  expect(
    equal(1.001, 1, {
      ...plan.contract,
      checker: "numeric",
      absoluteTolerance: 0.002,
    }),
  ).toBeTruthy();
  expect(equal(NaN, 1, plan.contract)).toBeFalsy();
});
test("plans fail closed for unsupported metadata, unsafe numeric JSON, malformed input and excess fixtures", () => {
  for (const change of [
    { contract: { ...plan.contract, customChecker: "exec" } },
    { cases: [{ ...plan.cases[0], expected: 1e20 }] },
    { cases: [{ ...plan.cases[0], input: [1] }] },
    { cases: [] },
    { cases: Array(101).fill(plan.cases[0]) },
  ])
    expect(() => validatePlan({ ...plan, ...change })).toThrow();
});
test("hidden judging exposes aggregates only and never logs or hidden actual values", () => {
  const result = judge(
    plan,
    {
      terminal: true,
      cases: plan.cases.map((row) => ({
        id: row.id,
        status: "ok",
        actual: row.expected,
        stdout: "PRIVATE",
        stderr: "PRIVATE",
      })),
    },
    "submit",
    100,
  );
  expect(result.verdict).toBe("accepted");
  expect(result).not.toHaveProperty("publicCases");
  expect(result).not.toHaveProperty("totalTests");
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  const publicPlan = { ...plan, cases: [plan.cases[0]] };
  const wrong = judge(
    publicPlan,
    {
      terminal: true,
      cases: [{ id: publicPlan.cases[0].id, status: "ok", actual: 0 }],
    },
    "run",
    5,
  );
  expect(wrong).toMatchObject({
    verdict: "wrong_answer",
    publicCases: [{ actualOutput: 0, expectedOutput: 3 }],
    passedTests: 0,
  });
});
test("provider timeouts, malformed results and missing cases never become accepted", () => {
  expect(
    judge(plan, { terminal: true, timedOut: true }, "submit", 25).verdict,
  ).toBe("time_limit_exceeded");
  expect(
    judge(plan, { terminal: true, malformed: true }, "submit", 25).verdict,
  ).toBe("runtime_error");
  expect(judge(plan, { terminal: true, cases: [] }, "submit", 25).verdict).toBe(
    "runtime_error",
  );
});
test("worker claims and records launch before the only external spawn, then judges on the server", async () => {
  const h = harness();
  await processExecution(h.job.id, h.repository, h.sandbox);
  expect(h.events).toEqual([
    "claim",
    "plan",
    "launch",
    "start",
    "operation",
    "inspect",
    "plan",
    "finish",
  ]);
  expect(h.finishes[0][1]).toBe("completed");
  expect(h.finishes[0][2]).toMatchObject({ verdict: "accepted" });
});
test("redelivery resumes the same operation and never starts another sandbox", async () => {
  const h = harness({ operationId: id(), phase: "launched" });
  await processExecution(h.job.id, h.repository, h.sandbox);
  expect(h.events).not.toContain("start");
  expect(h.events).not.toContain("launch");
});
test("ambiguous spawn failure quarantines capacity and recovered delivery only searches", async () => {
  const h = harness();
  h.sandbox.start = async () => {
    throw new Error("lost POST response");
  };
  await expect(
    processExecution(h.job.id, h.repository, h.sandbox),
  ).rejects.toBeInstanceOf(RetryExecution);
  expect(h.finishes[0][3]).toContain("startup could not be confirmed");
  expect(h.finishes[0][4]).toBe(false);
  const resumed = harness({
    phase: "launching",
    launchedAt: new Date().toISOString(),
    cleanupOnly: true,
  });
  await processExecution(resumed.job.id, resumed.repository, resumed.sandbox);
  expect(resumed.events).not.toContain("start");
  expect(resumed.events).toContain("find");
  expect(resumed.events).toContain("cancel");
});
test("running operation is deferred while holding its durable capacity slot", async () => {
  const h = harness({ operationId: id(), phase: "launched" });
  h.sandbox.inspect = async () => ({ terminal: false });
  await expect(
    processExecution(h.job.id, h.repository, h.sandbox),
  ).rejects.toBeInstanceOf(RetryExecution);
  expect(h.events).toContain("defer");
  expect(h.events).not.toContain("finish");
});
test("cancellation waits for external terminal confirmation, and revoked plans stop execution", async () => {
  const h = harness({
    operationId: id(),
    phase: "launched",
    cancelRequested: true,
  });
  h.sandbox.inspect = async () => ({ terminal: true, cancelled: true });
  await processExecution(h.job.id, h.repository, h.sandbox);
  expect(h.events.indexOf("cancel")).toBeLessThan(h.events.indexOf("finish"));
  expect(h.finishes[0][1]).toBe("cancelled");
  const revoked = harness();
  revoked.repository.plan = async () => {
    throw new ExecutionError("NOT_ELIGIBLE", "Revoked", 409);
  };
  await processExecution(revoked.job.id, revoked.repository, revoked.sandbox);
  expect(revoked.events).not.toContain("start");
  expect(revoked.finishes[0][1]).toBe("failed");
});
test("already-terminal duplicate delivery is acknowledged without a sandbox call", async () => {
  const h = harness();
  h.repository.claim = async () => "done";
  await processExecution(h.job.id, h.repository, h.sandbox);
  expect(h.events).toEqual([]);
});

test("oversized combined VM input fails before the non-idempotent launch marker", async () => {
  const h = harness();
  h.job.request = { ...request, code: "#" + "\u0000".repeat(20000) };
  h.repository.plan = async () => ({
    ...plan,
    contract: { ...plan.contract, inputMode: "single" },
    cases: [{ ...plan.cases[0], input: "x".repeat(60000) }],
  });
  await processExecution(h.job.id, h.repository, h.sandbox);
  expect(h.events).not.toContain("launch");
  expect(h.events).not.toContain("start");
  expect(h.finishes[0][1]).toBe("failed");
  expect(h.finishes[0][3]).toContain("input exceeds");
});

const tutorInput = () => parseDSATutorRequest({
  action: "hint", message: "Give me a hint", searchWeb: false, hintLevel: 1, history: [], teachingMode: "direct",
  context: { contentId: problemId, problemVersionId, title: "Untrusted title", slug: "test", language: "python", userCode: "def solve(nums): return 0", userApproach: "", userNotes: "" },
});
const tutorProblem = {
  id: problemId, problem_version_id: problemVersionId, title: "Array total", slug: "array-total", difficulty: "easy", availability: "available",
  description: "Return the sum of the integers.", constraints: ["Input is unchanged"], function_contract: { function: "solve" }, examples: [{ input: [1, 2], output: 3 }],
  categories: [], topics: [], supported_contract_languages: ["python"],
} as components["schemas"]["ProblemDetail"];

test("tutor resolves authorized exact specification and ignores caller metadata", async () => {
  const input = tutorInput();
  const hydrated = await hydrateTutorContext(input, "owner", { problem: async (id, version, preview) => {
    expect([id, version, preview]).toEqual([problemId, problemVersionId, false]);
    return tutorProblem;
  }, execution: async () => undefined });
  expect(hydrated.context.title).toBe("Array total");
  expect(hydrated.context.specification?.description).toBe(tutorProblem.description);
  expect(hydrated.context.specification?.functionContract).toContain("solve");
  expect(hydrated.context.userCode).toBe(input.context.userCode);
  expect(turnInstruction(hydrated)).toContain("DIRECT MODE");
  expect(turnInstruction({ ...hydrated, teachingMode: "socratic" })).toContain("SOCRATIC MODE");
  for (const context of [{ ...input.context, specification: {} }, { ...input.context, publicExecution: {} }]) {
    expect(() => parseDSATutorRequest({ ...input, context })).toThrow("Unsupported request field");
  }
});

test("tutor requires owned public Run from the same version and strips extra stored fields", async () => {
  const input = tutorInput();
  input.context.publicExecutionId = id();
  const job = { submissionId: input.context.publicExecutionId, problemId, problemVersionId, language: "python" as const, mode: "run" as const, status: "completed" as const,
    result: { verdict: "wrong_answer" as const, publicCases: [{ id: id(), input: [1, 2], expectedOutput: 3, actualOutput: 0, verdict: "wrong_answer" as const }], secret: "never send" }, createdAt: "", updatedAt: "" };
  const loaders = { problem: async () => tutorProblem, execution: async (owner: string, submission: string) => {
    expect(owner).toBe("owner"); expect(submission).toBe(job.submissionId); return job;
  } };
  const hydrated = await hydrateTutorContext(input, "owner", loaders);
  expect(hydrated.context.publicExecution?.result).toContain('"actualOutput":0');
  expect(hydrated.context.publicExecution?.result).not.toContain("never send");
  expect(hydrated.context.publicExecution?.codeMayHaveChanged).toBe(true);
  for (const value of [undefined, { ...job, mode: "submit" as const }, { ...job, problemVersionId: id() }]) {
    await expect(hydrateTutorContext(input, "owner", { ...loaders, execution: async () => value })).rejects.toThrow("Public execution not found");
  }
});

test("tutor keeps preview authorization upstream, rejects stale versions and labels truncation", async () => {
  const input = tutorInput(); input.context.preview = true;
  await expect(hydrateTutorContext(input, "owner", { problem: async (_id, _version, preview) => {
    expect(preview).toBe(true); throw new Error("Reviewer required");
  }, execution: async () => undefined })).rejects.toThrow("Reviewer required");
  await expect(hydrateTutorContext(input, "owner", { problem: async () => ({ ...tutorProblem, problem_version_id: id() }), execution: async () => undefined })).rejects.toThrow("no longer available");
  const result = await hydrateTutorContext(input, "owner", { problem: async () => ({ ...tutorProblem, description: "x".repeat(13000) }), execution: async () => undefined });
  expect(result.context.specification?.description).toHaveLength(12000);
  expect(result.context.specification?.truncated).toBe(true);
});
