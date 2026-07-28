"use client";

import { useRouter } from "next/navigation";
import { formatDate } from "../format";
import { useAuditLogs } from "../use-admin";
import { positiveInt, useAdminUrlState } from "../use-url-state";
import type { AuditLogParams } from "../types";
import { CopyId, LoadingSkeleton, PageHeader, Pagination, QueryError, ResultsState, buttonClass, inputClass } from "../components/AdminPrimitives";

const sensitiveKey = /authorization|token|password|secret|cookie|api[-_]?key/i;

function safeMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveKey.test(key)));
}

export function AuditLogsScreen() {
  const router = useRouter();
  const { searchParams, update } = useAdminUrlState();
  const params: AuditLogParams = {
    page: positiveInt(searchParams.get("page"), 1),
    page_size: positiveInt(searchParams.get("page_size"), 25),
    admin_user_id: searchParams.get("admin_user_id") || undefined,
    action: searchParams.get("action") || undefined,
    resource_type: searchParams.get("resource_type") || undefined,
    from_date: searchParams.get("from_date") ? `${searchParams.get("from_date")}T00:00:00.000Z` : undefined,
    to_date: searchParams.get("to_date") ? `${searchParams.get("to_date")}T23:59:59.999Z` : undefined,
  };
  const query = useAuditLogs(params);
  const filtered = [...searchParams.keys()].some((key) => !["page", "page_size"].includes(key));
  return (
    <div className="space-y-6">
      <PageHeader title="Audit logs" description="Sanitized records of administrator access. This request appears in the next audit-log response, not necessarily this one." actions={<button className={buttonClass} disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh"}</button>} />
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-3">
        {[["admin_user_id", "Admin user ID"], ["action", "Action"], ["resource_type", "Resource type"]].map(([key, label]) => <label key={key} className="text-xs text-muted">{label}<input className={`${inputClass} mt-1`} value={searchParams.get(key) ?? ""} onChange={(event) => update({ [key]: event.target.value }, true)} /></label>)}
        <label className="text-xs text-muted">From date<input type="date" className={`${inputClass} mt-1`} value={searchParams.get("from_date") ?? ""} onChange={(event) => update({ from_date: event.target.value }, true)} /></label>
        <label className="text-xs text-muted">To date<input type="date" className={`${inputClass} mt-1`} value={searchParams.get("to_date") ?? ""} onChange={(event) => update({ to_date: event.target.value }, true)} /></label>
        <div className="flex items-end"><button className={buttonClass} disabled={!filtered} onClick={() => router.replace("/admin/audit-logs")}>Clear all filters</button></div>
      </div>
      {query.isLoading ? <LoadingSkeleton /> : query.error || !query.data ? <QueryError error={query.error} retry={() => query.refetch()} resource="audit logs" /> : (
        <ResultsState count={query.data.items.length} filtered={filtered}>
          <div className="overflow-hidden rounded-lg border border-border bg-surface"><div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-left text-sm"><thead className="border-b border-border bg-surface-elevated text-xs uppercase text-muted"><tr><th className="p-3">Timestamp</th><th className="p-3">Admin</th><th className="p-3">Action</th><th className="p-3">Resource</th><th className="p-3">Method</th><th className="p-3">Request path</th><th className="p-3">Request ID</th><th className="p-3">Metadata</th></tr></thead><tbody className="divide-y divide-border">{query.data.items.map((log) => {
            const metadata = safeMetadata(log.metadata_json);
            return <tr key={log.id}><td className="p-3" title={log.created_at}>{formatDate(log.created_at)}</td><td className="p-3"><CopyId value={log.admin_user_id} label="admin user ID" /></td><td className="p-3 font-medium">{log.action}</td><td className="p-3"><div>{log.resource_type}</div>{log.resource_id ? <CopyId value={log.resource_id} label="resource ID" /> : <span className="text-muted">—</span>}</td><td className="p-3 font-mono text-xs">{log.request_method}</td><td className="p-3 font-mono text-xs">{log.request_path}</td><td className="p-3"><CopyId value={log.request_id} label="request ID" /></td><td className="p-3"><code className="block max-w-sm whitespace-pre-wrap break-all rounded bg-background p-2 text-xs text-muted">{Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : "{}"}</code></td></tr>;
          })}</tbody></table></div><Pagination pagination={query.data.pagination} onPage={(page) => update({ page })} onPageSize={(page_size) => update({ page_size }, true)} /></div>
        </ResultsState>
      )}
    </div>
  );
}
