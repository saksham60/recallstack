import { test, expect } from "@playwright/test";
import { exampleAnalysis } from "./helpers/dsa-report";
import {
  processReport,
  ReportProviderError,
  RetryReport,
} from "../src/lib/dsa-reports/worker";
import {
  analysisSchema,
  REPORT_RUBRIC,
  type ReportClaim,
  type ReportRepository,
} from "../src/lib/dsa-reports/contracts";
import { generateCodeReport } from "../src/lib/dsa-reports/provider";
const id = () => crypto.randomUUID();
function fixture() {
  const claim: ReportClaim = {
    id: id(),
    token: id(),
    model: "test/model",
    rubric: REPORT_RUBRIC,
    attempt: 1,
    packet: {
      submissionId: id(),
      problemId: id(),
      problemVersionId: id(),
      code: "def solve(nums): return []",
      judge: { verdict: "wrong_answer", executionTimeMs: 4 },
      statement: { title: "Example", description: "Public description" },
      earlierAttempts: [],
    },
  };
  const outcomes: unknown[] = [];
  const repository: ReportRepository = {
    claim: async () => claim,
    finish: async (_claim, outcome) => {
      outcomes.push(outcome);
      return true;
    },
  };
  return { claim, repository, outcomes };
}
test("report worker persists validated estimates and acknowledges duplicate completed deliveries without generation", async () => {
  const h = fixture();
  let calls = 0;
  const generate = async () => {
    calls++;
    return {
      document: exampleAnalysis,
      usage: { costUsd: null, durationMs: 1 },
    };
  };
  await processReport(h.claim.id, h.repository, generate);
  expect(h.outcomes[0]).toMatchObject({ document: exampleAnalysis });
  h.repository.claim = async () => "done";
  await processReport(h.claim.id, h.repository, generate);
  expect(calls).toBe(1);
  expect(
    analysisSchema.safeParse({ ...exampleAnalysis, verdict: "accepted" })
      .success,
  ).toBe(false);
  expect(h.claim.packet.judge.verdict).toBe("wrong_answer");
});
test("unlimited transient retry, permanent failures and lost storage fences remain independent of judging", async () => {
  const h = fixture();
  await expect(
    processReport(h.claim.id, h.repository, async () => {
      throw new ReportProviderError(true);
    }),
  ).rejects.toBeInstanceOf(RetryReport);
  expect(h.outcomes[0]).toMatchObject({ retry: true });
  h.claim.attempt = 42;
  await expect(
    processReport(h.claim.id, h.repository, async () => {
      throw new ReportProviderError(true);
    }),
  ).rejects.toBeInstanceOf(RetryReport);
  expect(h.outcomes[1]).toMatchObject({ retry: true });
  await processReport(h.claim.id, h.repository, async () => {
    throw new Error("PRIVATE provider credential text");
  });
  expect(JSON.stringify(h.outcomes)).not.toContain("PRIVATE");
  h.repository.finish = async () => false;
  await expect(
    processReport(h.claim.id, h.repository, async () => ({
      document: exampleAnalysis,
      usage: { costUsd: null, durationMs: 1 },
    })),
  ).rejects.toBeInstanceOf(RetryReport);
});
test("provider transport bounds tokens, validates JSON, and records actual token usage without inventing price", async () => {
  const h = fixture(),
    original = globalThis.fetch,
    originalKey = process.env.NEBIUS_API_KEY,
    originalTracing = process.env.LANGSMITH_TRACING;
  let body: Record<string, unknown> = {};
  process.env.NEBIUS_API_KEY = "unit-only";
  process.env.LANGSMITH_TRACING = "false";
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(exampleAnalysis) },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    });
  };
  try {
    const result = await generateCodeReport(h.claim);
    expect(body).toMatchObject({
      model: "test/model",
      max_tokens: 2400,
      stream: false,
      response_format: { type: "json_object" },
    });
    expect(result.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      costUsd: null,
    });
    globalThis.fetch = async () =>
      Response.json({
        choices: [{ message: { content: '{"verdict":"accepted"}' } }],
      });
    await expect(generateCodeReport(h.claim)).rejects.toThrow();
  } finally {
    globalThis.fetch = original;
    if (originalKey === undefined) delete process.env.NEBIUS_API_KEY;
    else process.env.NEBIUS_API_KEY = originalKey;
    if (originalTracing === undefined) delete process.env.LANGSMITH_TRACING;
    else process.env.LANGSMITH_TRACING = originalTracing;
  }
});
