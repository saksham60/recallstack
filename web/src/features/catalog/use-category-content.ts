import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";
import { categoryContentKeys } from "./keys";

export type CategoryContentListResponse = components["schemas"]["CategoryContentListResponse"];
export type CategoryContentItemResponse = components["schemas"]["CategoryContentItemResponse"];
export type ContentUserProgressResponse = components["schemas"]["ContentUserProgressResponse"];

interface UseCategoryContentOptions {
  categoryId: string;
  page?: number;
  pageSize?: number;
  difficulty?: "easy" | "medium" | "hard";
  status?: "new" | "learning" | "attempted" | "confident" | "mastered";
  topic?: string;
  search?: string;
}

export function useCategoryContent({ categoryId, page = 1, pageSize = 25, ...filters }: UseCategoryContentOptions) {
  return useQuery({
    queryKey: categoryContentKeys.list(categoryId, { page, pageSize, ...filters }),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/categories/{categoryId}/content", {
        params: { 
          path: { categoryId },
          query: {
            page,
            page_size: pageSize,
            difficulty: filters.difficulty,
            status: filters.status,
            topic: filters.topic,
            search: filters.search,
          }
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!categoryId,
  });
}
