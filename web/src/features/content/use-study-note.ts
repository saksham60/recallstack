import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";
import { studyNoteKeys } from "./keys";

export type PublishedStudyNoteResponse = components["schemas"]["PublishedStudyNoteResponse"];
export type StudyNoteBlockResponse = components["schemas"]["StudyNoteBlockResponse"];

export function useStudyNote(slug: string) {
  return useQuery({
    queryKey: studyNoteKeys.slug(slug),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/content/{slug}", {
        params: { path: { slug } },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });
}
