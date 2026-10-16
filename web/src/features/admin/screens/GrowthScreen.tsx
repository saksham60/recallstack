"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { publicConfig } from "@/lib/config/public";
import { getBrowserClient } from "@/lib/supabase/client";
import { LoadingSkeleton, MetricCard, PageHeader, QueryError, buttonClass } from "../components/AdminPrimitives";
import { formatCount, formatDate, formatPercent } from "../format";

type RangeDays = 7 | 30 | 90;
type GrowthResponse = {
  period_days: number;
  generated_at: string;
  total_users: number;
  new_users: number;
  tracked_engaged_users: number;
  newly_engaged_users: number;
  activation_rate: number;
  ai_runs: number;
  ai_failed_runs: number;
  knowledge_events: number;
  dsa_submissions: number;
  tracking_source_available: boolean;
  signup_source_unknown: number;
  daily_signups: { day: string; signups: number }[];
  feature_usage: { feature: string; unique_users: number }[];
};

const featureLabels: Record<string, string> = {
  dsa: "DSA activity",
  ai_dsa: "AI · DSA tutoring",
  ai_system_design: "AI · System Design",
  knowledge_feed: "Knowledge Feed",
};

function useGrowth(days: RangeDays) {
  return useQuery({
    queryKey: ["admin", "growth", days] as const,
    queryFn: async ({ signal }): Promise<GrowthResponse> => {
      // API generation is handled separately; this explicit request remains
      // authenticated with the same Supabase session as the typed API client.
      const { data: { session } } = await getBrowserClient().auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again to view the admin dashboard.");
      const base = publicConfig.apiBaseUrl.replace(/\/+$/, "");
      const response = await fetch(`${base}/api/v1/admin/growth?days=${days}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`Growth dashboard unavailable (HTTP ${response.status}).`);
      return (await response.json()) as GrowthResponse;
    },
    staleTime: 30_000,
  });
}

export function GrowthScreen() {
  const [days, setDays] = useState<RangeDays>(30);
  const query = useGrowth(days);

  if (query.isLoading) return <LoadingSkeleton rows={8} />;
  if (query.error || !query.data) {
    return <QueryError error={query.error} retry={() => query.refetch()} resource="platform growth" />;
  }

  const data = query.data;
  const maxSignups = Math.max(1, ...data.daily_signups.map((point) => point.signups));
  const maxFeature = Math.max(1, ...data.feature_usage.map((item) => item.unique_users));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform intelligence"
        description={`Recorded growth and product usage · UTC reporting days · Updated ${formatDate(data.generated_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="growth-range" className="sr-only">Reporting period</label>
            <select id="growth-range" className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={days} onChange={(event) => setDays(Number(event.target.value) as RangeDays)}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button className={buttonClass} onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        }
      />

      <section aria-label="Signup and activation metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total accounts" value={formatCount(data.total_users)} />
        <MetricCard label="New accounts · period" value={formatCount(data.new_users)} />
        <MetricCard label="Tracked engaged accounts" value={formatCount(data.tracked_engaged_users)} />
        <MetricCard label="New accounts engaged" value={formatCount(data.newly_engaged_users)} />
        <MetricCard label="Recorded activation rate" value={formatPercent(data.activation_rate)} />
      </section>

      <div className="grid gap-5 2xl:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="signups-heading" className="min-w-0 rounded-xl border border-border bg-surface p-5">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 id="signups-heading" className="font-semibold">New accounts over time</h2>
            <span className="text-xs text-muted">{data.period_days}-day window</span>
          </div>
          <div className="flex h-48 items-end gap-1 overflow-x-auto border-b border-border pb-1" role="img" aria-label="Daily signup bar chart">
            {data.daily_signups.map((point) => (
              <div key={point.day} className="group flex h-full min-w-[5px] flex-1 flex-col justify-end" title={`${point.day}: ${point.signups} signups`}>
                <div className="w-full rounded-t-sm bg-accent/80 transition hover:bg-accent" style={{ height: `${point.signups === 0 ? 0 : Math.max(5, (point.signups / maxSignups) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>{data.daily_signups[0]?.day}</span>
            <span>{data.daily_signups[data.daily_signups.length - 1]?.day}</span>
          </div>
          <p className="mt-3 text-xs text-muted">Signups are account records, not unique visitors. Dates use UTC.</p>
        </section>

        <section aria-labelledby="feature-heading" className="rounded-xl border border-border bg-surface p-5">
          <h2 id="feature-heading" className="mb-5 font-semibold">Feature adoption</h2>
          <div className="space-y-5">
            {data.feature_usage.map((item) => (
              <div key={item.feature}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span>{featureLabels[item.feature] ?? item.feature}</span>
                  <strong className="tabular-nums">{formatCount(item.unique_users)}</strong>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${item.unique_users / maxFeature * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs text-muted">Distinct accounts with recorded activity. AI System Design counts conversations/runs, not canvas-only sessions.</p>
        </section>
      </div>

      <section aria-label="Volume metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="AI runs" value={formatCount(data.ai_runs)} />
        <MetricCard label="AI runs with errors" value={formatCount(data.ai_failed_runs)} />
        <MetricCard label="Knowledge Feed events" value={formatCount(data.knowledge_events)} />
        <MetricCard label="DSA code submissions" value={formatCount(data.dsa_submissions)} />
      </section>

      <section aria-labelledby="acquisition-heading" className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="acquisition-heading" className="font-semibold">Where users came from</h2>
          <span className="text-xs text-muted">Attribution not yet instrumented</span>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-surface-elevated p-4">
          <span className="text-sm">Unknown source · historical registrations</span>
          <strong className="tabular-nums">{formatCount(data.signup_source_unknown)}</strong>
        </div>
        <p className="mt-3 text-sm text-muted">Devpost, Google, GitHub, direct, and shared links cannot be distinguished for existing accounts. Add first-touch referrer/UTM capture at signup before showing source charts. Never infer source from email, name, or country.</p>
      </section>

      <p className="text-xs text-muted">Activation means a new account with at least one recorded DSA, AI conversation/run, or Knowledge Feed event in the selected window. Anonymous traffic, canvas-only use, and untracked events are excluded. This is not a complete DAU/retention measurement.</p>
    </div>
  );
}
