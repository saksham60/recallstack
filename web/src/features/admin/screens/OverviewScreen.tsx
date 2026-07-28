"use client";

import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatCount, formatDate, formatPercent } from "../format";
import { useOverview } from "../use-admin";
import { LoadingSkeleton, MetricCard, PageHeader, QueryError, buttonClass } from "../components/AdminPrimitives";

export function OverviewScreen() {
  const query = useOverview();
  if (query.isLoading) return <LoadingSkeleton rows={8} />;
  if (query.error || !query.data) return <QueryError error={query.error} retry={() => query.refetch()} resource="overview" />;
  const { users, problems, progress, generated_at } = query.data;
  const distribution = [
    ["Zero", progress.users_with_zero_completions],
    ["1–69", progress.users_with_1_to_69_completions],
    ["70–99", progress.users_with_70_to_99_completions],
    ["100+", progress.users_with_100_or_more_completions],
  ] as const;
  const maxDistribution = Math.max(1, ...distribution.map((item) => item[1]));
  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform overview"
        description={`Generated ${formatDate(generated_at)} in your local timezone`}
        actions={<button className={buttonClass} disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh"}</button>}
      />
      <section aria-labelledby="user-metrics">
        <h2 id="user-metrics" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Users</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <MetricCard label="Total users" value={formatCount(users.total)} />
          <MetricCard label="New today" value={formatCount(users.new_today)} />
          <MetricCard label="New · 7 days" value={formatCount(users.new_last_7_days)} />
          <MetricCard label="New · 30 days" value={formatCount(users.new_last_30_days)} />
          <MetricCard label="Active · 24 hours" value={formatCount(users.active_last_24_hours)} />
          <MetricCard label="Active · 7 days" value={formatCount(users.active_last_7_days)} />
          <MetricCard label="Active · 30 days" value={formatCount(users.active_last_30_days)} />
        </div>
      </section>
      <section aria-labelledby="problem-metrics">
        <h2 id="problem-metrics" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Problems</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Published" value={formatCount(problems.total_published)} />
          <MetricCard label="Total attempts" value={formatCount(problems.total_attempts)} />
          <MetricCard label="Accepted attempts" value={formatCount(problems.accepted_attempts)} />
          <MetricCard label="Unique attempts" value={formatCount(problems.unique_user_problem_attempts)} />
          <MetricCard label="Unique completions" value={formatCount(problems.unique_user_problem_completions)} />
          <MetricCard label="Completion rate" value={formatPercent(problems.completion_rate)} />
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_1.5fr]" aria-labelledby="progress-metrics">
        <div>
          <h2 id="progress-metrics" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Progress</h2>
          <MetricCard label="Average unique problems completed" value={progress.average_unique_problems_completed.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Completion distribution</h3>
          <div className="mt-4 space-y-4">
            {distribution.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm"><span>{label} completions</span><span className="tabular-nums text-muted">{formatCount(value)}</span></div>
                <ProgressBar progress={(value / maxDistribution) * 100} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
