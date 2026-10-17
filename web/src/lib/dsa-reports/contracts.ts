import { z } from "zod";
export const REPORT_RUBRIC = "dsa-code-intelligence:1";
const text = z.string().trim().min(1).max(1200);
const list = z.array(text).max(6);
export const analysisSchema = z
  .object({
    summary: text,
    complexity: z
      .object({
        time: z.string().max(100),
        space: z.string().max(100),
        explanation: text,
        confidence: z.enum(["low", "medium", "high"]),
        caveats: list,
      })
      .strict(),
    quality: z
      .object({
        readability: text,
        naming: text,
        modularity: text,
        robustness: text,
      })
      .strict(),
    correctness: z
      .object({
        evidence: list,
        assumptions: list,
        edgeCases: list,
        invariants: list,
      })
      .strict(),
    optimization: z
      .object({
        approaches: list,
        tradeoffs: list,
        patterns: list,
        suggestions: list,
      })
      .strict(),
    learning: z
      .object({
        strengths: list,
        practice: list,
        concepts: list,
        earlierAttempts: text,
      })
      .strict(),
  })
  .strict();
export type CodeAnalysis = z.infer<typeof analysisSchema>;
export const reportViewSchema = z
  .object({
    id: z.uuid(),
    status: z.enum([
      "queued",
      "generating",
      "completed",
      "failed",
      "rate_limited",
    ]),
    model: z.string().max(200),
    rubric: z.string().max(100),
    createdAt: z.string(),
    updatedAt: z.string(),
    attempts: z.number().int().min(0),
    analysis: analysisSchema.optional(),
    error: z.string().max(500).optional(),
  })
  .strict();
export const reportResponseSchema = z
  .object({
    submissionId: z.uuid(),
    sourceCode: z.string().max(24000),
    codeSha256: z.string().regex(/^[a-f0-9]{64}$/),
    enabled: z.boolean(),
    report: reportViewSchema.nullable(),
  })
  .strict();
// Narrow projection: strip any unexpected stored fields before an HTTP response.
export const submissionViewSchema = z.object({
  submissionId: z.uuid(),
  problemId: z.uuid(),
  problemVersionId: z.uuid(),
  language: z.literal("python"),
  mode: z.literal("submit"),
  status: z.enum([
    "queued",
    "running",
    "completed",
    "failed",
    "timed_out",
    "cancelled",
  ]),
  createdAt: z.string(),
  updatedAt: z.string(),
  gradingLevel: z.enum(["official", "provisional"]).optional(),
  error: z.string().max(500).optional(),
  result: z
    .object({
      verdict: z.enum([
        "accepted",
        "provisional_pass",
        "wrong_answer",
        "syntax_error",
        "runtime_error",
        "time_limit_exceeded",
        "output_limit_exceeded",
      ]),
      passedTests: z.number().int().nonnegative().optional(),
      totalTests: z.number().int().nonnegative().optional(),
      wallTimeMs: z.number().nonnegative().optional(),
      executionTimeMs: z.number().nonnegative().optional(),
      memoryKiB: z.number().nonnegative().optional(),
      gradingLevel: z.enum(["official", "provisional"]).optional(),
    })
    .optional(),
});
export const historySchema = z.object({
  items: z.array(submissionViewSchema).max(20),
  next: z.object({ before: z.string(), beforeId: z.uuid() }).nullable(),
});
export const packetSchema = z
  .object({
    submissionId: z.uuid(),
    problemId: z.uuid(),
    problemVersionId: z.uuid(),
    code: z.string().max(24000),
    judge: z
      .object({
        verdict: z.enum([
          "accepted",
          "provisional_pass",
          "wrong_answer",
          "syntax_error",
          "runtime_error",
          "time_limit_exceeded",
          "output_limit_exceeded",
        ]),
        passedTests: z.number().int().nonnegative().optional(),
        totalTests: z.number().int().nonnegative().optional(),
        executionTimeMs: z.number().nonnegative().optional(),
        memoryKiB: z.number().nonnegative().optional(),
        gradingLevel: z.enum(["official", "provisional"]).optional(),
      })
      .strict(),
    statement: z
      .object({
        title: z.string().max(300).nullable(),
        description: z.string().max(6000).nullable(),
      })
      .strict()
      .nullable(),
    earlierAttempts: z
      .array(
        z
          .object({
            submissionId: z.uuid(),
            verdict: z.string().max(100),
            createdAt: z.string(),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export const claimSchema = z
  .object({
    id: z.uuid(),
    token: z.uuid(),
    model: z.string().min(1).max(200),
    rubric: z.literal(REPORT_RUBRIC),
    attempt: z.number().int().min(1),
    packet: packetSchema,
  })
  .strict();
export type ReportClaim = z.infer<typeof claimSchema>;
export type ReportUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd: null;
  durationMs: number;
};
export interface ReportRepository {
  claim(id: string, token: string): Promise<unknown>;
  finish(
    claim: ReportClaim,
    outcome: {
      document?: CodeAnalysis;
      usage?: ReportUsage;
      error?: string;
      retry?: boolean;
    },
  ): Promise<boolean>;
}
