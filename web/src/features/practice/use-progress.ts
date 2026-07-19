import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type ProgressPutRequest = components["schemas"]["ProgressPutRequest"];
export type StudyNoteUserProgressResponse = components["schemas"]["StudyNoteUserProgressResponse"];

export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contentId, data }: { contentId: string; data: ProgressPutRequest }) => {
      const { data: responseData, error } = await apiClient.PUT("/api/v1/me/progress/{contentId}", {
        params: { path: { contentId } },
        body: data,
      });
      if (error) throw error;
      return responseData;
    },
    onSuccess: () => {
      // Invalidate both study note and problem list queries
      queryClient.invalidateQueries({ queryKey: ["content"] });
      queryClient.invalidateQueries({ queryKey: ["category-content"] });
    },
  });
}
