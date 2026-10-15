import { z } from "zod";
import {
  executionHttpError,
  executionIdentity,
  reply,
} from "@/lib/dsa-execution/http";
import {
  createExecutionRepository,
  executionConfigured,
} from "@/lib/dsa-execution/repository";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const identity = await executionIdentity(request);
    if (identity instanceof Response) return identity;
    if (!executionConfigured())
      return reply({
        run: false,
        submit: false,
        languages: [],
        runReason: "Code execution is not enabled.",
        submitReason: "Judged submissions are not enabled.",
      });
    const query = new URL(request.url).searchParams;
    const id = z.uuid().safeParse(query.get("problemId")),
      version = z.uuid().safeParse(query.get("problemVersionId"));
    if (!id.success || !version.success)
      return reply(
        { error: "Provide valid problem and specification version IDs." },
        422,
      );
    const result = await createExecutionRepository().availability(
      id.data,
      version.data,
    );
    return reply({
      ...result,
      languages: result.run || result.submit ? ["python"] : [],
      ...(!result.run
        ? {
            runReason:
              "Verified public fixtures and a certified Python contract are required for this version.",
          }
        : {}),
      ...(!result.submit
        ? {
            submitReason:
              "A certified hidden suite and Python contract are required for this version.",
          }
        : {}),
    });
  } catch (error) {
    return executionHttpError(error);
  }
}
