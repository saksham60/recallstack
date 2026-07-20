import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type NoteResponse = components["schemas"]["NoteResponse"];
export type NoteListResponse = components["schemas"]["NoteListResponse"];
export type NoteCreateRequest = components["schemas"]["NoteCreateRequest"];
export type NotePatchRequest = components["schemas"]["NotePatchRequest"];

export const noteKeys = {
  all: ["notes"] as const,
  content: (contentId: string) => [...noteKeys.all, "content", contentId] as const,
};

export function useNotes(contentId: string) {
  return useQuery({
    queryKey: noteKeys.content(contentId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/me/content/{contentId}/notes", {
        params: { path: { contentId } },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!contentId,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: NoteCreateRequest) => {
      const { data, error } = await apiClient.POST("/api/v1/me/notes", {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.content(newNote.content_item_id) });
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, body }: { noteId: string; body: NotePatchRequest }) => {
      const { data, error } = await apiClient.PATCH("/api/v1/me/notes/{noteId}", {
        params: { path: { noteId } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (updatedNote) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.content(updatedNote.content_item_id) });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, row_version }: { noteId: string; row_version: number }) => {
      const { data, error } = await apiClient.DELETE("/api/v1/me/notes/{noteId}", {
        params: { path: { noteId } },
        body: { row_version },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
