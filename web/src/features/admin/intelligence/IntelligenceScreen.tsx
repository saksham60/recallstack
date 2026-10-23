"use client";

import Link from "next/link";
import { useState } from "react";
import type { components } from "@/lib/api/types";
import { AccountClassification } from "./AccountClassification";
import { formatDate, titleCase } from "../format";
import {
  buttonClass,
  inputClass,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  QueryError,
} from "../components/AdminPrimitives";
import {
  useIntelligence,
  useIntelligenceExtra,
  useIntelligenceSessions,
  useIntelligenceTimeline,
  useIntelligenceUsers,
  type Days,
} from "./use-intelligence";

type Metric = components["schemas"]["Metric"];
export function WindowControl({
  days,
  onChange,
}: {
  days: Days;
  onChange: (days: Days) => void;
}) {
  return (
    <div className="flex gap-2" aria-label="UTC reporting window">
      {([7, 30, 90] as const).map((n) => (
        <button
          key={n}
          className={`${buttonClass} ${days === n ? "border-accent text-accent" : ""}`}
          aria-pressed={days === n}
          onClick={() => onChange(n)}
        >
          {n} days
        </button>
      ))}
    </div>
  );
}
function metricValue(key: string, metric?: Metric) {
  if (!metric || metric.status === "not_tracked") return "Not tracked";
  if (metric.status === "not_applicable") return "Not applicable";
  if (metric.value == null) return "Unknown";
  return key.includes("rate")
    ? `${(metric.value * 100).toFixed(1)}%`
    : metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
export function MetricGrid({
  metrics,
  keys,
}: {
  metrics: Record<string, Metric>;
  keys: string[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {keys.map((key) => (
        <div
          key={key}
          title={`${metrics[key]?.definition ?? "Not tracked"}\nSource: ${metrics[key]?.source ?? "unavailable"}`}
        >
          <MetricCard
            label={titleCase(key)}
            value={metricValue(key, metrics[key])}
            hint={
              metrics[key]?.status === "partial_history"
                ? "Partial history"
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}
const groups = {
  overview: [
    "registered_users",
    "new_users",
    "recorded_active_users",
    "engaged_users",
    "dau",
    "wau",
    "mau",
    "new_user_activation_rate",
    "sessions",
    "returning",
    "official_solves",
    "error_affected_users",
  ],
  dsa: [
    "problems_viewed",
    "problems_attempted",
    "local_runs",
    "server_runs",
    "server_submits",
    "official_accepted",
    "official_solves",
    "official_acceptance_rate",
    "code_intelligence_reports",
  ],
  ai: [
    "ci_input_tokens",
    "ci_output_tokens",
    "ci_latency_ms",
    "ai_runs",
    "ai_errors",
    "ai_latency_ms",
    "measured_ai_runs",
    "tool_calls",
    "tool_failures",
    "search_tool_calls",
    "first_output_ms",
    "input_tokens",
    "output_tokens",
    "provider_calls",
    "tavily_calls",
    "billed_cost",
    "estimated_cost",
    "time_to_first_token",
  ],
  feed: [
    "feed_impressions",
    "feed_opens",
    "feed_saves",
    "feed_meaningful_actions",
    "feed_ask_actions",
  ],
  system_design: [
    "designs_created",
    "design_sessions",
    "designs_revised",
    "design_exports",
    "nodes_added",
    "nodes_deleted",
    "edges_added",
    "edges_removed",
    "collaboration_sessions",
  ],
} as const;

export function ProductIntelligenceScreen() {
  const [days, setDays] = useState<Days>(30),
    [exclude, setExclude] = useState(false);
  const [section, setSection] = useState("overview");
  const query = useIntelligence(days, undefined, exclude);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Intelligence"
        description="Recorded behavior and canonical outcomes. All windows use UTC calendar days."
        actions={
          <button
            className={buttonClass}
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            Refresh
          </button>
        }
      />
      <div className="flex flex-wrap items-center gap-4">
        <WindowControl days={days} onChange={setDays} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={section === "health"}
            checked={exclude}
            onChange={(e) => setExclude(e.target.checked)}
          />
          Exclude reliably classified internal/demo accounts
        </label>
      </div>
      <p className="text-sm text-muted">
        Unclassified accounts remain included. Registration is not activity.
        Hover metric cards for definitions and sources.
      </p>
      <nav className="flex flex-wrap gap-2" aria-label="Intelligence sections">
        {[
          "overview",
          "dsa",
          "ai",
          "feed",
          "system_design",
          "funnels",
          "cohorts",
          "health",
        ].map((tab) => (
          <button
            className={`${buttonClass} ${section === tab ? "text-accent border-accent" : ""}`}
            aria-pressed={section === tab}
            key={tab}
            onClick={() => setSection(tab)}
          >
            {titleCase(tab)}
          </button>
        ))}
      </nav>
      {["health", "funnels", "cohorts"].includes(section) ? (
        <ExtraPanel
          kind={section as "health" | "funnels" | "cohorts"}
          days={days}
          exclude={exclude}
        />
      ) : query.isLoading ? (
        <LoadingSkeleton />
      ) : query.error || !query.data ? (
        <QueryError error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <MetricGrid
            metrics={query.data.metrics}
            keys={[...groups[section as keyof typeof groups]]}
          />
          <CoverageNote coverage={query.data.coverage} />
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 font-semibold">Feature adoption</h2>
            <DataRows items={query.data.features ?? []} />
          </section>
          <FeatureDetails
            section={section}
            details={query.data.details ?? {}}
          />
          {section === "overview" && (
            <ActivityChart daily={query.data.daily ?? []} />
          )}
          <p className="text-sm text-muted">
            Canonical jobs and runs have unknown client platform unless
            correlated with observed navigation. Local-only canvas saves are
            client evidence. Private content is excluded.
          </p>
        </>
      )}
    </div>
  );
}
function CoverageNote({
  coverage,
}: {
  coverage: components["schemas"]["Coverage"];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
      <p>
        Updated {formatDate(coverage.generated_at)} · UTC calendar window (times shown locally):{" "}
        {formatDate(coverage.since)} to {formatDate(coverage.until)}.
      </p>
      <p className="mt-1">
        Client coverage:{" "}
        {coverage.telemetry_since
          ? `partial history since ${formatDate(coverage.telemetry_since)}`
          : "Not tracked — no collection coverage recorded"}
        . {coverage.history}
      </p>
    </div>
  );
}
function ActivityChart({ daily }: { daily: Record<string, unknown>[] }) {
  const max = Math.max(1, ...daily.map((d) => Number(d.active)));
  if (!daily.length)
    return (
      <p className="text-sm text-muted">No recorded activity in this window.</p>
    );
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">Recorded active users by UTC date</h2>
      <div
        className="mt-4 flex h-32 items-end gap-1"
        aria-label="Daily active users"
      >
        {daily.map((d, i) => (
          <button
            key={i}
            className="min-w-1 flex-1 rounded-t bg-accent/70 hover:bg-accent focus-visible:outline-2 focus-visible:outline-foreground"
            style={{
              height: `${Math.max(2, (Number(d.active) / max) * 100)}%`,
            }}
            title={`${d.day}: ${d.active} active, ${d.engaged} engaged`}
            aria-label={`${d.day}: ${d.active} active, ${d.engaged} engaged`}
          />
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">
          View measured daily values
        </summary>
        <DataRows items={daily} />
      </details>
    </section>
  );
}
export function DataRows({ items }: { items: Record<string, unknown>[] }) {
  if (!items.length)
    return (
      <p className="text-sm text-muted">No recorded rows in this window.</p>
    );
  const keys = Object.keys(items[0]).filter((k) =>
    items.some(
      (row) =>
        row[k] == null ||
        ["string", "number", "boolean"].includes(typeof row[k]),
    ),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {keys.map((k) => (
              <th
                key={k}
                className="border-b border-border p-3 text-xs text-muted"
              >
                {titleCase(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td
                  key={k}
                  className="max-w-xs break-words border-b border-border/40 p-3"
                >
                  {row[k] == null ? "Unknown" : String(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ExtraPanel({
  kind,
  days,
  exclude,
}: {
  kind: "health" | "funnels" | "cohorts";
  days: Days;
  exclude: boolean;
}) {
  const query = useIntelligenceExtra(kind, days, exclude);
  if (query.isLoading) return <LoadingSkeleton />;
  if (query.error || !query.data)
    return <QueryError error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  const rows = Array.isArray(data.items) ? data.items : [];
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">{titleCase(kind)}</h2>
      <p className="text-sm text-muted">
        {typeof data.definition === "string"
          ? data.definition
          : "Ingestion diagnostics are separate from product outcomes. Queue lag is not applicable: ingestion writes bounded batches directly."}
      </p>
      {kind === "health" ? (
        <>
          <DataRows
            items={[
              Object.fromEntries(
                Object.entries(data).filter(
                  ([, v]) =>
                    v === null ||
                    ["string", "boolean", "number"].includes(typeof v),
                ),
              ),
            ]}
          />
          <h3>Coverage by client version</h3>
          <DataRows items={Array.isArray(data.versions) ? data.versions : []} />
          <h3>Coverage by feature</h3>
          <DataRows items={Array.isArray(data.features) ? data.features : []} />
          <h3>Client delivery reports</h3>
          {data.client_delivery && typeof data.client_delivery === "object" ? (
            <DataRows
              items={[data.client_delivery as Record<string, unknown>]}
            />
          ) : (
            <p className="text-sm text-muted">Not tracked</p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            {data.status === "not_tracked"
              ? "Not tracked"
              : "Partial history — only eligible, observed journeys/cohorts are included."}
          </p>
          <DataRows items={rows} />
          {kind === "funnels" &&
            (
              [
                ["First observed meaningful action", "first_action", null],
                ["Official Submit conversion", "official_conversion", null],
                [
                  "Feature transitions and revisits",
                  "feature_journeys",
                  "journey_definition",
                ],
                [
                  "New and returning engagement",
                  "engagement",
                  "engagement_definition",
                ],
              ] as const
            ).map(([label, key, definition]) => (
              <section className="space-y-2" key={key}>
                <h3 className="font-medium">{label}</h3>
                {definition && typeof data[definition] === "string" && (
                  <p className="text-xs text-muted">
                    {String(data[definition])}
                  </p>
                )}
                {Array.isArray(data[key]) ? (
                  <DataRows items={data[key] as Record<string, unknown>[]} />
                ) : (
                  <p className="text-sm text-muted">Not tracked</p>
                )}
              </section>
            ))}
        </>
      )}
    </section>
  );
}

export function UserIntelligencePanel({
  userId,
  section,
}: {
  userId: string;
  section: string;
}) {
  const [days, setDays] = useState<Days>(30);
  const query = useIntelligence(days, userId);
  return (
    <div className="space-y-5">
      <WindowControl days={days} onChange={setDays} />
      {section === "timeline" ? (
        <UserTimeline userId={userId} days={days} />
      ) : section === "sessions" ? (
        <UserSessions userId={userId} days={days} />
      ) : query.isLoading ? (
        <LoadingSkeleton />
      ) : query.error || !query.data ? (
        <QueryError error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <MetricGrid
            metrics={query.data.metrics}
            keys={[
              ...groups[
                (section in groups
                  ? section
                  : "overview") as keyof typeof groups
              ],
            ]}
          />
          <CoverageNote coverage={query.data.coverage} />
          {section === "overview" && (
            <AccountClassification
              key={userId}
              userId={userId}
              current={String(query.data.details?.classification ?? "Unknown")}
              available={Boolean(
                (
                  query.data.details?.sources_available as
                    | Record<string, boolean>
                    | undefined
                )?.classes,
              )}
            />
          )}

          <p className="text-sm text-muted">
            Classification:{" "}
            {String(query.data.details?.classification ?? "Unknown")}
          </p>
          <AcquisitionDetails attribution={query.data.details?.attribution} />
          <DataRows items={query.data.features ?? []} />
          <FeatureDetails
            section={section}
            details={query.data.details ?? {}}
          />
          {section === "dsa" &&
            typeof query.data.details?.dsa === "object" &&
            query.data.details.dsa && (
              <DsaDetails
                value={query.data.details.dsa as Record<string, unknown>}
              />
            )}

          {section === "system_design" && (
            <p className="text-sm text-muted">
              Mobile System Design: Not applicable. Signed-in realtime
              participation is client-reported. Go capability connections do not
              have a verified profile association.
            </p>
          )}
        </>
      )}
    </div>
  );
}
function AcquisitionDetails({ attribution }: { attribution: unknown }) {
  const touch = attribution && typeof attribution === "object"
    ? attribution as Record<string, unknown> : {};
  const value = (key: string) => typeof touch[key] === "string" && touch[key] ? String(touch[key]) : "Unknown";
  return (
    <section aria-label="First-touch acquisition" className="rounded-lg border border-border p-4">
      <h3 className="mb-3 font-medium">First-touch acquisition</h3>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          ["Source", value("utm_source") !== "Unknown" ? value("utm_source") : value("referrer_host")],
          ["Medium", value("utm_medium")],
          ["Campaign", value("utm_campaign")],
          ["Referrer", value("referrer_host")],
          ["Referral code", value("referral_code")],
          ["Landing feature", value("landing")],
        ].map(([label, content]) => (
          <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="break-words text-sm">{content}</dd></div>
        ))}
      </dl>
    </section>
  );
}
function UserTimeline({ userId, days }: { userId: string; days: Days }) {
  const query = useIntelligenceTimeline(userId, days);
  if (query.isLoading) return <LoadingSkeleton />;
  if (query.error || !query.data)
    return <QueryError error={query.error} retry={() => query.refetch()} />;
  const items = query.data.pages.flatMap((p) => p.items);
  return (
    <div className="space-y-3">
      <CoverageNote coverage={query.data.pages[0].coverage} />
      {!items.length && <p>No recorded events in this window.</p>}
      {items.map((item, i) => (
        <article
          key={item.id}
          className="rounded-lg border border-border bg-surface p-4"
        >
          {(i === 0 || items[i - 1].session_id !== item.session_id) && (
            <h3 className="mb-3 text-xs text-muted">
              {item.session_id
                ? `Observed session ${item.session_id}`
                : "Canonical history — no reconstructed session"}
            </h3>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <strong className="text-sm">{item.name}</strong>
            <time className="text-xs text-muted">{formatDate(item.at)}</time>
          </div>
          <p className="mt-1 text-xs text-muted">
            {item.evidence} · {item.source} · {item.feature}
            {item.entity_id ? ` · ${item.entity_id}` : ""}
          </p>
          {Object.keys(item.properties ?? {}).length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-accent">
                Recorded metadata
              </summary>
              <DataRows items={[item.properties ?? {}]} />
              {item.correlation_id && <p>Correlation: {item.correlation_id}</p>}
            </details>
          )}
        </article>
      ))}
      <button
        className={buttonClass}
        disabled={!query.hasNextPage || query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      >
        Load older events
      </button>
    </div>
  );
}
function UserSessions({ userId, days }: { userId: string; days: Days }) {
  const [offset, setOffset] = useState(0),
    query = useIntelligenceSessions(userId, days, offset);
  if (query.isLoading) return <LoadingSkeleton />;
  if (query.error || !query.data)
    return <QueryError error={query.error} retry={() => query.refetch()} />;
  const items = Array.isArray(query.data.items) ? query.data.items : [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {query.data.status === "not_tracked"
          ? "Not tracked"
          : "Partial history"}
        . Sessions expire after 30 minutes of inactivity. Active seconds are
        bounded foreground estimates, not verified problem-solving time.
      </p>
      <DataRows items={items} />
      <div className="flex gap-2">
        <button
          className={buttonClass}
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 30))}
        >
          Previous
        </button>
        <button
          className={buttonClass}
          disabled={items.length < 30}
          onClick={() => setOffset(offset + 30)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function ProductUsersScreen() {
  const [days, setDays] = useState<Days>(30),
    [search, setSearch] = useState(""),
    [segment, setSegment] = useState("all"),
    [exclude, setExclude] = useState(false),
    [offset, setOffset] = useState(0);
  const query = useIntelligenceUsers(days, search, segment, exclude, offset);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Registered accounts and their measured engagement within the selected UTC window."
      />
      <WindowControl
        days={days}
        onChange={(d) => {
          setDays(d);
          setOffset(0);
        }}
      />
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3">
        <label className="text-xs text-muted">
          Search email/name
          <input
            className={`${inputClass} mt-1`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="text-xs text-muted">
          Recorded segment
          <select
            className={`${inputClass} mt-1`}
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value);
              setOffset(0);
            }}
          >
            {[
              "all",
              "new",
              "active",
              "engaged",
              "returning",
              "unobserved",
              "dsa",
              "feed",
              "ai",
              "system_design",
              "mobile",
              "internal",
            ].map((s) => (
              <option key={s} value={s}>
                {s === "unobserved" ? "No measured activity" : titleCase(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={exclude}
            onChange={(e) => {
              setExclude(e.target.checked);
              setOffset(0);
            }}
          />
          Exclude classified internal/demo
        </label>
      </div>
      {query.isLoading ? (
        <LoadingSkeleton />
      ) : query.error || !query.data ? (
        <QueryError error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <CoverageNote coverage={query.data.coverage} />
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Account",
                    "Signup",
                    "Last activity",
                    "Feature/platform",
                    "Sessions/days",
                    "Official solves",
                    "AI runs",
                    "Feed actions",
                    "Design actions",
                    "Acquisition/classification",
                  ].map((s) => (
                    <th
                      className="whitespace-nowrap p-3 text-xs text-muted"
                      key={s}
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((u) => (
                  <tr className="border-t border-border" key={u.user_id}>
                    <td className="p-3">
                      <Link
                        className="text-accent hover:underline"
                        href={`/admin/users/${u.user_id}`}
                      >
                        {u.name || u.email || u.user_id}
                      </Link>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {u.last_activity
                        ? formatDate(u.last_activity)
                        : "No measured activity"}
                    </td>
                    <td className="p-3">
                      {u.last_feature ?? "Unknown"}
                      <p className="text-xs text-muted">
                        {u.last_platform ?? "Unknown"}
                      </p>
                    </td>
                    <td className="p-3">
                      {u.sessions ?? "Not tracked"} /{" "}
                      {u.active_days ?? "No evidence"}
                    </td>
                    {[
                      u.official_solves,
                      u.ai_runs,
                      u.feed_actions,
                      u.design_actions,
                    ].map((n, i) => (
                      <td key={i} className="p-3">
                        {n ?? "No evidence"}
                      </td>
                    ))}
                    <td className="p-3">
                      {u.signup_source}
                      <p className="text-xs text-muted">{u.classification}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              {query.data.total} registered records matching filter
            </span>
            <div className="flex gap-2">
              <button
                className={buttonClass}
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 25))}
              >
                Previous
              </button>
              <button
                className={buttonClass}
                disabled={offset + 25 >= query.data.total}
                onClick={() => setOffset(offset + 25)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DsaDetails({ value }: { value: Record<string, unknown> }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Canonical problem attempts</h2>
      <p className="text-sm text-muted">{String(value.definition)}</p>
      <DataRows items={Array.isArray(value.problems) ? value.problems : []} />
      <h3>Difficulty in recent problem history</h3>
      <DataRows
        items={
          Array.isArray(value.difficulty_breakdown)
            ? value.difficulty_breakdown
            : []
        }
      />
      <h3>Current topics in recent problem history</h3>
      <p className="text-xs text-muted">
        At most 100 recent problems. Topic groups can overlap and do not sum to
        the global total.
      </p>
      <DataRows
        items={
          Array.isArray(value.topic_breakdown) ? value.topic_breakdown : []
        }
      />
    </section>
  );
}

function FeatureDetails({
  section,
  details,
}: {
  section: string;
  details: Record<string, unknown>;
}) {
  const keys =
    section === "ai"
      ? ["ai_tools", "ai_models"]
      : section === "feed"
        ? ["feed_stories", "feed_topics"]
        : [];
  return (
    <>
      {keys.map((key) => (
        <section
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          key={key}
        >
          <h2 className="font-semibold">{titleCase(key)}</h2>
          <p className="text-xs text-muted">
            Recorded metadata only. Missing or expired source metadata remains
            unavailable.
          </p>
          {Array.isArray(details[key]) ? (
            <DataRows items={details[key]} />
          ) : (
            <p className="text-sm text-muted">Not tracked</p>
          )}
        </section>
      ))}
    </>
  );
}
