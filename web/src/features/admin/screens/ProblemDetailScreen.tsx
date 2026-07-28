"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatCount, formatDate, formatDuration, formatPercent, titleCase } from "../format";
import { useProblem } from "../use-admin";
import { CopyId, LoadingSkeleton, MetricCard, PageHeader, QueryError, ResultsState, buttonClass } from "../components/AdminPrimitives";

export function ProblemDetailScreen({ problemId }: { problemId: string }) {
  const query = useProblem(problemId);
  if (query.isLoading) return <LoadingSkeleton rows={8} />;
  if (query.error || !query.data) return <QueryError error={query.error} retry={() => query.refetch()} resource="problem" />;
  const { problem, analytics, recent_attempts } = query.data;
  return (
    <div className="space-y-7">
      <div className="text-sm text-muted"><Link href="/admin/problems" className="hover:text-accent">Problem Analytics</Link> <span aria-hidden> / </span> {problem.title}</div>
      <PageHeader title={problem.title} description={problem.topics.join(" · ") || "No topics"} actions={<button className={buttonClass} onClick={() => query.refetch()}>Refresh</button>} />
      <div className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{titleCase(problem.difficulty)}</Badge><Badge variant={problem.publication_status === "published" ? "success" : "outline"}>{titleCase(problem.publication_status)}</Badge><CopyId value={problem.problem_id} label="problem ID" /></div>
      <section>
        <h2 className="mb-3 font-semibold">Analytics</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="Total attempts" value={formatCount(analytics.total_attempts)} />
          <MetricCard label="Accepted attempts" value={formatCount(analytics.accepted_attempts)} />
          <MetricCard label="Users attempted" value={formatCount(analytics.unique_users_attempted)} />
          <MetricCard label="Users completed" value={formatCount(analytics.unique_users_completed)} />
          <MetricCard label="Solve rate" value={formatPercent(analytics.solve_rate)} />
          <MetricCard label="First-attempt success" value={formatPercent(analytics.first_attempt_success_rate)} />
          <MetricCard label="Avg attempts to completion" value={analytics.average_attempts_before_completion?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "Not captured"} />
          <MetricCard label="Average solve time" value={analytics.average_solve_time_seconds == null ? "Not captured" : formatDuration(Math.round(analytics.average_solve_time_seconds))} />
          <MetricCard label="Hint usage" value={analytics.hint_usage_count == null ? "Not captured" : formatCount(analytics.hint_usage_count)} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Recent attempts</h2>
        <ResultsState count={recent_attempts.length}>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-surface-elevated text-xs uppercase text-muted"><tr><th className="p-3">User</th><th className="p-3">Attempt time</th><th className="p-3">Status</th><th className="p-3">Attempt number</th></tr></thead><tbody className="divide-y divide-border">{recent_attempts.map((attempt, index) => <tr key={`${attempt.user_id}-${attempt.attempted_at}-${index}`}><td className="p-3"><Link className="font-medium text-accent hover:underline" href={`/admin/users/${attempt.user_id}`}>{attempt.user_name || "Unnamed user"}</Link><div><CopyId value={attempt.user_id} label="user ID" /></div></td><td className="p-3" title={attempt.attempted_at}>{formatDate(attempt.attempted_at)}</td><td className="p-3">{titleCase(attempt.status)}</td><td className="p-3">{formatCount(attempt.attempt_number)}</td></tr>)}</tbody></table></div>
        </ResultsState>
      </section>
    </div>
  );
}
