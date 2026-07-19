import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type PracticeAttemptRequest = components["schemas"]["PracticeAttemptRequest"];

export function useSubmitPractice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PracticeAttemptRequest) =>
      apiClient("/practice/attempts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, variables) => {
      // Invalidate both study note and problem list queries
      queryClient.invalidateQueries({ queryKey: ["content"] });
      queryClient.invalidateQueries({ queryKey: ["category-content"] });
    },
  });
}
