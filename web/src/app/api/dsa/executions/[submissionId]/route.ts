import { z } from "zod";
import { after } from "next/server";
import {
  executionHttpError,
  executionIdentity,
  reply,
} from "@/lib/dsa-execution/http";
import { createExecutionRepository, executionConfigured } from "@/lib/dsa-execution/repository";
import { dispatchExecutions } from "@/lib/dsa-execution/queue";
import type { ExecutionRepository } from "@/lib/dsa-execution/types";
export const runtime = "nodejs";
export const maxDuration = 30;
function recover(repository: ExecutionRepository) {
  if (executionConfigured()) after(async () => {
    try { await dispatchExecutions(repository); } catch { /* Queue retries and the safety sweep remain available. */ }
  });
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const identity = await executionIdentity(request);
    if (identity instanceof Response) return identity;
    const { submissionId } = await params;
    if (!z.uuid().safeParse(submissionId).success)
      return reply({ error: "Execution not found." }, 404);
    const repository = createExecutionRepository();
    const job = await repository.get(
      identity.user.id,
      submissionId,
    );
    if (job) recover(repository);
    return job ? reply(job) : reply({ error: "Execution not found." }, 404);
  } catch (error) {
    return executionHttpError(error);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const identity = await executionIdentity(request);
    if (identity instanceof Response) return identity;
    const { submissionId } = await params;
    if (!z.uuid().safeParse(submissionId).success)
      return reply({ error: "Execution not found." }, 404);
    const repository = createExecutionRepository();
    const job = await repository.cancel(
      identity.user.id,
      submissionId,
    );
    if (job) recover(repository);
    return job
      ? reply(job, 202)
      : reply({ error: "Execution not found." }, 404);
  } catch (error) {
    return executionHttpError(error);
  }
}
