import { z } from "zod";
import { approvedContractSchema } from "@/lib/dsa-execution/python-contract";
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
    const query = new URL(request.url).searchParams;
    const id = z.uuid().safeParse(query.get("problemId")),
      version = z.uuid().safeParse(query.get("problemVersionId"));
    if (!id.success || !version.success)
      return reply(
        { error: "Provide valid problem and specification version IDs." },
        422,
      );
    const [executionResult, contractResult] = await Promise.allSettled([
      executionConfigured()
        ? createExecutionRepository().availability(id.data, version.data)
        : Promise.resolve({ run: false, submit: false }),
      identity.supabase
        .rpc("dsa_v3_problem_contract", {
          p_problem: id.data,
          p_version: version.data,
        })
        .abortSignal(AbortSignal.timeout(8000)),
    ]);
    const result =
      executionResult.status === "fulfilled"
        ? executionResult.value
        : { run: false, submit: false };
    const parsed = approvedContractSchema.safeParse(
      contractResult.status === "fulfilled" && !contractResult.value.error
        ? contractResult.value.data
        : null,
    );
    const approvedContract =
      parsed.success &&
      parsed.data.problemId === id.data &&
      parsed.data.problemVersionId === version.data
        ? parsed.data
        : undefined;
    return reply({
      ...result,
      ...(approvedContract ? { approvedContract } : {}),
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
