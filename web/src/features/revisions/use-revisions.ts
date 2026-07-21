import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";
import { categoryContentKeys } from "@/features/catalog/keys";
import { studyNoteKeys } from "@/features/content/keys";

export type DueItem = components["schemas"]["DueItem"];
type SubmitRequest = components["schemas"]["SubmitRequest"];
export type ReviewRating = SubmitRequest["rating"];

export const reviewKeys = {
  all: ["reviews"] as const,
  due: () => [...reviewKeys.all, "due"] as const,
  dueList: (page: number, pageSize: number) => [...reviewKeys.due(), page, pageSize] as const,
};

export function useDueReviews(page = 1, pageSize = 25) {
  return useQuery({
    queryKey: reviewKeys.dueList(page, pageSize),
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
    mutationFn: async ({ cardId, rating, expectedRowVersion }: { cardId: string; rating: ReviewRating; expectedRowVersion: number }) => {
      const body: SubmitRequest = {
        review_event_id: crypto.randomUUID(),
        rating,
        reviewed_at: new Date().toISOString(),
        expected_row_version: expectedRowVersion,
      };
      const { data, error } = await apiClient.POST("/api/v1/me/reviews/{cardId}/submit", {
        params: { path: { cardId } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewKeys.due() }),
      queryClient.invalidateQueries({ queryKey: studyNoteKeys.all }),
      queryClient.invalidateQueries({ queryKey: categoryContentKeys.all }),
    ]),
  });
}
