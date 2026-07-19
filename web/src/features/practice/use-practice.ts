import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type PracticeAttemptRequest = components["schemas"]["PracticeAttemptRequest"];

export function useSubmitPractice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: PracticeAttemptRequest) => {
      const { data, error } = await apiClient.POST("/api/v1/practice/attempts", {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate both study note and problem list queries
      queryClient.invalidateQueries({ queryKey: ["content"] });
      queryClient.invalidateQueries({ queryKey: ["category-content"] });
    },
  });
}
