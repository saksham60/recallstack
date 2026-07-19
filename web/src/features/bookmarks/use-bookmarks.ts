import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type BookmarkListResponse = components["schemas"]["BookmarkListResponse"];

export const bookmarkKeys = {
  all: ["bookmarks"] as const,
  list: (page: number) => [...bookmarkKeys.all, "list", page] as const,
};

export function useBookmarks(page: number = 1, pageSize: number = 25) {
  return useQuery({
    queryKey: bookmarkKeys.list(page),
    queryFn: () => 
      apiClient<BookmarkListResponse>(`/bookmarks?page=${page}&page_size=${pageSize}`),
  });
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contentId, isBookmarked }: { contentId: string; isBookmarked: boolean }) => {
      if (isBookmarked) {
        return apiClient(`/content/${contentId}/bookmarks`, { method: "DELETE" });
      } else {
        return apiClient(`/content/${contentId}/bookmarks`, { method: "POST" });
      }
    },
    // Optimistic Update
    onMutate: async ({ contentId, isBookmarked }) => {
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
