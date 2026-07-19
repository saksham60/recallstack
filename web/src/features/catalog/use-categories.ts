import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type CategoryDashboardResponse = components["schemas"]["CategoryDashboardResponse"];

export const categoryKeys = {
  all: ["domain-categories"] as const,
  domain: (domainSlug: string) => [...categoryKeys.all, domainSlug] as const,
};

export function useCategories(domainSlug: string = "dsa") {
  return useQuery({
    queryKey: categoryKeys.domain(domainSlug),
    queryFn: () => apiClient<CategoryDashboardResponse[]>(`/domains/${domainSlug}/categories`),
  });
}
