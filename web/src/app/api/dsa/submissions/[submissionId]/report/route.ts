import { z } from "zod";
import { after } from "next/server";
import {
  executionIdentity,
  executionHttpError,
  reply,
} from "@/lib/dsa-execution/http";
import {
  codeIntelligenceEnabled,
  createReportRepository,
} from "@/lib/dsa-reports/repository";
import { reportResponseSchema } from "@/lib/dsa-reports/contracts";
import { dispatchReports } from "@/lib/dsa-reports/queue";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const identity = await executionIdentity(request);
    if (identity instanceof Response) return identity;
    const { submissionId } = await params;
    if (!z.uuid().safeParse(submissionId).success)
      return reply({ error: "Submission not found." }, 404);
    if (!codeIntelligenceEnabled())
      return reply(
        { error: "Code Intelligence is currently unavailable." },
        503,
      );
    const status = await createReportRepository().retry(
      identity.user.id,
      submissionId,
    );
    if (status === "not_found")
      return reply({ error: "Submission report not found." }, 404);
    if (status === "queued")
      after(async () => {
        try {
          // Explicit owned retries may predate the automatic activation boundary.
          await dispatchReports(submissionId);
        } catch {
          /* Recovery cron and subsequent status checks can redispatch. */
        }
      });
    return reply({ status }, status === "queued" ? 202 : 200);
  } catch (error) {
    return executionHttpError(error);
  }
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
      return reply({ error: "Submission not found." }, 404);
    const raw = await createReportRepository().get(
      identity.user.id,
      submissionId,
    );
    if (!raw) return reply({ error: "Submission not found." }, 404);
    const result = reportResponseSchema.parse({
      ...(raw as object),
      enabled: codeIntelligenceEnabled(),
    });
    if (result.submissionId !== submissionId)
      throw new Error("Report projection mismatch");
    if (
      result.enabled &&
      (!result.report ||
        ["queued", "generating"].includes(result.report.status))
    )
      after(async () => {
        try {
          await dispatchReports(submissionId);
        } catch {
          /* Durable outbox remains pending. */
        }
      });
    return reply(result);
  } catch (error) {
    return executionHttpError(error);
  }
}
