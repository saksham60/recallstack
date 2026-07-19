import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type SearchResponse = components["schemas"]["SearchResponse"];
export type SearchItem = components["schemas"]["SearchItem"];

export const searchKeys = {
  all: ["search"] as const,
  query: (q: string) => [...searchKeys.all, q] as const,
};

export function useSearch(query: string) {
  return useQuery({
    queryKey: searchKeys.query(query),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/search", {
        params: { query: { q: query } },
      });
      if (error) throw error;
      return data;
    },
    enabled: query.length > 2,
    staleTime: 5 * 60 * 1000,
  });
}
