import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type NoteResponse = components["schemas"]["NoteResponse"];
export type NoteListResponse = components["schemas"]["NoteListResponse"];
export type NoteCreateRequest = components["schemas"]["NoteCreateRequest"];
export type NotePatchRequest = components["schemas"]["NotePatchRequest"];

interface CreateNoteInput {
  contentId: string;
  kind: NoteCreateRequest["kind"];
  body: string;
  title?: string;
}

interface UpdateNoteInput {
  noteId: string;
  contentId: string;
  rowVersion: number;
  kind?: NonNullable<NotePatchRequest["kind"]>;
  title?: string | null;
  body?: string;
}

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
    mutationFn: async ({ contentId, kind, body, title }: CreateNoteInput) => {
      const request: NoteCreateRequest = {
        content_item_id: contentId,
        kind,
        body,
        title,
      };
      const { data, error } = await apiClient.POST("/api/v1/me/notes", {
        body: request,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (newNote) =>
      queryClient.invalidateQueries({ queryKey: noteKeys.content(newNote.content_item_id) }),
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, rowVersion, kind, title, body }: UpdateNoteInput) => {
      const request: NotePatchRequest = {
        row_version: rowVersion,
        kind,
        title,
        body,
      };
      const { data, error } = await apiClient.PATCH("/api/v1/me/notes/{noteId}", {
        params: { path: { noteId } },
        body: request,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (updatedNote) =>
      queryClient.invalidateQueries({ queryKey: noteKeys.content(updatedNote.content_item_id) }),
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, contentId, rowVersion }: { noteId: string; contentId: string; rowVersion: number }) => {
      const { data, error } = await apiClient.DELETE("/api/v1/me/notes/{noteId}", {
        params: { path: { noteId } },
        body: { row_version: rowVersion },
      });
      if (error) throw error;
      return { data, contentId };
    },
    onSuccess: ({ contentId }) =>
      queryClient.invalidateQueries({ queryKey: noteKeys.content(contentId) }),
  });
}
