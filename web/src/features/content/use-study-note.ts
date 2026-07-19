import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type PublishedStudyNoteResponse = components["schemas"]["PublishedStudyNoteResponse"];
export type StudyNoteBlockResponse = components["schemas"]["StudyNoteBlockResponse"];

export const studyNoteKeys = {
  all: ["content"] as const,
  slug: (slug: string) => [...studyNoteKeys.all, slug] as const,
};

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
