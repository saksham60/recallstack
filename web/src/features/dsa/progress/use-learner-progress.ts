"use client";
import { useQuery } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/client";
import { createAuthenticatedReasonAIFetch } from "@/lib/reasonai/authenticated-request";
import { learnerProgressSchema } from "./contract";
import type { useDSAScope } from "../workspace/api";

export function useLearnerProgress(scope: ReturnType<typeof useDSAScope>) {
  return useQuery({
    queryKey: ["dsa", scope.userId ?? "anonymous", "learner-progress"],
    enabled: !!scope.userId,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await createAuthenticatedReasonAIFetch(
        getBrowserClient().auth,
      )(
        "/api/dsa/learner-progress",
        {},
        AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      );
      if (!response.ok)
        throw new Error("Saved problem progress could not be loaded.");
      return learnerProgressSchema.parse(await response.json()).items;
    },
  });
}
