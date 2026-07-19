import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type ReviewResponse = components["schemas"]["ReviewResponse"];
export type ReviewListResponse = components["schemas"]["ReviewListResponse"];
export type SubmitRequest = components["schemas"]["SubmitRequest"];

export const reviewKeys = {
  all: ["reviews"] as const,
  due: () => [...reviewKeys.all, "due"] as const,
  history: () => [...reviewKeys.all, "history"] as const,
};

export function useDueReviews(page: number = 1, pageSize: number = 25) {
  return useQuery({
    queryKey: [...reviewKeys.due(), page, pageSize],
    queryFn: () => apiClient<ReviewListResponse>(`/me/reviews/due?page=${page}&page_size=${pageSize}`),
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cardId, data }: { cardId: string; data: SubmitRequest }) =>
      apiClient(`/me/reviews/${cardId}/submit`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      // Invalidate due reviews and progress
      queryClient.invalidateQueries({ queryKey: reviewKeys.due() });
      queryClient.invalidateQueries({ queryKey: ["content"] });
      queryClient.invalidateQueries({ queryKey: ["category-content"] });
    },
  });
}
