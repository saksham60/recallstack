import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import {
  createExecutionRepository,
  executionConfigured,
} from "@/lib/dsa-execution/repository";
import { createSandboxAdapter } from "@/lib/dsa-execution/contree";
import { processExecution, RetryExecution } from "@/lib/dsa-execution/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = handleCallback(
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
  },
  {
    retry: (error, metadata) =>
      metadata.deliveryCount >= 12
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
