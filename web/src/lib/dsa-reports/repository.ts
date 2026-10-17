import "server-only";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/config/public";
import { getReasonAIConfiguration } from "@/lib/config/server";
import { ExecutionError } from "@/lib/dsa-execution/types";
import { REPORT_RUBRIC, type ReportRepository } from "./contracts";
export const codeIntelligenceEnabled = () =>
  process.env.DSA_CODE_INTELLIGENCE_ENABLED === "1" &&
  !!getReasonAIConfiguration().apiKey;
export function reportActivationBoundary(raw = process.env.DSA_CODE_INTELLIGENCE_CREATED_AFTER) {
  if (!raw?.trim()) return undefined;
  return z.iso.datetime().parse(raw.trim());
}
export function createReportRepository() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new ExecutionError(
      "REPORT_STORAGE_UNAVAILABLE",
      "Submission history and analysis storage is unavailable.",
    );
  const client = createClient(publicConfig.supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  async function command<T>(
    action: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await client
      .rpc("dsa_report_command", { p_action: action, p_args: args })
      .abortSignal(AbortSignal.timeout(8000));
    if (error || (data && typeof data === "object" && "code" in data))
      throw new ExecutionError(
        "REPORT_STORAGE_UNAVAILABLE",
        "Submission history and analysis storage is temporarily unavailable.",
      );
    return data as T;
  }
  const claim: ReportRepository["claim"] = (id, token) =>
    command("claim", { id, token, createdAfter: reportActivationBoundary() });
  const finish: ReportRepository["finish"] = (claim, outcome) =>
    command("finish", { id: claim.id, token: claim.token, ...outcome });
  return {
    claim,
    finish,
    dispatch: () =>
      command<Array<{ id: string; generation: number }>>("dispatch", {
        model: getReasonAIConfiguration().model,
        rubric: REPORT_RUBRIC,
        createdAfter: reportActivationBoundary(),
      }),
    get: (userId: string, submissionId: string) =>
      command<unknown>("get", { userId, submissionId }),
    history: (
      userId: string,
      problemId: string,
      problemVersionId: string,
      before?: string,
      beforeId?: string,
    ) =>
      command<{ items: unknown[] }>("history", {
        userId,
        problemId,
        problemVersionId,
        before,
        beforeId,
      }),
  };
}
