"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components, operations } from "@/lib/api/types";

export type Problem = components["schemas"]["ProblemDetail"];
export type ProblemItem = components["schemas"]["ProblemItem"];
export type Note = components["schemas"]["NoteResponse"];
export type Status = components["schemas"]["LearningStatus"];
export type Filters = Pick<
  NonNullable<operations["listDsaProblems"]["parameters"]["query"]>,
  "search" | "difficulty" | "category" | "topic"
>;
const retry = (count: number, error: Error) =>
  !(error instanceof ApiError && error.status < 500) && count < 1;
export function useDSAScope(preview = false) {
  const { user } = useAuth();
  return {
    userId: user?.id,
    preview,
    key: ["dsa", user?.id ?? "anonymous", preview] as const,
  };
}
type Scope = ReturnType<typeof useDSAScope>;

export function useCatalog(scope: Scope, filters: Filters) {
  return useInfiniteQuery({
    queryKey: [...scope.key, "catalog", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await apiClient.GET("/api/v1/dsa/problems", {
        signal,
        params: {
          query: {
            ...filters,
            preview: scope.preview,
            cursor: pageParam,
            limit: 20,
            sort: "title_asc",
          },
        },
      });
      if (error) throw error;
      return data!;
    },
    getNextPageParam: (page) =>
      page.has_more ? (page.next_cursor ?? undefined) : undefined,
    retry,
  });
}
export function useTaxonomy(scope: Scope, kind: "categories" | "topics") {
  return useQuery({
    queryKey: [...scope.key, kind],
    retry,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET(
        kind === "categories" ? "/api/v1/dsa/categories" : "/api/v1/dsa/topics",
        { signal, params: { query: { preview: scope.preview } } },
      );
      if (error) throw error;
      return data!;
    },
  });
}
export function useProblem(scope: Scope, id?: string, version?: string) {
  return useQuery({
    queryKey: [...scope.key, "problem", id, version],
    enabled: !!id,
    retry,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET(
        "/api/v1/dsa/problems/{problem_id}",
        {
          signal,
          params: {
            path: { problem_id: id! },
            query: { preview: scope.preview, problem_version_id: version },
          },
        },
      );
      if (error) throw error;
      return data!;
    },
  });
}
export function usePublicTests(scope: Scope, problem: Problem) {
  return useInfiniteQuery({
    queryKey: [...scope.key, "tests", problem.id, problem.problem_version_id],
    initialPageParam: undefined as string | undefined,
    retry,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await apiClient.GET(
        "/api/v1/dsa/problems/{problem_id}/test-cases",
        {
          signal,
          params: {
            path: { problem_id: problem.id },
            query: {
              preview: scope.preview,
              problem_version_id: problem.problem_version_id,
              cursor: pageParam,
              limit: 20,
            },
          },
        },
      );
      if (error) throw error;
      return data!;
    },
    getNextPageParam: (page) =>
      page.has_more ? (page.next_cursor ?? undefined) : undefined,
  });
}
export function useCapabilities() {
  return useQuery({
    queryKey: ["dsa-capabilities"],
    retry,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET("/api/v1/dsa/capabilities", {
        signal,
      });
      if (error) throw error;
      return data!;
    },
  });
}
export function useStatistics(scope: Scope) {
  return useQuery({
    queryKey: [...scope.key, "statistics"],
    enabled: !!scope.userId,
    retry,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET("/api/v1/dsa/me/statistics", {
        signal,
      });
      if (error) throw error;
      return data!;
    },
  });
}
export function useProgress(scope: Scope, id: string) {
  return useQuery({
    queryKey: [...scope.key, "progress", id],
    enabled: !!scope.userId,
    retry,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET(
        "/api/v1/dsa/me/problems/{problem_id}/progress",
        { signal, params: { path: { problem_id: id } } },
      );
      if (error) throw error;
      return data!;
    },
  });
}
export function useCatalogProgress(scope: Scope) {
  return useQuery({
    queryKey: [...scope.key, "catalog-progress"],
    enabled: !!scope.userId,
    retry,
    queryFn: async ({ signal }) => {
      const statuses: Record<string, Status> = {};
      // Progress is a small learning-state projection, independent of catalog cursors.
      // Never download every specification to compute explorer progress.
      for (let page = 1; page <= 1000; page++) {
        const { data, error } = await apiClient.GET("/api/v1/dsa/me/progress", {
          signal,
          params: { query: { page, page_size: 50 } },
        });
        if (error) throw error;
        for (const item of data!.items)
          statuses[item.content_item_id] = item.status;
        if (page >= data!.pagination.total_pages) return statuses;
      }
      throw new Error("Learning progress exceeds the supported page limit.");
    },
  });
}
export function useNotes(scope: Scope, id: string) {
  return useInfiniteQuery({
    queryKey: [...scope.key, "notes", id],
    enabled: !!scope.userId,
    initialPageParam: 1,
    retry,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await apiClient.GET(
        "/api/v1/dsa/me/problems/{problem_id}/notes",
        {
          signal,
          params: {
            path: { problem_id: id },
            query: { page: pageParam, page_size: 20 },
          },
        },
      );
      if (error) throw error;
      return data!;
    },
    getNextPageParam: (page) =>
      page.pagination.page < page.pagination.total_pages
        ? page.pagination.page + 1
        : undefined,
  });
}
// There is no single-bookmark read endpoint. Inspect the authenticated, bounded
// bookmark pages before offering a toggle; never assume absence from page one.
export function useBookmarked(scope: Scope, id: string) {
  return useQuery({
    queryKey: [...scope.key, "bookmarked", id],
    enabled: !!scope.userId,
    retry,
    queryFn: async ({ signal }) => {
      for (let page = 1; page <= 1000; page++) {
        const { data, error } = await apiClient.GET(
          "/api/v1/dsa/me/bookmarks",
          { signal, params: { query: { page, page_size: 50 } } },
        );
        if (error) throw error;
        if (data!.items.some((item) => item.content_item_id === id))
          return true;
        if (page >= data!.pagination.total_pages) return false;
      }
      throw new Error(
        "Bookmark list is too large to determine this bookmark safely.",
      );
    },
  });
}
type Change =
  | { kind: "progress"; rowVersion: number; status: Status; confidence: number }
  | { kind: "bookmark"; bookmarked: boolean }
  | { kind: "create-note"; title: string; body: string; noteKind: Note["kind"] }
  | {
      kind: "edit-note";
      note: Note;
      title: string;
      body: string;
      noteKind: Note["kind"];
    }
  | { kind: "delete-note"; note: Note };
