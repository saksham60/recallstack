"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { formatCount, formatPercent, titleCase } from "../format";
import { useProblems } from "../use-admin";
import { positiveInt, useAdminUrlState } from "../use-url-state";
import type { ProblemListParams } from "../types";
import { LoadingSkeleton, PageHeader, Pagination, QueryError, ResultsState, buttonClass, inputClass } from "../components/AdminPrimitives";

const difficulties = ["beginner", "easy", "medium", "hard", "expert"] as const;
const statuses = ["draft", "in_review", "published", "archived"] as const;
const sorts = ["attempts", "unique_users_attempted", "unique_users_completed", "solve_rate", "first_attempt_success_rate", "title", "created_at"] as const;

export function ProblemsScreen() {
  const router = useRouter();
  const { searchParams, update } = useAdminUrlState();
  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => {
    const timer = window.setTimeout(() => search !== urlSearch && update({ search }, true), 350);
    return () => window.clearTimeout(timer);
  }, [search, urlSearch, update]);
  const params: ProblemListParams = {
    page: positiveInt(searchParams.get("page"), 1),
    page_size: positiveInt(searchParams.get("page_size"), 25),
    search: urlSearch || undefined,
    topic_id: searchParams.get("topic_id") || undefined,
    difficulty: (searchParams.get("difficulty") as ProblemListParams["difficulty"]) || undefined,
    publication_status: (searchParams.get("publication_status") as ProblemListParams["publication_status"]) || undefined,
    sort_by: (searchParams.get("sort_by") as ProblemListParams["sort_by"]) || "attempts",
    sort_order: (searchParams.get("sort_order") as ProblemListParams["sort_order"]) || "desc",
  };
  const query = useProblems(params);
  const filtered = [...searchParams.keys()].some((key) => !["page", "page_size", "sort_by", "sort_order"].includes(key));
  return (
    <div className="space-y-6">
      <PageHeader title="Problem analytics" description="Live attempt and completion aggregates from published and draft problem content." actions={<button className={buttonClass} disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh"}</button>} />
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs text-muted xl:col-span-2">Search<input className={`${inputClass} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Problem title…" /></label>
        <label className="text-xs text-muted">Difficulty<select className={`${inputClass} mt-1`} value={params.difficulty ?? ""} onChange={(event) => update({ difficulty: event.target.value }, true)}><option value="">All difficulties</option>{difficulties.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        <label className="text-xs text-muted">Publication status<select className={`${inputClass} mt-1`} value={params.publication_status ?? ""} onChange={(event) => update({ publication_status: event.target.value }, true)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        <label className="text-xs text-muted xl:col-span-2">Topic ID<input className={`${inputClass} mt-1 font-mono`} value={params.topic_id ?? ""} onChange={(event) => update({ topic_id: event.target.value }, true)} placeholder="Filter by topic UUID" /></label>
        <label className="text-xs text-muted">Sort by<select className={`${inputClass} mt-1`} value={params.sort_by} onChange={(event) => update({ sort_by: event.target.value }, true)}>{sorts.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        <label className="text-xs text-muted">Direction<select className={`${inputClass} mt-1`} value={params.sort_order} onChange={(event) => update({ sort_order: event.target.value }, true)}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
        <button className={buttonClass} disabled={!filtered} onClick={() => { setSearch(""); router.replace("/admin/problems"); }}>Clear all filters</button>
      </div>
      {query.isLoading ? <LoadingSkeleton /> : query.error || !query.data ? <QueryError error={query.error} retry={() => query.refetch()} resource="problem analytics" /> : (
        <ResultsState count={query.data.items.length} filtered={filtered}>
          <div className="overflow-hidden rounded-lg border border-border bg-surface"><div className="overflow-x-auto"><table className="w-full min-w-[1400px] text-left text-sm"><thead className="border-b border-border bg-surface-elevated text-xs uppercase text-muted"><tr><th className="p-3">Problem</th><th className="p-3">Difficulty</th><th className="p-3">Status</th><th className="p-3">Topics</th><th className="p-3">Attempts</th><th className="p-3">Accepted</th><th className="p-3">Users attempted</th><th className="p-3">Users completed</th><th className="p-3">Solve rate</th><th className="p-3">First-attempt success</th><th className="p-3">Avg attempts to complete</th></tr></thead><tbody className="divide-y divide-border">{query.data.items.map((problem) => <tr key={problem.problem_id} tabIndex={0} className="cursor-pointer hover:bg-surface-elevated focus:bg-surface-elevated focus:outline-none" onClick={() => router.push(`/admin/problems/${problem.problem_id}`)} onKeyDown={(event) => event.key === "Enter" && router.push(`/admin/problems/${problem.problem_id}`)}><td className="p-3 font-medium">{problem.title}</td><td className="p-3"><Badge variant="secondary">{titleCase(problem.difficulty)}</Badge></td><td className="p-3"><Badge variant={problem.publication_status === "published" ? "success" : "outline"}>{titleCase(problem.publication_status)}</Badge></td><td className="p-3 text-muted">{problem.topics.join(", ") || "—"}</td><td className="p-3 tabular-nums">{formatCount(problem.total_attempts)}</td><td className="p-3 tabular-nums">{formatCount(problem.accepted_attempts)}</td><td className="p-3 tabular-nums">{formatCount(problem.unique_users_attempted)}</td><td className="p-3 tabular-nums">{formatCount(problem.unique_users_completed)}</td><td className="p-3 tabular-nums">{formatPercent(problem.solve_rate)}</td><td className="p-3 tabular-nums">{formatPercent(problem.first_attempt_success_rate)}</td><td className="p-3 tabular-nums">{problem.average_attempts_before_completion?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "Not captured"}</td></tr>)}</tbody></table></div><Pagination pagination={query.data.pagination} onPage={(page) => update({ page })} onPageSize={(page_size) => update({ page_size }, true)} /></div>
        </ResultsState>
      )}
    </div>
  );
}
