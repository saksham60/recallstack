import { judge } from "./judge";
import { executionPayload } from "./runner";
import {
  ExecutionError,
  type EvaluationPlan,
  type ExecutionRepository,
  type SandboxAdapter,
} from "./types";

export class RetryExecution extends Error {
  constructor(public afterSeconds = 5) {
    super("Execution processing will resume.");
  }
}
/** One bounded worker tick. A durable slot is never freed by lease expiry alone. */
export async function processExecution(
  id: string,
  repository: ExecutionRepository,
  sandbox: SandboxAdapter,
  token = crypto.randomUUID(),
) {
  const job = await repository.claim(id, token);
  if (job === "done") {
    console.info("[DSA_EXECUTION_LIFECYCLE]", { submissionId: id, stage: "acknowledged", sandboxStarted: false });
    return;
  }
  if (!job) {
    // Capacity contention or another active consumer. A duplicate terminal
    // delivery can be acknowledged by the queue; recovery also handles retries.
    throw new RetryExecution(10);
  }
  let plan: EvaluationPlan | undefined;
  let operationId = job.operationId;
  const expired =
    Date.now() - Date.parse(job.createdAt) > 300000 || job.attempts > 40;
  let stop = job.cancelRequested || job.cleanupOnly || expired;
  try {
    if (!stop) {
      try {
        plan = await repository.plan(job);
      } catch (error) {
        if (
          error instanceof ExecutionError &&
          ["NOT_ELIGIBLE", "CONTRACT_UNAVAILABLE"].includes(error.code)
        )
          stop = true;
        else throw error;
      }
    }
    if (job.phase === "prepared" && stop) {
      await repository.finish(
        job,
        job.cancelRequested ? "cancelled" : "failed",
        undefined,
        job.cancelRequested
          ? undefined
          : "The execution expired or its certified suite is no longer eligible.",
      );
      return;
    }
    if (!operationId && job.phase !== "prepared") {
      operationId = await sandbox.find(job.id, job.launchedAt!);
      if (!operationId) {
        // A crash can occur after POST was sent but before its ID was persisted.
        // Never repeat that POST or return its slot to the pool on a timer.
        if (job.attempts >= 4 && !job.cleanupOnly)
          await repository.finish(
            job,
            "failed",
            undefined,
            "Sandbox startup could not be confirmed. Its capacity slot is reserved for recovery.",
            false,
          );
        throw new RetryExecution(30);
      }
      await repository.operation(job, operationId);
    }
    if (!operationId) {
      if (plan) {
        try {
          executionPayload(job.request, plan);
        } catch {
          await repository.finish(
            job,
            "failed",
            undefined,
            "Execution input exceeds the supported limit.",
          );
          return;
        }
      }
      if (!plan || !(await repository.launch(job))) {
        await repository.defer(job);
        throw new RetryExecution();
      }
      job.launchedAt = new Date().toISOString();
      const launchStarted = Date.now();
      console.info("[DSA_EXECUTION_PERF]", { submissionId: job.id, stage: "launch.started", queueWaitMs: Math.max(0, launchStarted - Date.parse(job.createdAt)) });
      // The launch marker is committed before the only non-idempotent call.
      try {
        operationId = await sandbox.start(job.id, job.request, plan);
        console.info("[DSA_EXECUTION_PERF]", { submissionId: job.id, stage: "launch.confirmed", startupMs: Date.now() - launchStarted });
      } catch {
        await repository.finish(
          job,
          "failed",
          undefined,
          "Sandbox startup could not be confirmed. Its capacity slot is reserved for recovery.",
          false,
        );
        throw new RetryExecution(30);
      }
      await repository.operation(job, operationId);
    }
    if (stop) await sandbox.cancel(operationId);
    const operation = await sandbox.inspect(operationId);
    if (!operation.terminal) {
      await repository.defer(job);
      throw new RetryExecution(5);
    }
    if (stop || operation.cancelled) {
      await repository.finish(
        job,
        job.cancelRequested || operation.cancelled ? "cancelled" : "failed",
        undefined,
        job.cancelRequested
          ? undefined
          : "Execution stopped because its request expired or its certified suite became unavailable.",
      );
      return;
    }
    if (operation.infrastructureFailure) {
      await repository.finish(
        job,
        "failed",
        undefined,
        "The sandbox provider could not complete this execution.",
      );
      return;
    }
    // Re-check both authorization gates and the exact frozen plan after execution.
    try {
      plan = await repository.plan(job);
    } catch (error) {
      if (error instanceof ExecutionError && error.code === "NOT_ELIGIBLE") {
        await repository.finish(
          job,
          "failed",
          undefined,
          "The certified suite is no longer eligible.",
        );
        return;
      }
      throw error;
    }
    const result = judge(
      plan,
      operation,
      job.request.mode,
      Math.max(
        0,
        Date.now() - Date.parse(job.launchedAt ?? new Date().toISOString()),
      ),
    );
    await repository.finish(
      job,
      result.verdict === "time_limit_exceeded" ? "timed_out" : "completed",
      result,
    );
    console.info("[DSA_EXECUTION_PERF]", { submissionId: job.id, stage: "completed", endToEndMs: Math.max(0, Date.now() - Date.parse(job.createdAt)), wallTimeMs: result.wallTimeMs, executionTimeMs: result.executionTimeMs });
  } catch (error) {
    if (error instanceof RetryExecution) throw error;
    // Do not release capacity after an unknown provider/storage result. The next
    // fenced delivery or recovery cron resumes the existing operation.
    try {
      await repository.defer(job);
    } catch {
      /* An expired fence is recovered by cron. */
    }
    throw new RetryExecution(10);
  }
}
