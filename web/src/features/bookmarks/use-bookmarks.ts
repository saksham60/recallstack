import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";
import { categoryContentKeys } from "@/features/catalog/keys";
import { studyNoteKeys } from "@/features/content/keys";

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
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: bookmarkKeys.all }),
        queryClient.invalidateQueries({ queryKey: categoryContentKeys.all }),
        queryClient.invalidateQueries({ queryKey: studyNoteKeys.all }),
      ]),
  });
}
