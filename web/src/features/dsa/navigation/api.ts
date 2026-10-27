"use client";
import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { getBrowserClient } from "@/lib/supabase/client";
import { createAuthenticatedReasonAIFetch } from "@/lib/reasonai/authenticated-request";
import { boardSchema, type BoardLayout, type PersonalBoard } from "./contracts";
import type { useDSAScope, ProblemItem } from "../workspace/api";
import { useLearnerProgress } from "../progress/use-learner-progress";
import { topicProgress } from "../progress/contract";

type Scope = ReturnType<typeof useDSAScope>;
export function useTopicProgress(scope: Scope) {
  const query = useLearnerProgress(scope);
  return { ...query, data: query.data ? topicProgress(query.data) : undefined };
}
type BoardPage = { items: ProblemItem[]; has_more: boolean; next_cursor?: string | null };
class BoardCatalogChangedError extends Error {}
function flattenBoardPages(data: InfiniteData<BoardPage, string | undefined>) {
  const items = data.pages.flatMap(page => page.items);
  if (new Set(items.map(item => item.id)).size !== items.length)
    throw new BoardCatalogChangedError("The catalog changed during loading. Please refresh.");
  const last = data.pages.at(-1);
  if (last?.has_more && data.pageParams.includes(last.next_cursor ?? undefined))
    throw new BoardCatalogChangedError("The catalog pagination could not continue safely.");
  if (data.pages.length >= 100 && last?.has_more)
    throw new BoardCatalogChangedError("This board exceeds the supported catalog size.");
  return items;
}
export function useBoardProblems(scope: Scope, category: string) {
  const query = useInfiniteQuery({
    queryKey: [...scope.key, "board-problems", category],
    retry: 1,
    staleTime: 30000,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam: cursor }) => {
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
        if (data!.has_more && (!data!.items.length || !data!.next_cursor || data!.next_cursor === cursor))
          throw new Error("The catalog pagination could not continue safely.");
        return data!;
    },
    getNextPageParam: page => page.has_more ? page.next_cursor ?? undefined : undefined,
    select: flattenBoardPages,
  });
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  useEffect(() => {
    // Cursor pages remain sequential. Never interrupt a background refetch or
    // automatically loop on an error; a failed continuation has an explicit retry.
    if (hasNextPage && !isFetching && !isError)
      void fetchNextPage({ cancelRefetch: false });
  }, [hasNextPage, isFetching, isError, fetchNextPage]);
  return {
    ...query,
    complete: !!query.data && !hasNextPage && !query.error,
    // A transport error leaves valid earlier pages intact. A validation error
    // invalidates the cursor history, so rebuild it from page one on retry.
    retryRemaining: () => query.isFetchNextPageError && !(query.error instanceof BoardCatalogChangedError)
      ? query.fetchNextPage()
      : query.refetch(),
  };
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
        reviewStatus?: "imported" | "reviewed";
      }>;
    },
  });
}
