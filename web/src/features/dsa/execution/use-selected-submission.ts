"use client";
import { useQuery } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/client";
import { createAuthenticatedReasonAIFetch } from "@/lib/reasonai/authenticated-request";
import { submissionViewSchema } from "@/lib/dsa-reports/contracts";
import type { ExecutionView } from "./contract";
export function useSelectedSubmission(
  userId: string,
  problemId: string,
  versionId: string,
  id: string | undefined,
  latest: ExecutionView | undefined,
) {
  return useQuery({
    queryKey: ["dsa-selected-submission", userId, problemId, versionId, id],
    enabled: Boolean(id && id !== latest?.submissionId),
    queryFn: async ({ signal }) => {
      const response = await createAuthenticatedReasonAIFetch(
        getBrowserClient().auth,
      )(
        `/api/dsa/executions/${id}`,
        {},
        AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      );
      if (!response.ok)
        throw new Error("This saved submission could not be loaded.");
      const job = submissionViewSchema.parse(await response.json());
      if (
        job.submissionId !== id ||
        job.problemId !== problemId ||
        job.problemVersionId !== versionId
      )
        throw new Error(
          "Saved submission does not belong to this problem version.",
        );
      return job;
    },
    retry: false,
    staleTime: (query) =>
      query.state.data &&
      !["queued", "running"].includes(query.state.data.status)
        ? Infinity
        : 0,
    refetchInterval: (query) =>
      query.state.data &&
      ["queued", "running"].includes(query.state.data.status)
        ? 2000
        : false,
  });
}
