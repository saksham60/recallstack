import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";
import { categoryKeys } from "./keys";

export type CategoryDashboardResponse = components["schemas"]["CategoryDashboardResponse"];

export function useCategories(domainSlug: string = "dsa") {
  return useQuery({
    queryKey: categoryKeys.domain(domainSlug),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/domains/{domainSlug}/categories", {
        params: { path: { domainSlug } },
      });
      if (error) throw error;
      return data;
    },
  });
}
