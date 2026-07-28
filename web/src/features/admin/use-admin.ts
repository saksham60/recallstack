"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { profileKeys, useProfile } from "@/features/profile/use-profile";
import { adminKeys } from "./keys";
import type { ActivityParams, AuditLogParams, ProblemListParams, UserListParams } from "./types";

function required<T>(data: T | undefined): T {
  if (data === undefined) throw new Error("The server returned an empty response.");
  return data;
}

export function useAdminIdentity() {
  const profile = useProfile();
  const isAdmin = profile.data?.roles.includes("admin") ?? false;
  return {
    ...profile,
    isAdmin,
    adminName: profile.data?.display_name || "Administrator",
  };
}

export function useOverview() {
  return useQuery({
    queryKey: adminKeys.overview(),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET("/api/v1/admin/overview", { signal });
      return required(data);
    },
    staleTime: 30_000,
  });
}

export function useAdminUsers(params: UserListParams) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET("/api/v1/admin/users", {
        params: { query: params },
        signal,
      });
      return required(data);
    },
    placeholderData: (previous) => previous,
  });
}

export function useAdminUser(userId: string) {
  return useQuery({
    queryKey: adminKeys.user(userId),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET("/api/v1/admin/users/{userId}", {
        params: { path: { userId } },
        signal,
      });
      return required(data);
    },
  });
}

export function useUserActivity(userId: string, params: ActivityParams) {
  return useQuery({
    queryKey: adminKeys.activity(userId, params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET("/api/v1/admin/users/{userId}/activity", {
        params: { path: { userId }, query: params },
        signal,
      });
      return required(data);
    },
    placeholderData: (previous) => previous,
  });
}

export function useUserRoles(userId: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.roles(userId),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET("/api/v1/admin/users/{userId}/roles", {
        params: { path: { userId }, query: { page: 1, page_size: 100 } },
        signal,
      });
      return required(data);
    },
    enabled: enabled && Boolean(userId),
  });
}

export function useCurrentAdminRoleId() {
  const identity = useAdminIdentity();
  const roles = useUserRoles(identity.data?.id ?? "", identity.isAdmin);
  return {
    ...roles,
    roleId: roles.data?.items.find((role) => role.role_code === "admin" && role.active)?.role_id,
  };
}

export function useGrantRole(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: number) => {
      const { data } = await apiClient.POST("/api/v1/admin/users/{userId}/roles", {
        params: { path: { userId } },
        body: { role_id: roleId },
      });
      return required(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.roles(userId) }),
        queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) }),
        queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "users"] }),
        queryClient.invalidateQueries({ queryKey: profileKeys.profile() }),
      ]);
    },
  });
}

export function useRevokeRole(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: number) => {
      const { data } = await apiClient.POST("/api/v1/admin/users/{userId}/roles/{roleId}/revoke", {
        params: { path: { userId, roleId } },
      });
      return required(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.roles(userId) }),
        queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) }),
        queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "users"] }),
        queryClient.invalidateQueries({ queryKey: profileKeys.profile() }),
      ]);
    },
  });
}

export function useProblems(params: ProblemListParams) {
  return useQuery({
    queryKey: adminKeys.problems(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET("/api/v1/admin/problems/analytics", {
        params: { query: params },
        signal,
      });
      return required(data);
    },
    placeholderData: (previous) => previous,
  });
}

export function useProblem(problemId: string) {
  return useQuery({
    queryKey: adminKeys.problem(problemId),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET("/api/v1/admin/problems/{problemId}/analytics", {
        params: { path: { problemId } },
        signal,
      });
      return required(data);
    },
  });
}

export function useAuditLogs(params: AuditLogParams) {
  return useQuery({
    queryKey: adminKeys.auditLogs(params),
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET("/api/v1/admin/audit-logs", {
        params: { query: params },
        signal,
      });
      return required(data);
    },
    staleTime: 20_000,
    placeholderData: (previous) => previous,
  });
}
