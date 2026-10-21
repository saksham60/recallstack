import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import {
  createExecutionRepository,
  executionConfigured,
} from "@/lib/dsa-execution/repository";
import { createSandboxAdapter } from "@/lib/dsa-execution/contree";
import { processExecution, RetryExecution } from "@/lib/dsa-execution/worker";
import { dispatchReports } from "@/lib/dsa-reports/queue";
import { ReportDispatchError } from "@/lib/dsa-reports/delivery";
export const runtime = "nodejs";
export const maxDuration = 60;
const callback = handleCallback(
  async (message: unknown) => {
    const parsed = z
      .object({ submissionId: z.uuid() })
      .strict()
      .safeParse(message);
    if (!parsed.success) return; // Poison messages contain no executable source.
    if (!executionConfigured()) throw new RetryExecution(60);
    await processExecution(
      parsed.data.submissionId,
      createExecutionRepository(),
      createSandboxAdapter(),
    );
    // A terminal execution is idempotent on redelivery: the sandbox is not run
    // again. Keep delivery retryable if report publication/storage is unavailable.
    await dispatchReports();
  },
  {
    retry: (error, metadata) =>
      error instanceof ReportDispatchError
        ? {
            afterSeconds: Math.min(
              300,
              60 * 2 ** Math.min(metadata.deliveryCount - 1, 3),
            ),
          }
        : metadata.deliveryCount >= 12
          ? { acknowledge: true }
          : {
              afterSeconds:
                error instanceof RetryExecution
                  ? error.afterSeconds === 5
                    ? 5
                    : Math.min(
                        300,
                        error.afterSeconds *
                          2 ** Math.min(metadata.deliveryCount - 1, 5),
                      )
                  : Math.min(300, 2 ** metadata.deliveryCount * 5),
            },
  },
);

// Next route handlers receive Request; the SDK also supports other runtimes.
export async function POST(request: Request): Promise<Response> {
  return callback(request);
}
