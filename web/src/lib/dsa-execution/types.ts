import { z } from "zod";
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionView,
} from "@/features/dsa/execution/contract";

export const MAX_CASES = 100;
export const MAX_INPUT_BYTES = 65536;
export const OPERATION_TIMEOUT_SECONDS = 25;
export const judgeContractSchema = z
  .object({
    entrypoint: z.string().regex(/^[A-Za-z_][A-Za-z_0-9]{0,99}$/),
    inputMode: z.enum(["kwargs", "args", "single"]),
    checker: z.enum(["exact_json", "unordered_json", "numeric"]),
    absoluteTolerance: z.number().finite().min(0).max(1).optional(),
  })
  .strict()
  .refine(
    (contract) =>
      contract.checker !== "numeric" ||
      contract.absoluteTolerance !== undefined,
    "Numeric comparison requires an explicit tolerance.",
  );
export const planSchema = z
  .object({
    certificateId: z.uuid(),
    suiteId: z.uuid(),
    problemId: z.uuid(),
    problemVersionId: z.uuid(),
    contract: judgeContractSchema,
    exposeCounts: z.boolean(),
    cases: z
      .array(
        z
          .object({
            id: z.uuid(),
            input: z.unknown(),
            expected: z.unknown(),
            visibility: z.enum(["public", "hidden"]),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_CASES),
  })
  .strict();
export type EvaluationPlan = z.infer<typeof planSchema>;
export type RawCase = {
  id: string;
  actual?: unknown;
  status:
    | "ok"
    | "runtime_error"
    | "syntax_error"
    | "time_limit_exceeded"
    | "output_limit_exceeded";
  stdout?: string;
  stderr?: string;
  executionTimeMs?: number;
  memoryKiB?: number;
};
export interface OperationResult {
  terminal: boolean;
  cancelled?: boolean;
  timedOut?: boolean;
  infrastructureFailure?: boolean;
  cases?: RawCase[];
  malformed?: boolean;
  memoryKiB?: number;
}
export interface SandboxAdapter {
  start(
    id: string,
    request: ExecutionRequest,
    plan: EvaluationPlan,
  ): Promise<string>;
  find(id: string, launchedAt: string): Promise<string | undefined>;
  inspect(operationId: string): Promise<OperationResult>;
  cancel(operationId: string): Promise<void>;
}
export interface ClaimedJob {
  id: string;
  token: string;
  request: ExecutionRequest;
  phase: "prepared" | "launching" | "launched";
  operationId?: string;
  launchedAt?: string;
  createdAt: string;
  cancelRequested: boolean;
  attempts: number;
  cleanupOnly: boolean;
}
export class ExecutionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export interface ExecutionRepository {
  availability(
    problemId: string,
    versionId: string,
  ): Promise<{ run: boolean; submit: boolean }>;
  create(
    userId: string,
    request: ExecutionRequest,
    hash: string,
  ): Promise<ExecutionView>;
  get(userId: string, id: string): Promise<ExecutionView | undefined>;
  cancel(userId: string, id: string): Promise<ExecutionView | undefined>;
  claim(id: string, token: string): Promise<ClaimedJob | "done" | undefined>;
  plan(job: ClaimedJob): Promise<EvaluationPlan>;
  launch(job: ClaimedJob): Promise<boolean>;
  operation(job: ClaimedJob, operationId: string): Promise<boolean>;
  finish(
    job: ClaimedJob,
    status: "completed" | "failed" | "timed_out" | "cancelled",
    result?: ExecutionResult,
    error?: string,
    release?: boolean,
  ): Promise<void>;
  defer(job: ClaimedJob): Promise<void>;
  dispatch(): Promise<{ id: string; generation: number }[]>;
}
