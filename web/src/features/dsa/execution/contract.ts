import { z } from "zod";
import type { PublicRunBundle, ApprovedContract } from "@/lib/dsa-execution/python-contract";

export const executionRequestSchema = z
  .object({
    problemId: z.uuid(),
    problemVersionId: z.uuid(),
    language: z.literal("python"),
    code: z
      .string()
      .min(1)
      .max(24000)
      .refine((code) => !!code.trim(), "Write some code first."),
    mode: z.enum(["run", "submit"]),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
export const executionStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
] as const;
export type ExecutionStatus = (typeof executionStatuses)[number];
export type Verdict =
  | "accepted"
  | "provisional_pass"
  | "passed_public_tests"
  | "wrong_answer"
  | "runtime_error"
  | "syntax_error"
  | "time_limit_exceeded"
  | "output_limit_exceeded";
export interface PublicCaseResult {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  actualOutput?: unknown;
  verdict: Verdict;
  stdout?: string;
  stderr?: string;
  executionTimeMs?: number;
  memoryKiB?: number;
}
export interface ExecutionResult {
  verdict: Verdict;
  gradingLevel?: "official" | "provisional";
  passedTests?: number;
  totalTests?: number;
  publicCases?: PublicCaseResult[];
  wallTimeMs?: number;
  executionTimeMs?: number;
  memoryKiB?: number;
}
export interface ExecutionView {
  submissionId: string;
  problemId: string;
  problemVersionId: string;
  language: "python";
  mode: "run" | "submit";
  status: ExecutionStatus;
  gradingLevel?: "official" | "provisional";
  result?: ExecutionResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
export interface ExecutionAvailability {
  gradingLevel?: "official" | "provisional";
  approvedContract?: ApprovedContract;
  publicRun?: PublicRunBundle;
  run: boolean;
  submit: boolean;
  runReason?: string;
  submitReason?: string;
  languages: string[];
}
export const terminal = (status: ExecutionStatus) =>
  !["queued", "running"].includes(status);
