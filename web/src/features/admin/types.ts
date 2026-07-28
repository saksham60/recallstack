import type { components, operations } from "@/lib/api/types";

export type Overview = components["schemas"]["OverviewResponse"];
export type AdminUser = components["schemas"]["AdminUserListItem"];
export type AdminUserDetail = components["schemas"]["UserDetailResponse"];
export type ActivityItem = components["schemas"]["ActivityItem"];
export type ProblemAnalytics = components["schemas"]["ProblemAnalyticsItem"];
export type ProblemDetail = components["schemas"]["ProblemDetailResponse"];
export type AuditLog = components["schemas"]["AuditLogItem"];
export type RoleGrant = components["schemas"]["RoleGrantResponse"];
export type Pagination = components["schemas"]["recallstack__modules__admin__presentation__schemas__PaginationResponse"];

export type UserListParams = NonNullable<
  operations["adminAnalyticsListUsers"]["parameters"]["query"]
>;
export type ActivityParams = NonNullable<
  operations["adminAnalyticsUserActivity"]["parameters"]["query"]
>;
export type ProblemListParams = NonNullable<
  operations["adminProblemAnalyticsList"]["parameters"]["query"]
>;
export type AuditLogParams = NonNullable<
  operations["adminAuditLogs"]["parameters"]["query"]
>;
