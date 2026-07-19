import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/types";

type ProfileResponse = components["schemas"]["ProfileResponse"];
type ProfilePatchRequest = components["schemas"]["ProfilePatchRequest"];

export const profileKeys = {
  all: ["me"] as const,
  profile: () => [...profileKeys.all] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.profile(),
    queryFn: () => apiClient<ProfileResponse>("/me"),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProfilePatchRequest) =>
      apiClient<ProfileResponse>("/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(profileKeys.profile(), updatedProfile);
    },
  });
}
