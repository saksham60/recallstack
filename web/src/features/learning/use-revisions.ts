import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type DueResponse = components["schemas"]["DueResponse"];
export type DueItem = components["schemas"]["DueItem"];
export type SubmitRequest = components["schemas"]["SubmitRequest"];

export const reviewKeys = {
  all: ["reviews"] as const,
  due: () => [...reviewKeys.all, "due"] as const,
  history: () => [...reviewKeys.all, "history"] as const,
};

export function useDueReviews(page: number = 1, pageSize: number = 25) {
  return useQuery({
    queryKey: [...reviewKeys.due(), page, pageSize],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/me/reviews/due", {
        params: { query: { page, page_size: pageSize } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, body }: { cardId: string; body: SubmitRequest }) => {
      const { data, error } = await apiClient.POST("/api/v1/me/reviews/{cardId}/submit", {
        params: { path: { cardId } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate due reviews and progress
      queryClient.invalidateQueries({ queryKey: reviewKeys.due() });
      queryClient.invalidateQueries({ queryKey: ["content"] });
      queryClient.invalidateQueries({ queryKey: ["category-content"] });
    },
  });
}
