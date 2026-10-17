import { z } from "zod";
import {
  executionIdentity,
  executionHttpError,
  reply,
} from "@/lib/dsa-execution/http";
import { createReportRepository } from "@/lib/dsa-reports/repository";
import { submissionViewSchema } from "@/lib/dsa-reports/contracts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const identity = await executionIdentity(request);
    if (identity instanceof Response) return identity;
    const query = z
      .object({
        problemId: z.uuid(),
        problemVersionId: z.uuid(),
        before: z.iso.datetime({ offset: true }).optional(),
        beforeId: z.uuid().optional(),
      })
      .strict()
      .refine((q) => !!q.before === !!q.beforeId)
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success)
      return reply({ error: "Invalid submission history query." }, 400);
    const { problemId, problemVersionId, before, beforeId } = query.data;
    const raw = await createReportRepository().history(
      identity.user.id,
      problemId,
      problemVersionId,
      before,
      beforeId,
    );
    const rows = z.array(submissionViewSchema).max(21).parse(raw.items);
    if (
      rows.some(
        (row) =>
          row.problemId !== problemId ||
          row.problemVersionId !== problemVersionId,
      )
    )
      throw new Error("History projection mismatch");
    const items = rows.slice(0, 20),
      last = items.at(-1);
    return reply({
      items,
      next:
        rows.length > 20 && last
          ? { before: last.createdAt, beforeId: last.submissionId }
          : null,
    });
  } catch (error) {
    return executionHttpError(error);
  }
}
