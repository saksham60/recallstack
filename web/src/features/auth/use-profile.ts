import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type ProfileResponse = components["schemas"]["ProfileResponse"];
export type ProfilePatchRequest = components["schemas"]["ProfilePatchRequest"];

export const profileKeys = {
  all: ["me"] as const,
  profile: () => [...profileKeys.all] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.profile(),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/me");
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: ProfilePatchRequest) => {
      const { data, error } = await apiClient.PATCH("/api/v1/me", {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(profileKeys.profile(), updatedProfile);
    },
  });
}
