import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/config/public";
import type { ExecutionView } from "@/features/dsa/execution/contract";
import {
  ExecutionError,
  type ClaimedJob,
  type ExecutionRepository,
} from "./types";
import { validatePlan } from "./judge";
import { createHash } from "node:crypto";
import { HARNESS_SHA256 } from "./python/harness.generated";
import type { PublicRunBundle } from "./python-contract";

const errors: Record<string, [number, string]> = {
  NOT_ELIGIBLE: [
    409,
    "This version does not have an eligible certified test suite.",
  ],
  ACCOUNT_LIMIT: [
    429,
    "Your execution limit has been reached. Wait for an active job or try again later.",
  ],
  IDEMPOTENCY_CONFLICT: [
    409,
    "This execution key was already used for different code or options.",
  ],
  LEASE_LOST: [409, "The execution worker lease changed."],
  OPERATION_CONFLICT: [409, "The execution operation changed."],
};
export function executionConfigured(): boolean {
  return (
    process.env.DSA_EXECUTIONS_ENABLED === "1" &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !!process.env.NEBIUS_API_KEY &&
    !!process.env.CONTREE_PROJECT &&
    !!process.env.CONTREE_PYTHON_IMAGE
  );
}
export class SupabaseExecutionRepository implements ExecutionRepository {
  constructor(private readonly client: SupabaseClient) {}
  private async command<T>(
    action: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.client
      .rpc("dsa_execution_command", { p_action: action, p_args: args })
      .abortSignal(AbortSignal.timeout(8000));
    if (error)
      throw new ExecutionError(
        "PERSISTENCE_UNAVAILABLE",
        "Execution storage is temporarily unavailable.",
      );
    if (data && typeof data === "object" && "code" in data) {
      const code = String(data.code),
        [status, message] = errors[code] ?? [
          503,
          "Execution storage rejected this request.",
        ];
      throw new ExecutionError(code, message, status);
    }
    return data as T;
  }
  async availability(problemId: string, problemVersionId: string) {
    const plans = await this.command<{ run: unknown; submit: unknown }>(
      "availability",
      { problemId, problemVersionId },
    );
    function usable(plan: unknown) {
      if (!plan) return false;
      try {
        validatePlan(plan);
        return true;
      } catch {
        return false;
      }
    }
    let publicRun: PublicRunBundle | undefined;
    if (usable(plans.run)) {
      const plan = validatePlan(plans.run);
      if (
        plan.problemId === problemId &&
        plan.problemVersionId === problemVersionId &&
        plan.cases.every((c) => c.visibility === "public")
      ) {
        const cases = plan.cases.map(({ id, input, expected }) => ({
          id,
          input,
          expected,
        }));
        const revision = createHash("sha256")
          .update(
            JSON.stringify({
              suiteId: plan.suiteId,
              certificateId: plan.certificateId,
              certificationRunId: plan.certificationRunId,
              contract: plan.contract,
              cases,
              harness: HARNESS_SHA256,
            }),
          )
          .digest("hex");
        const contractRevision =
          plan.contractRevision ??
          createHash("sha256")
            .update(JSON.stringify(plan.contract))
            .digest("hex");
        publicRun = {
          schemaVersion: 1,
          problemId,
          problemVersionId,
          suiteId: plan.suiteId,
          revision,
          contractRevision,
          harnessSha256: HARNESS_SHA256,
          contract: plan.contract,
          ...(plan.gradingLevel ? { gradingLevel: plan.gradingLevel } : {}),
          cases,
        };
      }
    }
    return {
      run: !!publicRun,
      submit: usable(plans.submit),
      ...(usable(plans.submit)
        ? {
            gradingLevel:
              validatePlan(plans.submit).gradingLevel ?? ("official" as const),
          }
        : {}),
      ...(publicRun ? { publicRun } : {}),
    };
  }
  create: ExecutionRepository["create"] = (userId, request, hash) =>
    this.command("create", { userId, request, hash });
  get: ExecutionRepository["get"] = async (userId, id) =>
    (await this.command<ExecutionView | null>("get", { userId, id })) ??
    undefined;
  cancel: ExecutionRepository["cancel"] = async (userId, id) =>
    (await this.command<ExecutionView | null>("cancel", { userId, id })) ??
    undefined;
  claim: ExecutionRepository["claim"] = async (id, token) =>
    (await this.command<ClaimedJob | "done" | null>("claim", { id, token })) ??
    undefined;
  plan: ExecutionRepository["plan"] = async (job) =>
    validatePlan(await this.command("plan", { id: job.id, token: job.token }));
  launch: ExecutionRepository["launch"] = (job) =>
    this.command("launch", { id: job.id, token: job.token });
  operation: ExecutionRepository["operation"] = (job, operationId) =>
    this.command("operation", { id: job.id, token: job.token, operationId });
  finish: ExecutionRepository["finish"] = async (
    job,
    status,
    result,
    error,
    release = true,
  ) => {
    await this.command("finish", {
      id: job.id,
      token: job.token,
      status,
      result,
      error,
      release,
    });
  };
  defer: ExecutionRepository["defer"] = async (job) => {
    await this.command("defer", { id: job.id, token: job.token });
  };
  dispatch: ExecutionRepository["dispatch"] = () =>
    this.command("dispatch", {});
}
export function createExecutionRepository(): ExecutionRepository {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new ExecutionError(
      "NOT_CONFIGURED",
      "Execution storage is not configured.",
    );
  return new SupabaseExecutionRepository(
    createClient(publicConfig.supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
}
