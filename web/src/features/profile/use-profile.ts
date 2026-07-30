import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

export type ProfileResponse = components["schemas"]["ProfileResponse"];
type ProfilePatchRequest = components["schemas"]["ProfilePatchRequest"];

interface UpdateProfileInput {
  displayName: string;
  timezone: string;
}

export const profileKeys = {
  all: ["me"] as const,
  profile: (userId?: string) =>
    userId
      ? ([...profileKeys.all, "profile", userId] as const)
      : ([...profileKeys.all, "profile"] as const),
};

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: profileKeys.profile(user?.id),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/v1/me");
      if (error) throw error;
      return data;
    },
    enabled: Boolean(user?.id),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ displayName, timezone }: UpdateProfileInput) => {
      const body: ProfilePatchRequest = {
        display_name: displayName,
        timezone,
      };
      const { data, error } = await apiClient.PATCH("/api/v1/me", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (updatedProfile) => {
      if (user?.id) {
        queryClient.setQueryData(
          profileKeys.profile(user.id),
          updatedProfile,
        );
      }
    },
  });
}
