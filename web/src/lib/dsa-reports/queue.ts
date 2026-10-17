import "server-only";
import { send } from "@vercel/queue";
import { codeIntelligenceEnabled, createReportRepository } from "./repository";
export async function dispatchReports(submissionId?: string) {
  if (!codeIntelligenceEnabled())
    return { dispatched: 0, pending: 0, disabled: true };
  const due = await createReportRepository().dispatch(submissionId);
  const results = await Promise.allSettled(
    due.map(({ id, generation }) =>
      send(
        "dsa-code-intelligence",
        { reportId: id },
        { idempotencyKey: `${id}:${generation}`, retentionSeconds: 3600 },
      ),
    ),
  );
  return {
    dispatched: results.filter((r) => r.status === "fulfilled").length,
    pending: results.filter((r) => r.status === "rejected").length,
  };
}
