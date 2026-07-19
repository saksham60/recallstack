import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type NoteResponse = components["schemas"]["NoteResponse"];
export type NoteCreateRequest = components["schemas"]["NoteCreateRequest"];
export type NotePatchRequest = components["schemas"]["NotePatchRequest"];

export const noteKeys = {
  all: ["notes"] as const,
  content: (contentId: string) => [...noteKeys.all, "content", contentId] as const,
};

export function useNotes(contentId: string) {
  return useQuery({
    queryKey: noteKeys.content(contentId),
    queryFn: () => apiClient<NoteResponse[]>(`/me/content/${contentId}/notes`),
    enabled: !!contentId,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: NoteCreateRequest) =>
      apiClient<NoteResponse>("/me/notes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.content(newNote.content_item_id) });
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, data }: { noteId: string; data: NotePatchRequest }) =>
      apiClient<NoteResponse>(`/me/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (updatedNote) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.content(updatedNote.content_item_id) });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, rowVersion }: { noteId: string; rowVersion: number }) =>
      apiClient(`/me/notes/${noteId}?row_version=${rowVersion}`, {
        method: "DELETE",
      }),
    onSuccess: (_, variables) => {
      // Ideally we should know content_item_id to invalidate perfectly, 
      // but invalidating all notes works for now.
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
