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
  list: (categoryId: string, filters: Record<string, any>) => [...categoryContentKeys.all, categoryId, filters] as const,
};

export function useCategoryContent({ categoryId, page = 1, pageSize = 25, ...filters }: UseCategoryContentOptions) {
  const queryParams = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });

  if (filters.difficulty) queryParams.append("difficulty", filters.difficulty);
  if (filters.status) queryParams.append("status", filters.status);
  if (filters.topic) queryParams.append("topic", filters.topic);
  if (filters.search) queryParams.append("search", filters.search);

  return useQuery({
    queryKey: categoryContentKeys.list(categoryId, { page, pageSize, ...filters }),
    queryFn: () => apiClient<CategoryContentListResponse>(`/categories/${categoryId}/content?${queryParams.toString()}`),
    enabled: !!categoryId,
  });
}
