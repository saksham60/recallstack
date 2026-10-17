import "server-only";
import { send } from "@vercel/queue";
import { codeIntelligenceEnabled, createReportRepository } from "./repository";
import { deliverReports } from "./delivery";
export async function dispatchReports(submissionId?: string) {
  if (!codeIntelligenceEnabled())
    return { dispatched: 0, pending: 0, disabled: true };
  return deliverReports(
    () => createReportRepository().dispatch(submissionId),
    (id, generation) =>
      send(
        "dsa-code-intelligence",
        { reportId: id },
        { idempotencyKey: `${id}:${generation}`, retentionSeconds: 3600 },
      ),
  );
}