export function useLearnerChange(scope: Scope, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (change: Change) => {
      if (change.kind === "progress") {
        const result = await apiClient.PATCH(
          "/api/v1/dsa/me/problems/{problem_id}/progress",
          {
            params: { path: { problem_id: id } },
            body: {
              row_version: change.rowVersion,
              status: change.status,
              confidence: change.confidence,
            },
          },
        );
        if (result.error) throw result.error;
      } else if (change.kind === "bookmark") {
        const result = change.bookmarked
          ? await apiClient.DELETE("/api/v1/dsa/me/bookmarks/{problem_id}", {
              params: { path: { problem_id: id } },
            })
          : await apiClient.POST("/api/v1/dsa/me/bookmarks", {
              body: { problem_id: id },
            });
        if (result.error) throw result.error;
      } else if (change.kind === "create-note") {
        const result = await apiClient.POST(
          "/api/v1/dsa/me/problems/{problem_id}/notes",
          {
            params: { path: { problem_id: id } },
            body: {
              title: change.title || null,
              body: change.body,
              kind: change.noteKind,
            },
          },
        );
        if (result.error) throw result.error;
      } else if (change.kind === "edit-note") {
        const result = await apiClient.PATCH("/api/v1/dsa/me/notes/{note_id}", {
          params: { path: { note_id: change.note.id } },
          body: {
            row_version: change.note.row_version,
            title: change.title || null,
            body: change.body,
            kind: change.noteKind,
          },
        });
        if (result.error) throw result.error;
      } else {
        const result = await apiClient.DELETE(
          "/api/v1/dsa/me/notes/{note_id}",
          {
            params: { path: { note_id: change.note.id } },
            body: { row_version: change.note.row_version },
          },
        );
        if (result.error) throw result.error;
      }
    },
    onSuccess: async () => {
      // Invalidate the existing learning screens too: both APIs own the same rows.
      await Promise.all([
        client.invalidateQueries({ queryKey: ["dsa", scope.userId] }),
        ...[
          "notes",
          "bookmarks",
          "content",
          "category-content",
          "domain-categories",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        void client.invalidateQueries({ queryKey: scope.key });
    },
  });
}
