import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";
import { categoryContentKeys } from "@/features/catalog/keys";
import { studyNoteKeys } from "@/features/content/keys";

export type PracticeAttemptRequest = components["schemas"]["PracticeAttemptRequest"];

export type PracticeOutcome = PracticeAttemptRequest["outcome"];

interface SubmitPracticeInput {
  contentId: string;
  outcome: PracticeOutcome;
  hintUsed: boolean;
  durationSeconds?: number;
}

export function useSubmitPractice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contentId, outcome, hintUsed, durationSeconds }: SubmitPracticeInput) => {
      const body: PracticeAttemptRequest = {
        attempt_event_id: crypto.randomUUID(),
        content_item_id: contentId,
        outcome,
        hint_used: hintUsed,
        duration_seconds: durationSeconds,
        attempted_at: new Date().toISOString(),
      };
      const { data, error } = await apiClient.POST("/api/v1/practice/attempts", {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: studyNoteKeys.all }),
        queryClient.invalidateQueries({ queryKey: categoryContentKeys.all }),
      ]),
  });
}
