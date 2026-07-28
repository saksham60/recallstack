"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { formatCount, formatDate } from "../format";
import { useAdminUsers } from "../use-admin";
import { positiveInt, useAdminUrlState } from "../use-url-state";
import type { UserListParams } from "../types";
import { CopyId, LoadingSkeleton, PageHeader, Pagination, QueryError, ResultsState, buttonClass, inputClass } from "../components/AdminPrimitives";

const sortFields = [
  ["created_at", "Signup date"],
  ["last_active_at", "Last active"],
  ["unique_problems_completed", "Completed"],
  ["unique_problems_attempted", "Attempted"],
  ["name", "Name"],
  ["email", "Email"],
] as const;

const startOfDay = (value: string | null) => value ? `${value}T00:00:00.000Z` : undefined;
const endOfDay = (value: string | null) => value ? `${value}T23:59:59.999Z` : undefined;

export function UsersScreen() {
  const router = useRouter();
  const { searchParams, update } = useAdminUrlState();
  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== urlSearch) update({ search }, true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, urlSearch, update]);

  const eligibility = searchParams.get("eligible");
  const params: UserListParams = {
    page: positiveInt(searchParams.get("page"), 1),
    page_size: positiveInt(searchParams.get("page_size"), 25),
    search: urlSearch || undefined,
    interview_eligible: eligibility === "true" ? true : eligibility === "false" ? false : undefined,
    min_completed: searchParams.get("min_completed") ? Number(searchParams.get("min_completed")) : undefined,
    max_completed: searchParams.get("max_completed") ? Number(searchParams.get("max_completed")) : undefined,
    signed_up_from: startOfDay(searchParams.get("signed_up_from")),
    signed_up_to: endOfDay(searchParams.get("signed_up_to")),
    active_from: startOfDay(searchParams.get("active_from")),
    active_to: endOfDay(searchParams.get("active_to")),
    account_status: "active",
    sort_by: (searchParams.get("sort_by") as UserListParams["sort_by"]) ?? "created_at",
    sort_order: (searchParams.get("sort_order") as UserListParams["sort_order"]) ?? "desc",
  };
  const query = useAdminUsers(params);
  const filtered = [...searchParams.keys()].some((key) => !["page", "page_size", "sort_by", "sort_order"].includes(key));

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Search accounts and inspect authoritative progress." actions={<button className={buttonClass} disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh"}</button>} />
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-medium text-muted xl:col-span-2">Search by name or email
          <input className={`${inputClass} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users…" />
        </label>
        <label className="text-xs font-medium text-muted">Interview eligibility
          <select className={`${inputClass} mt-1`} value={eligibility ?? ""} onChange={(event) => update({ eligible: event.target.value }, true)}>
            <option value="">All users</option><option value="true">Eligible</option><option value="false">Not eligible</option>
          </select>
        </label>
        <label className="text-xs font-medium text-muted">Account status
          <select className={`${inputClass} mt-1`} disabled><option>Active</option></select>
        </label>
        {[
          ["min_completed", "Minimum completed", "number"],
          ["max_completed", "Maximum completed", "number"],
          ["signed_up_from", "Signed up from", "date"],
          ["signed_up_to", "Signed up to", "date"],
          ["active_from", "Active from", "date"],
          ["active_to", "Active to", "date"],
        ].map(([key, label, type]) => (
          <label key={key} className="text-xs font-medium text-muted">{label}
            <input type={type} min={type === "number" ? 0 : undefined} className={`${inputClass} mt-1`} value={searchParams.get(key) ?? ""} onChange={(event) => update({ [key]: event.target.value }, true)} />
          </label>
        ))}
        <label className="text-xs font-medium text-muted">Sort by
          <select className={`${inputClass} mt-1`} value={params.sort_by} onChange={(event) => update({ sort_by: event.target.value }, true)}>
            {sortFields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-muted">Direction
          <select className={`${inputClass} mt-1`} value={params.sort_order} onChange={(event) => update({ sort_order: event.target.value }, true)}>
            <option value="desc">Descending</option><option value="asc">Ascending</option>
          </select>
        </label>
        <div className="flex items-end"><button className={buttonClass} disabled={!filtered} onClick={() => { setSearch(""); router.replace("/admin/users"); }}>Clear all filters</button></div>
      </div>
      {query.isLoading ? <LoadingSkeleton /> : query.error || !query.data ? <QueryError error={query.error} retry={() => query.refetch()} resource="users" /> : (
        <ResultsState count={query.data.items.length} filtered={filtered}>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-border bg-surface-elevated text-xs uppercase tracking-wide text-muted">
                  <tr><th className="px-3 py-3">User</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Signup date</th><th className="px-3 py-3">Last active</th><th className="px-3 py-3">Attempted</th><th className="px-3 py-3">Completed</th><th className="px-3 py-3">Interview eligibility</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {query.data.items.map((user) => (
                    <tr key={user.user_id} tabIndex={0} className="cursor-pointer hover:bg-surface-elevated/70 focus:bg-surface-elevated focus:outline-none" onClick={() => router.push(`/admin/users/${user.user_id}`)} onKeyDown={(event) => event.key === "Enter" && router.push(`/admin/users/${user.user_id}`)}>
                      <td className="px-3 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 font-semibold text-accent">{(user.name || user.email).charAt(0).toUpperCase()}</span><div><span className="font-medium">{user.name || "Unnamed user"}</span><div><CopyId value={user.user_id} label="user ID" /></div></div></div></td>
                      <td className="px-3 py-3 text-muted">{user.email}</td>
                      <td className="px-3 py-3" title={user.created_at}>{formatDate(user.created_at, true)}</td>
                      <td className="px-3 py-3" title={user.last_active_at ?? undefined}>{formatDate(user.last_active_at)}</td>
                      <td className="px-3 py-3 tabular-nums">{formatCount(user.unique_problems_attempted)}</td>
                      <td className="px-3 py-3 tabular-nums">{formatCount(user.unique_problems_completed)}</td>
                      <td className="px-3 py-3">{user.interview_unlock.eligible ? <Badge variant="success">Eligible</Badge> : <div><Badge variant="secondary">Not eligible</Badge><p className="mt-1 text-xs text-muted">{formatCount(user.interview_unlock.remaining_completions)} remaining</p></div>}</td>
                      <td className="px-3 py-3"><Badge variant="success">Active</Badge></td>
                      <td className="px-3 py-3"><span className="text-accent">View details →</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={query.data.pagination} onPage={(page) => update({ page })} onPageSize={(page_size) => update({ page_size }, true)} />
          </div>
        </ResultsState>
      )}
    </div>
  );
}
