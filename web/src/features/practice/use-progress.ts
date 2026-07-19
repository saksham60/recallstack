import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type ProgressPutRequest = components["schemas"]["ProgressPutRequest"];
export type StudyNoteUserProgressResponse = components["schemas"]["StudyNoteUserProgressResponse"];

export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contentId, data }: { contentId: string; data: ProgressPutRequest }) =>
      apiClient(`/me/progress/${contentId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      // Invalidate both study note and problem list queries
      queryClient.invalidateQueries({ queryKey: ["content"] });
      queryClient.invalidateQueries({ queryKey: ["category-content"] });
    },
  });
}
