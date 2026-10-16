"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { getBrowserClient } from "@/lib/supabase/client";
import { createAuthenticatedReasonAIFetch } from "@/lib/reasonai/authenticated-request";
import { boardSchema, type BoardLayout, type PersonalBoard } from "./contracts";
import type { useDSAScope, ProblemItem } from "../workspace/api";

type Scope = ReturnType<typeof useDSAScope>;
export function useTopicProgress(scope: Scope) {
  return useQuery({
    queryKey: [...scope.key, "topic-progress"],
    enabled: !!scope.userId && !scope.preview,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET(
        "/api/v1/dsa/me/topic-progress",
        { signal },
      );
      if (error) throw error;
      return data!.items;
    },
  });
}
export function useBoardProblems(scope: Scope, category: string) {
  return useQuery({
    queryKey: [...scope.key, "board-problems", category],
    retry: 1,
    staleTime: 30000,
    queryFn: async ({ signal }) => {
      const items: ProblemItem[] = [],
        seen = new Set<string>();
      let cursor: string | undefined;
      for (let page = 0; page < 100; page++) {
        const { data, error } = await apiClient.GET("/api/v1/dsa/problems", {
          signal,
          params: {
            query: {
              category,
              preview: scope.preview,
              limit: 50,
              sort: "title_asc",
              cursor,
            },
          },
        });
        if (error) throw error;
        for (const item of data!.items) {
          if (seen.has(item.id))
            throw new Error(
              "The catalog changed during loading. Please refresh.",
            );
          seen.add(item.id);
          items.push(item);
        }
        if (!data!.has_more) return items;
        if (!data!.next_cursor || data!.next_cursor === cursor)
          throw new Error("The catalog pagination could not continue safely.");
        cursor = data!.next_cursor;
      }
      throw new Error("This board exceeds the supported catalog size.");
    },
  });
}
export function useBoardBookmarks(scope: Scope) {
  return useQuery({
    queryKey: [...scope.key, "board-bookmarks"],
    enabled: !!scope.userId,
    queryFn: async ({ signal }) => {
      const ids: string[] = [];
      for (let page = 1; page <= 1000; page++) {
        const { data, error } = await apiClient.GET(
          "/api/v1/dsa/me/bookmarks",
          { signal, params: { query: { page, page_size: 50 } } },
        );
        if (error) throw error;
        ids.push(...data!.items.map((item) => item.content_item_id));
        if (page >= data!.pagination.total_pages) return ids;
      }
      throw new Error("Bookmark pagination exceeded the supported limit.");
    },
  });
}
async function boardRequest(
  category: string,
  init?: RequestInit,
  signal?: AbortSignal,
) {
  const request = createAuthenticatedReasonAIFetch(getBrowserClient().auth);
  const response = await request(`/api/dsa/boards/${category}`, init, signal);
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Could not save your personal board.");
  return boardSchema.parse(body);
}
export function usePersonalBoard(scope: Scope, category: string) {
  const client = useQueryClient();
  const key = [...scope.key, "personal-board", category];
  const query = useQuery({
    queryKey: key,
    enabled: !!scope.userId && !scope.preview,
    retry: false,
    queryFn: ({ signal }) => boardRequest(category, undefined, signal),
  });
  const change = useMutation({
    mutationFn: (layout: BoardLayout) =>
      boardRequest(category, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowVersion: query.data!.rowVersion, layout }),
      }),
    onMutate: async (layout) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<PersonalBoard>(key);
      if (previous) client.setQueryData(key, { ...previous, layout });
      return previous;
    },
    onError: (_error, _layout, previous) => {
      if (previous) client.setQueryData(key, previous);
    },
    onSuccess: (data) => client.setQueryData(key, data),
  });
  return { query, change };
}
export function useCompanies(scope: Scope, items?: ProblemItem[]) {
  return useQuery({
    queryKey: [
      ...scope.key,
      "board-companies",
      items?.map((p) => p.problem_version_id),
    ],
    enabled: !!items?.length && !!scope.userId && !scope.preview,
    retry: false,
    queryFn: async ({ signal }) => {
      const request = createAuthenticatedReasonAIFetch(getBrowserClient().auth);
      const response = await request(
        "/api/dsa/board-companies",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            versions: items!.map((p) => p.problem_version_id),
          }),
        },
        signal,
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Company metadata is unavailable.");
      return body.items as Array<{
        problemVersionId: string;
        slug: string;
        name: string;
      }>;
    },
  });
}
