import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";
import { categoryContentKeys } from "@/features/catalog/keys";
import { studyNoteKeys } from "@/features/content/keys";

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
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: studyNoteKeys.all }),
        queryClient.invalidateQueries({ queryKey: categoryContentKeys.all }),
      ]),
  });
}
