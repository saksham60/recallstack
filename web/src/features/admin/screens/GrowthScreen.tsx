"use client";

import { useState } from "react";
import { useGrowth } from "../use-admin";
import { LoadingSkeleton, MetricCard, PageHeader, QueryError, buttonClass } from "../components/AdminPrimitives";
import { formatCount, formatDate, formatPercent } from "../format";

type RangeDays = 7 | 30 | 90;
const featureLabels: Record<string, string> = {
  dsa: "DSA activity",
  ai_dsa: "AI · DSA tutoring",
  ai_system_design: "AI · System Design",
  learning: "Learning actions and revisions",
  knowledge_feed: "Knowledge Feed",
};

const measuredCount = (value: number | undefined) => value === undefined ? "Unavailable" : formatCount(value);

export function GrowthScreen() {
  const [days, setDays] = useState<RangeDays>(30);
  const query = useGrowth(days);

  const data = query.data;
  const maxSignups = Math.max(1, ...(data?.daily_signups ?? []).map((point) => point.signups));
  const maxFeature = Math.max(1, ...(data?.feature_usage ?? []).map((item) => item.unique_users));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform intelligence"
        description={data ? `Recorded growth and product usage · UTC reporting days · Updated ${formatDate(data.generated_at)}` : "Recorded growth and product usage - UTC reporting days"}
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

      {query.isLoading ? <LoadingSkeleton rows={8} /> : query.error || !data ? (
        <QueryError error={query.error} retry={() => query.refetch()} resource="platform growth" />
      ) : <>
      <section aria-label="Signup and activation metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total accounts" value={formatCount(data.total_users)} />
        <MetricCard label="New accounts · period" value={formatCount(data.new_users)} />
        <MetricCard label="Tracked engaged accounts" value={formatCount(data.tracked_engaged_users)} />
        <MetricCard label="New accounts engaged" value={formatCount(data.newly_engaged_users)} />
        <MetricCard label="Recorded activation rate" value={formatPercent(data.activation_rate)} />
      </section>

      <section aria-label="Recorded activity definitions" className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Recorded active accounts" value={measuredCount(data.recorded_active_users)} hint="At least one persisted learner action or Feed impression in this period." />
        <MetricCard label="Returning accounts" value={measuredCount(data.returning_users)} hint="Registered before this period and active during it; not a session-return metric." />
        <MetricCard label="Active on multiple UTC days" value={measuredCount(data.repeat_active_users)} hint="At least two recorded days in this window; not D1/D7 cohort retention." />
      </section>
      <p className="text-xs text-muted">Engaged means a practice attempt, revision, code execution, AI run, note/bookmark action, or Feed open/save/share/ask. Page opens and Feed impressions alone do not qualify. Empty AI conversations do not qualify. Activation is engaged new accounts divided by registered new accounts.</p>
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
          <p className="mt-5 text-xs text-muted">Distinct accounts with recorded activity, including Feed impressions and DSA opens. Features overlap; do not sum them. AI counts runs, not empty conversations or canvas-only sessions.</p>
        </section>
      </div>

      <section aria-label="Volume metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="AI runs" value={formatCount(data.ai_runs)} />
        <MetricCard label="AI runs with errors" value={formatCount(data.ai_failed_runs)} hint="Failed/error status or a recorded error code. Can overlap interrupted runs." />
        <MetricCard label="Knowledge Feed events" value={formatCount(data.knowledge_events)} />
        <MetricCard label="Legacy browser submissions" value={formatCount(data.dsa_submissions)} hint="Unverified browser examples; separate from server submissions." />
        <MetricCard label="Feed impressions" value={measuredCount(data.knowledge_impressions)} />
        <MetricCard label="AI interrupted runs" value={measuredCount(data.ai_interrupted_runs)} />
        <MetricCard label="Server Run requests" value={measuredCount(data.server_runs)} />
        <MetricCard label="Server Submit requests" value={measuredCount(data.server_submissions)} />
        <MetricCard label="Official Accepted submissions" value={measuredCount(data.official_accepted)} hint="Completed Submit jobs with an official certificate; includes repeats." />
        <MetricCard label="Provisional passes" value={measuredCount(data.provisional_passes)} hint="Includes repeats. These are not official Accepted verdicts." />
        <MetricCard label="Code Intelligence reports" value={measuredCount(data.code_intelligence_reports)} hint="Reports created in period; reused reports counted once." />
        <MetricCard label="Failed Code Intelligence reports" value={measuredCount(data.code_intelligence_failed)} />
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

      <p className="text-xs text-muted">Activation means a new account with at least one recorded DSA, AI run, or deliberate Knowledge Feed action in the selected window. Anonymous traffic, canvas-only use, and untracked events are excluded. This is not a complete DAU/retention measurement.</p>
      <section aria-labelledby="measurement-limits" className="rounded-xl border border-border bg-surface p-5">
        <h2 id="measurement-limits" className="font-semibold">Measurement coverage</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Country-level activity is unavailable. Profile timezone is not verified location.</li>
          <li>Acquisition and referral sources were not captured; historical sources remain unknown.</li>
          <li>Visitor sessions, complete user journeys and signup-cohort retention are unavailable. Recorded activity excludes unpersisted browsing and canvas-only collaboration.</li>
          <li>AI counts cover persisted DSA and System Design runs. Feed AI calls without persisted runs are not measured here. Billed costs and complete token usage are unavailable; run counts are not invoices or provider-call counts.</li>
          <li>These aggregates include internal and judge accounts. No reliable customer/test-account classification exists.</li>
        </ul>
      </section>
      </>}
    </div>
  );
}
