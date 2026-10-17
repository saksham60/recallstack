import "server-only";
import { publicConfig } from "@/lib/config/public";
import { createClient } from "@/lib/supabase/server";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import type { components } from "@/lib/api/types";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import type { ExecutionView } from "@/features/dsa/execution/contract";
import { createExecutionRepository } from "./repository";
import { createReportRepository } from "@/lib/dsa-reports/repository";
import {
  analysisSchema,
  reportResponseSchema,
} from "@/lib/dsa-reports/contracts";

type Problem = components["schemas"]["ProblemDetail"];
export class TutorContextError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}
interface Loaders {
  problem: (id: string, version: string, preview: boolean) => Promise<Problem>;
  execution: (userId: string, id: string) => Promise<ExecutionView | undefined>;
  report?: (userId: string, id: string) => Promise<unknown>;
}
/** Only the canonical API supplies specifications; private judge plans are never read. */
export async function hydrateTutorContext(
  input: DSATutorRequest,
  userId: string,
  loaders: Loaders,
): Promise<DSATutorRequest> {
  const context = input.context;
  if (!context.problemVersionId) return input; // Existing link-based learning pages.
  const problem = await loaders.problem(
    context.contentId,
    context.problemVersionId,
    context.preview === true,
  );
  if (
    problem.id !== context.contentId ||
    problem.problem_version_id !== context.problemVersionId
  )
    throw new TutorContextError(
      "This specification version is no longer available.",
      409,
    );
  let truncated = false;
  const bound = (value: string, limit: number) => {
    if (value.length > limit) truncated = true;
    return value.slice(0, limit);
  };
  const specification = {
    description: bound(problem.description, 12000),
    constraints: bound(JSON.stringify(problem.constraints), 4000),
    functionContract: bound(JSON.stringify(problem.function_contract), 6000),
    examples: bound(JSON.stringify(problem.examples), 6000),
    truncated: false,
  };
  specification.truncated = truncated;
  let publicExecution: typeof context.publicExecution;
  if (context.publicExecutionId && !context.selectedSubmissionId) {
    const job = await loaders.execution(userId, context.publicExecutionId);
    if (
      !job ||
      job.problemId !== problem.id ||
      job.problemVersionId !== problem.problem_version_id ||
      job.mode !== "run"
    )
      throw new TutorContextError(
        "Public execution not found for this problem version.",
        404,
      );
    // Explicit allowlist: even a malformed stored row cannot introduce hidden fields.
    const result = job.result
      ? {
          verdict: job.result.verdict,
          publicCases: job.result.publicCases?.slice(0, 20).map((item) => ({
            input: item.input,
            expectedOutput: item.expectedOutput,
            actualOutput: item.actualOutput,
            verdict: item.verdict,
            stdout: item.stdout?.slice(0, 2000),
            stderr: item.stderr?.slice(0, 2000),
          })),
        }
      : undefined;
    const encoded = JSON.stringify(result ?? null);
    publicExecution = {
      submissionId: job.submissionId,
      status: job.status,
      result: encoded.slice(0, 24000),
      resultTruncated: encoded.length > 24000,
      codeMayHaveChanged: true,
    };
  }
  let selectedSubmission: typeof context.selectedSubmission;
  let submittedCode: string | undefined;
  if (context.selectedSubmissionId) {
    const [job, raw] = await Promise.all([
      loaders.execution(userId, context.selectedSubmissionId),
      loaders.report?.(userId, context.selectedSubmissionId),
    ]);
    if (
      !job ||
      job.mode !== "submit" ||
      job.problemId !== problem.id ||
      job.problemVersionId !== problem.problem_version_id ||
      !["completed", "timed_out"].includes(job.status) ||
      !job.result
    )
      throw new TutorContextError(
        "Saved submission not found for this problem version.",
        404,
      );
    const saved = reportResponseSchema.omit({ enabled: true }).safeParse(raw);
    if (!saved.success || saved.data.submissionId !== job.submissionId)
      throw new TutorContextError(
        "Saved submission evidence could not be loaded.",
        404,
      );
    submittedCode = saved.data.sourceCode;
    const full =
      saved.data.report?.status === "completed"
        ? saved.data.report.analysis
        : undefined;
    // Keep structured keys/types while bounding each prose field/list. The model
    // receives no judge plan, hidden case, reference implementation or raw logs.
    const bounded = full
      ? JSON.parse(
          JSON.stringify(full, (_key, value) =>
            typeof value === "string"
              ? value.slice(0, 400)
              : Array.isArray(value)
                ? value.slice(0, 2)
                : value,
          ),
        )
      : null;
    selectedSubmission = {
      submissionId: job.submissionId,
      codeSha256: saved.data.codeSha256,
      language: job.language,
      judge: {
        verdict: job.result.verdict,
        gradingLevel: job.result.gradingLevel,
        executionTimeMs: job.result.executionTimeMs,
        memoryKiB: job.result.memoryKiB,
      },
      analysis: bounded ? analysisSchema.parse(bounded) : null,
      analysisTruncated: Boolean(
        full && JSON.stringify(full) !== JSON.stringify(bounded),
      ),
    };
  }
  return {
    ...input,
    context: {
      ...context,
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty ?? undefined,
      summary: problem.description.slice(0, 4000),
      specification,
      ...(publicExecution ? { publicExecution } : {}),
      ...(selectedSubmission
        ? {
            selectedSubmission,
            userCode: submittedCode!,
            language: selectedSubmission.language,
            userApproach: "",
            userNotes: "",
            publicExecution: undefined,
            publicExecutionId: undefined,
          }
        : {}),
    },
  };
}

export async function resolveTutorContext(
  input: DSATutorRequest,
  userId: string,
  request: Request,
) {
  if (!input.context.problemVersionId) return input;
  let authorization = request.headers.get("authorization");
  if (!authorization) {
    const { data } = await (await createClient()).auth.getSession();
    if (data.session) authorization = `Bearer ${data.session.access_token}`;
  }
  return hydrateTutorContext(input, userId, {
    problem: async (id, version, preview) => {
      const url = new URL(
        `/api/v1/dsa/problems/${encodeURIComponent(id)}`,
        publicConfig.apiBaseUrl,
      );
      url.searchParams.set("problem_version_id", version);
      url.searchParams.set("preview", String(preview));
      const response = await fetch(url, {
        headers: authorization ? { Authorization: authorization } : {},
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
      });
      if (!response.ok)
        throw new TutorContextError(
          "The authorized specification could not be loaded. Retry or load the current version.",
          [403, 404, 409].includes(response.status) ? response.status : 503,
        );
      return (await readBoundedJSON(response, 512 * 1024)) as Problem;
    },
    execution: (owner, id) => createExecutionRepository().get(owner, id),
    report: (owner, id) => createReportRepository().get(owner, id),
  });
}
