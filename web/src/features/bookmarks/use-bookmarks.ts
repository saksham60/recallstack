import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type BookmarkListResponse = components["schemas"]["BookmarkListResponse"];

export const bookmarkKeys = {
  all: ["bookmarks"] as const,
  list: (page: number, pageSize: number) => [...bookmarkKeys.all, "list", page, pageSize] as const,
};

export function useBookmarks(page: number = 1, pageSize: number = 25) {
  return useQuery({
    queryKey: bookmarkKeys.list(page, pageSize),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/me/bookmarks", {
        params: { query: { page, page_size: pageSize } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contentId, isBookmarked }: { contentId: string; isBookmarked: boolean }) => {
      if (isBookmarked) {
        const { data, error } = await apiClient.DELETE("/api/v1/me/bookmarks/{contentId}", {
          params: { path: { contentId } },
        });
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await apiClient.PUT("/api/v1/me/bookmarks/{contentId}", {
          params: { path: { contentId } },
        });
        if (error) throw error;
        return data;
      }
    },
    // Optimistic Update
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: bookmarkKeys.all });
      
      // Update any query containing this contentId to toggle `is_bookmarked`
      // For simplicity, we just invalidate here, but an ideal implementation would optimistically update 
      // the list and detail queries.
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all });
      queryClient.invalidateQueries({ queryKey: ["category-content"] }); // Invalidates the problem list
      queryClient.invalidateQueries({ queryKey: ["content"] }); // Invalidates the study note page
    },
  });
}
