import type { ActivityParams, AuditLogParams, ProblemListParams, UserListParams } from "./types";

export const adminKeys = {
  all: ["admin"] as const,
  overview: () => [...adminKeys.all, "overview"] as const,
  users: (params: UserListParams) => [...adminKeys.all, "users", params] as const,
  user: (userId: string) => [...adminKeys.all, "user", userId] as const,
  activity: (userId: string, params: ActivityParams) =>
    [...adminKeys.all, "activity", userId, params] as const,
  roles: (userId: string) => [...adminKeys.all, "roles", userId] as const,
  problems: (params: ProblemListParams) => [...adminKeys.all, "problems", params] as const,
  problem: (problemId: string) => [...adminKeys.all, "problem", problemId] as const,
  auditLogs: (params: AuditLogParams) => [...adminKeys.all, "audit-logs", params] as const,
};
