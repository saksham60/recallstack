"use client";

import { useEffect, useState } from "react";
import { createAuthenticatedReasonAIFetch } from "@/lib/reasonai/authenticated-request";
import { getBrowserClient } from "@/lib/supabase/client";

export type PracticeSubmission = {
  id: string;
  createdAt: string;
  checkStatus: "examples_passed" | "examples_failed" | "not_evaluated";
  clientCheckedCount: number;
  clientPassedCount: number;
  gradingLevel: "browser_examples_unverified";
};
const client = () => createAuthenticatedReasonAIFetch(getBrowserClient().auth);

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Submission could not be saved.");
  return body as T;
}

export function usePracticeSubmissions(problemId: string, problemVersionId: string) {
  const [latest, setLatest] = useState<PracticeSubmission | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await json<{ latest: PracticeSubmission | null }>(
          await client()(
            `/api/dsa/practice-submissions?problemId=${problemId}&problemVersionId=${problemVersionId}`,
            {}, controller.signal,
          ),
        );
        if (!controller.signal.aborted) setLatest(result.latest);
      } catch {
        // History retrieval failure does not prevent new submissions.
      }
    })();
    return () => controller.abort();
  }, [problemId, problemVersionId]);

  return { latest };
}
