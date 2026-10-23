"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export type Days = 7 | 30 | 90;
const required = <T>(value: T | undefined): T => {
  if (!value) throw new Error("Empty analytics response");
  return value;
};
export function useIntelligence(days: Days, userId?: string, exclude = false) {
  return useQuery({
    queryKey: ["admin", "intelligence", days, userId, exclude],
    retry: false,
    staleTime: 30000,
    queryFn: async ({ signal }) =>
      userId
        ? required(
            (
              await apiClient.GET("/api/v1/admin/users/{user_id}/features", {
                params: { path: { user_id: userId }, query: { days } },
                signal,
              })
            ).data,
          )
        : required(
            (
              await apiClient.GET("/api/v1/admin/analytics/overview", {
                params: { query: { days, exclude_internal: exclude } },
                signal,
              })
            ).data,
          ),
  });
}
export function useIntelligenceTimeline(userId: string, days: Days) {
  return useInfiniteQuery({
    queryKey: ["admin", "intelligence-timeline", userId, days],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      required(
        (
          await apiClient.GET("/api/v1/admin/users/{user_id}/telemetry", {
            params: {
              path: { user_id: userId },
              query: { days, cursor: pageParam, limit: 30 },
            },
            signal,
          })
        ).data,
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  });
}
export function useIntelligenceUsers(
  days: Days,
  search: string,
  segment: string,
  exclude: boolean,
  offset: number,
) {
  return useQuery({
    queryKey: [
      "admin",
      "intelligence-users",
      days,
      search,
      segment,
      exclude,
      offset,
    ],
    retry: false,
    queryFn: async ({ signal }) =>
      required(
        (
          await apiClient.GET("/api/v1/admin/analytics/users", {
            params: {
              query: {
                days,
                search,
                segment,
                exclude_internal: exclude,
                limit: 25,
                offset,
              },
            },
            signal,
          })
        ).data,
      ),
  });
}
export function useIntelligenceExtra(
  kind: "health" | "funnels" | "cohorts",
  days: Days,
  exclude = false,
) {
  return useQuery({
    queryKey: ["admin", "intelligence-extra", kind, days, exclude],
    retry: false,
    queryFn: async ({ signal }) => {
      const params = {
        params: { query: { days, exclude_internal: exclude } },
        signal,
      };
      if (kind === "health")
        return required(
          (await apiClient.GET("/api/v1/admin/analytics/health", params)).data,
        );
      if (kind === "funnels")
        return required(
          (await apiClient.GET("/api/v1/admin/analytics/funnels", params)).data,
        );
      return required(
        (await apiClient.GET("/api/v1/admin/analytics/cohorts", params)).data,
      );
    },
  });
}
export function useIntelligenceSessions(
  userId: string,
  days: Days,
  offset: number,
) {
  return useQuery({
    queryKey: ["admin", "intelligence-sessions", userId, days, offset],
    retry: false,
    queryFn: async ({ signal }) =>
      required(
        (
          await apiClient.GET("/api/v1/admin/users/{user_id}/sessions", {
            params: {
              path: { user_id: userId },
              query: { days, limit: 30, offset },
            },
            signal,
          })
        ).data,
      ),
  });
}
