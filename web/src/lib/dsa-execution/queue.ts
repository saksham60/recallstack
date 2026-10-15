import "server-only";
import { send } from "@vercel/queue";
import type { ExecutionRepository } from "./types";
/** Non-executing delivery probe: a missing job is acknowledged before any VM call. */
export async function probeExecutionDelivery() {
  const probeId = crypto.randomUUID();
  await send("dsa-executions", { submissionId: probeId }, { idempotencyKey: `probe:${probeId}`, retentionSeconds: 300 });
  return { probeId };
}
export async function dispatchExecutions(repository: ExecutionRepository) {
  const due = await repository.dispatch();
  const results = await Promise.allSettled(
    due.map(({ id, generation }) =>
      send(
        "dsa-executions",
        { submissionId: id },
        { idempotencyKey: `${id}:${generation}`, retentionSeconds: 3600 },
      ),
    ),
  );
  // SQL outbox reservations become due again even if publishing or this process
  // fails. A queue outage cannot strand a successfully persisted submission.
  return {
    dispatched: results.filter((result) => result.status === "fulfilled")
      .length,
    pending: results.filter((result) => result.status === "rejected").length,
  };
}
