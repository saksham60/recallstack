import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type CategoryContentListResponse = components["schemas"]["CategoryContentListResponse"];
export type CategoryContentItemResponse = components["schemas"]["CategoryContentItemResponse"];
export type ContentUserProgressResponse = components["schemas"]["ContentUserProgressResponse"];

interface UseCategoryContentOptions {
  categoryId: string;
  page?: number;
  pageSize?: number;
  difficulty?: string;
  status?: string;
  topic?: string;
  search?: string;
}

export const categoryContentKeys = {
  all: ["category-content"] as const,
  list: (categoryId: string, filters: Record<string, unknown>) => [...categoryContentKeys.all, categoryId, filters] as const,
};

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
            difficulty: filters.difficulty as "easy" | "medium" | "hard" | undefined,
            status: filters.status as "new" | "learning" | "attempted" | "confident" | "mastered" | undefined,
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
