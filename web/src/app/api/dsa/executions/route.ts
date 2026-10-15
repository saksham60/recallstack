import { createHash } from "node:crypto";
import { after } from "next/server";
import { executionRequestSchema } from "@/features/dsa/execution/contract";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import {
  executionHttpError,
  executionIdentity,
  reply,
} from "@/lib/dsa-execution/http";
import {
  createExecutionRepository,
  executionConfigured,
} from "@/lib/dsa-execution/repository";
import { dispatchExecutions } from "@/lib/dsa-execution/queue";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    const identity = await executionIdentity(request);
    if (identity instanceof Response) return identity;
    if (!executionConfigured())
      return reply(
        { error: "Code execution is not enabled.", code: "NOT_CONFIGURED" },
        503,
      );
    let body: unknown;
    try {
      body = await readBoundedJSON(request, 131072);
    } catch {
      return reply(
        {
          error: "Provide a JSON request within the supported size limit.",
          code: "INVALID_REQUEST",
        },
        400,
      );
    }
    const parsed = executionRequestSchema.safeParse(body);
    if (!parsed.success)
      return reply(
        {
          error:
            "Provide a supported language, nonempty code, problem/version IDs and an execution key.",
          code: "INVALID_REQUEST",
        },
        422,
      );
    const repository = createExecutionRepository();
    const available = await repository.availability(
      parsed.data.problemId,
      parsed.data.problemVersionId,
    );
    if (!available[parsed.data.mode])
      return reply(
        {
          error: "This version does not have an eligible certified test suite.",
          code: "NOT_ELIGIBLE",
        },
        409,
      );
    const content = {
      problemId: parsed.data.problemId,
      problemVersionId: parsed.data.problemVersionId,
      code: parsed.data.code,
      mode: parsed.data.mode,
      language: parsed.data.language,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex");
    const job = await repository.create(identity.user.id, parsed.data, hash);
    after(async () => {
      try {
        await dispatchExecutions(repository);
      } catch {
        /* Durable outbox recovery will publish. */
      }
    });
    return reply({ ...job }, 202);
  } catch (error) {
    return executionHttpError(error);
  }
}
