import type { components, operations } from "@/lib/api/types";

export type Pagination = components["schemas"]["recallstack__modules__admin__presentation__schemas__PaginationResponse"];

export type ActivityParams = NonNullable<
  operations["adminAnalyticsUserActivity"]["parameters"]["query"]
>;
export type ProblemListParams = NonNullable<
  operations["adminProblemAnalyticsList"]["parameters"]["query"]
>;
export type AuditLogParams = NonNullable<
  operations["adminAuditLogs"]["parameters"]["query"]
>;
