"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCount, formatDate, formatDuration, formatPercent, titleCase } from "../format";
import { useAdminIdentity, useAdminUser, useCurrentAdminRoleId, useGrantRole, useRevokeRole, useUserActivity, useUserRoles } from "../use-admin";
import { positiveInt, useAdminUrlState } from "../use-url-state";
import type { ActivityParams } from "../types";
import { CopyId, InlineNotice, LoadingSkeleton, MetricCard, Modal, PageHeader, Pagination, QueryError, ResultsState, buttonClass, inputClass } from "../components/AdminPrimitives";

const difficulties = ["beginner", "easy", "medium", "hard", "expert"] as const;
const activityTypes = ["problem_attempted", "problem_reattempted", "problem_completed", "revision_completed", "user_signed_up"] as const;

export function UserDetailScreen({ userId }: { userId: string }) {
  const searchParams = useSearchParams();
  const { update } = useAdminUrlState();
  const tab = searchParams.get("tab") ?? "overview";
  const query = useAdminUser(userId);
  if (query.isLoading) return <LoadingSkeleton rows={8} />;
  if (query.error || !query.data) return <QueryError error={query.error} retry={() => query.refetch()} resource="user" />;
  const detail = query.data;
  return (
    <div className="space-y-6">
      <div className="text-sm text-muted"><Link href="/admin/users" className="hover:text-accent">Users</Link> <span aria-hidden> / </span> {detail.profile.name || detail.profile.email}</div>
      <PageHeader title={detail.profile.name || "Unnamed user"} description={detail.profile.email} actions={<CopyId value={detail.profile.user_id} label="user ID" />} />
      <div role="tablist" aria-label="User detail sections" className="flex gap-2 border-b border-border">
        {["overview", "activity", "roles"].map((value) => (
          <button key={value} role="tab" aria-selected={tab === value} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === value ? "border-accent text-accent" : "border-transparent text-muted"}`} onClick={() => update({ tab: value === "overview" ? null : value })}>
            {titleCase(value)}
          </button>
        ))}
      </div>
      {tab === "activity" ? <ActivityTab userId={userId} /> : tab === "roles" ? <RolesTab userId={userId} /> : <UserOverview detail={detail} />}
    </div>
  );
}

function UserOverview({ detail }: { detail: ReturnType<typeof useAdminUser>["data"] & object }) {
  if (!detail) return null;
  const summary = detail.progress_summary;
  const difficultyMap = new Map(detail.difficulty_breakdown.map((item) => [item.difficulty.toLowerCase(), item]));
  return (
    <div className="space-y-7">
      <section>
        <h2 className="mb-3 font-semibold">Profile</h2>
        <dl className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-muted">User ID</dt><dd className="mt-1"><CopyId value={detail.profile.user_id} /></dd></div>
          <div><dt className="text-xs text-muted">Signup date</dt><dd className="mt-1" title={detail.profile.created_at}>{formatDate(detail.profile.created_at)}</dd></div>
          <div><dt className="text-xs text-muted">Last active</dt><dd className="mt-1" title={detail.profile.last_active_at ?? undefined}>{formatDate(detail.profile.last_active_at)}</dd></div>
          <div><dt className="text-xs text-muted">Account status</dt><dd className="mt-1"><Badge variant="success">Active</Badge></dd></div>
        </dl>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Progress summary</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Unique attempted" value={formatCount(summary.unique_problems_attempted)} />
          <MetricCard label="Unique completed" value={formatCount(summary.unique_problems_completed)} />
          <MetricCard label="Total attempts" value={formatCount(summary.total_attempts)} />
          <MetricCard label="Accepted attempts" value={formatCount(summary.accepted_attempts)} />
          <MetricCard label="First-attempt successes" value={formatCount(summary.first_attempt_successes)} />
          <MetricCard label="First-attempt success rate" value={formatPercent(summary.first_attempt_success_rate)} />
          <MetricCard label="Current / longest streak" value="Not available" />
          <MetricCard label="Readiness score" value="Not available" />
        </div>
      </section>
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Interview unlock</h2><p className="mt-1 text-sm text-muted">{formatCount(detail.interview_unlock.current_completions)} of {formatCount(detail.interview_unlock.required_completions)} required completions</p></div><Badge variant={detail.interview_unlock.eligible ? "success" : "secondary"}>{detail.interview_unlock.eligible ? "Eligible" : `${formatCount(detail.interview_unlock.remaining_completions)} remaining`}</Badge></div>
        <ProgressBar className="mt-4" progress={(detail.interview_unlock.current_completions / detail.interview_unlock.required_completions) * 100} />
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Difficulty breakdown</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {difficulties.map((difficulty) => {
            const item = difficultyMap.get(difficulty);
            return <MetricCard key={difficulty} label={titleCase(difficulty)} value={item ? `${formatCount(item.completed)} completed` : "Not available"} hint={item ? `${formatCount(item.attempted)} attempted` : undefined} />;
          })}
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Topic progress</h2>
        <ResultsState count={detail.topic_progress.length}>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm"><thead className="border-b border-border bg-surface-elevated text-xs uppercase text-muted"><tr><th className="p-3">Topic</th><th className="p-3">Available</th><th className="p-3">Attempted</th><th className="p-3">Completed</th><th className="p-3">Completion</th></tr></thead><tbody className="divide-y divide-border">{detail.topic_progress.map((topic) => <tr key={topic.topic_id}><td className="p-3 font-medium">{topic.topic_name}</td><td className="p-3">{formatCount(topic.available_problems)}</td><td className="p-3">{formatCount(topic.attempted_problems)}</td><td className="p-3">{formatCount(topic.completed_problems)}</td><td className="p-3">{formatPercent(topic.completion_percentage)}</td></tr>)}</tbody></table>
          </div>
        </ResultsState>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4"><h2 className="font-semibold">Revision summary</h2>{detail.revision_summary.available ? <dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted">Items</dt><dd>{formatCount(detail.revision_summary.total_revision_items)}</dd></div><div><dt className="text-muted">Completed</dt><dd>{formatCount(detail.revision_summary.completed_revisions)}</dd></div><div><dt className="text-muted">Overdue</dt><dd>{formatCount(detail.revision_summary.overdue_revisions)}</dd></div><div><dt className="text-muted">Last revision</dt><dd>{formatDate(detail.revision_summary.last_revision_at)}</dd></div></dl> : <p className="mt-3 text-sm text-muted">Not available yet</p>}</div>
        <div className="rounded-lg border border-border bg-surface p-4"><h2 className="font-semibold">Mock tests</h2><p className="mt-3 text-sm text-muted">{detail.mock_test_summary.available ? "Available" : "Not available yet"}</p></div>
      </section>
    </div>
  );
}

function ActivityTab({ userId }: { userId: string }) {
  const { searchParams, update } = useAdminUrlState();
  const type = searchParams.get("activity_type") as ActivityParams["activity_type"];
  const params: ActivityParams = {
    page: positiveInt(searchParams.get("activity_page"), 1),
    page_size: positiveInt(searchParams.get("activity_page_size"), 25),
    activity_type: type || undefined,
    from_date: searchParams.get("from_date") ? `${searchParams.get("from_date")}T00:00:00.000Z` : undefined,
    to_date: searchParams.get("to_date") ? `${searchParams.get("to_date")}T23:59:59.999Z` : undefined,
  };
  const query = useUserActivity(userId, params);
  const filtered = Boolean(type || searchParams.get("from_date") || searchParams.get("to_date"));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3">
        <label className="text-xs text-muted">Activity type<select className={`${inputClass} mt-1`} value={type ?? ""} onChange={(event) => update({ activity_type: event.target.value, activity_page: null })}><option value="">All activity</option>{activityTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        <label className="text-xs text-muted">From date<input type="date" className={`${inputClass} mt-1`} value={searchParams.get("from_date") ?? ""} onChange={(event) => update({ from_date: event.target.value, activity_page: null })} /></label>
        <label className="text-xs text-muted">To date<input type="date" className={`${inputClass} mt-1`} value={searchParams.get("to_date") ?? ""} onChange={(event) => update({ to_date: event.target.value, activity_page: null })} /></label>
      </div>
      {query.isLoading ? <LoadingSkeleton /> : query.error || !query.data ? <QueryError error={query.error} retry={() => query.refetch()} resource="activity" /> : (
        <ResultsState count={query.data.items.length} filtered={filtered}>
          <div className="overflow-hidden rounded-lg border border-border bg-surface"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-border bg-surface-elevated text-xs uppercase text-muted"><tr><th className="p-3">Activity</th><th className="p-3">Timestamp</th><th className="p-3">Problem</th><th className="p-3">Difficulty</th><th className="p-3">Topic</th><th className="p-3">Attempt</th><th className="p-3">Status</th><th className="p-3">Time spent</th><th className="p-3">Hints</th></tr></thead><tbody className="divide-y divide-border">{query.data.items.map((item) => {
            const metadata = item.metadata as Record<string, unknown>;
            return <tr key={item.activity_id}><td className="p-3"><Badge variant={item.activity_type === "problem_completed" ? "success" : "secondary"}>{titleCase(item.activity_type)}</Badge></td><td className="p-3" title={item.occurred_at}>{formatDate(item.occurred_at)}</td><td className="p-3">{item.problem ? <Link className="font-medium text-accent hover:underline" href={`/admin/problems/${item.problem.problem_id}`}>{item.problem.title}</Link> : "—"}</td><td className="p-3">{item.problem ? titleCase(item.problem.difficulty) : "—"}</td><td className="p-3">{item.problem?.topic ?? "—"}</td><td className="p-3">{typeof metadata.attempt_number === "number" ? metadata.attempt_number : "—"}</td><td className="p-3">{typeof metadata.status === "string" ? titleCase(metadata.status) : "—"}</td><td className="p-3">{typeof metadata.time_spent_seconds === "number" ? formatDuration(metadata.time_spent_seconds) : "—"}</td><td className="p-3">{typeof metadata.hints_used === "boolean" ? (metadata.hints_used ? "Yes" : "No") : typeof metadata.hints_used === "number" ? metadata.hints_used : "—"}</td></tr>;
          })}</tbody></table></div><Pagination pagination={query.data.pagination} onPage={(activity_page) => update({ activity_page })} onPageSize={(activity_page_size) => update({ activity_page_size, activity_page: null })} /></div>
        </ResultsState>
      )}
    </div>
  );
}

function RolesTab({ userId }: { userId: string }) {
  const roles = useUserRoles(userId);
  const identity = useAdminIdentity();
  const adminRole = useCurrentAdminRoleId();
  const grant = useGrantRole(userId);
  const revoke = useRevokeRole(userId);
  const [action, setAction] = useState<"grant" | "revoke" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const submittingRef = useRef(false);
  if (roles.isLoading) return <LoadingSkeleton />;
  if (roles.error || !roles.data) return <QueryError error={roles.error} retry={() => roles.refetch()} resource="roles" />;
  const activeAdmin = roles.data.items.find((role) => role.role_code === "admin" && role.active);
  const isSelf = identity.data?.id === userId;
  const pending = grant.isPending || revoke.isPending;
  const confirm = async () => {
    if (pending || submittingRef.current) return;
    submittingRef.current = true;
    setNotice(null);
    try {
      if (action === "grant" && adminRole.roleId) {
        await grant.mutateAsync(adminRole.roleId);
        setNotice({ tone: "success", text: "Admin access granted successfully." });
      } else if (action === "revoke" && activeAdmin) {
        await revoke.mutateAsync(activeAdmin.role_id);
        setNotice({ tone: "success", text: "Admin access removed successfully." });
      }
      setAction(null);
    } catch (error) {
      setAction(null);
      setNotice({ tone: "danger", text: getApiErrorMessage(error, "The role change could not be completed.") });
    } finally {
      submittingRef.current = false;
    }
  };
  return (
    <div className="space-y-4">
      {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
      {isSelf && <InlineNotice tone="info">You are managing your own account. Removing this role will end your access after the server confirms the change.</InlineNotice>}
      {!adminRole.isLoading && !adminRole.roleId && !activeAdmin && <InlineNotice tone="danger">The active admin role ID could not be resolved from your own server-provided role grants. “Make Admin” is disabled; no ID has been guessed.</InlineNotice>}
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={Boolean(activeAdmin) || !adminRole.roleId || pending} onClick={() => setAction("grant")}>Make Admin</button>
        <button className={`${buttonClass} border-danger/50 text-danger`} disabled={!activeAdmin || pending} onClick={() => setAction("revoke")}>Remove Admin</button>
      </div>
      <ResultsState count={roles.data.items.length}>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-border bg-surface-elevated text-xs uppercase text-muted"><tr><th className="p-3">Role</th><th className="p-3">Description</th><th className="p-3">State</th><th className="p-3">Granted</th><th className="p-3">Granted by</th><th className="p-3">Revoked</th><th className="p-3">Revoked by</th></tr></thead><tbody className="divide-y divide-border">{roles.data.items.map((role) => <tr key={role.grant_id}><td className="p-3 font-medium">{role.role_code}</td><td className="p-3 text-muted">{role.role_description ?? "—"}</td><td className="p-3"><Badge variant={role.active ? "success" : "secondary"}>{role.active ? "Active" : "Revoked"}</Badge></td><td className="p-3">{formatDate(role.granted_at)}</td><td className="p-3">{role.granted_by ? <CopyId value={role.granted_by} /> : "—"}</td><td className="p-3">{formatDate(role.revoked_at)}</td><td className="p-3">{role.revoked_by ? <CopyId value={role.revoked_by} /> : "—"}</td></tr>)}</tbody></table></div>
      </ResultsState>
      <Modal open={action === "grant"} title="Grant administrator access?" description="This user will gain access to every admin page and role-management action." confirmLabel="Make Admin" pending={pending} onClose={() => setAction(null)} onConfirm={confirm} />
      <Modal open={action === "revoke"} title="Remove administrator access?" description={`${isSelf ? "This is your own account. " : ""}The user will lose access to all administrator pages. The server will prevent removal of the final administrator.`} confirmLabel="Remove Admin" destructive pending={pending} onClose={() => setAction(null)} onConfirm={confirm} />
    </div>
  );
}
