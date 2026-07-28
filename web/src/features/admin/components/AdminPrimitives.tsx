"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, getApiErrorMessage } from "@/lib/api/errors";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import type { Pagination as PaginationType } from "../types";
import { formatCount, truncateId } from "../format";

export const buttonClass =
  "inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-surface-elevated px-3 text-sm font-medium text-foreground transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
export const inputClass =
  "min-h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-md border border-border bg-surface" />
      ))}
    </div>
  );
}

export function QueryError({ error, retry, resource = "data" }: { error: unknown; retry: () => void; resource?: string }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const title =
    status === 401 ? "Session expired" :
    status === 403 ? "Access denied" :
    status === 404 ? "Not found" :
    status === 409 ? "Request could not be completed" :
    status === 422 ? "Invalid filters" :
    `Could not load ${resource}`;
  return (
    <ErrorState
      title={title}
      description={getApiErrorMessage(error)}
      action={<button className={buttonClass} onClick={retry}>Try again</button>}
    />
  );
}

export function Pagination({ pagination, onPage, onPageSize }: {
  pagination: PaginationType;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3 text-sm">
      <span className="text-muted">
        Page {pagination.page} of {Math.max(1, pagination.total_pages)} · {formatCount(pagination.total_items)} results
      </span>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-2 text-muted">
            Rows
            <select className={inputClass} value={pagination.page_size} onChange={(event) => onPageSize(Number(event.target.value))}>
              {[25, 50, 100].map((size) => <option key={size}>{size}</option>)}
            </select>
          </label>
        )}
        <button className={buttonClass} disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</button>
        <button className={buttonClass} disabled={pagination.page >= pagination.total_pages} onClick={() => onPage(pagination.page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function ResultsState({ count, filtered, children }: { count: number; filtered?: boolean; children: ReactNode }) {
  return count === 0
    ? <EmptyState title={filtered ? "No results match these filters" : "Nothing to show yet"} description={filtered ? "Try clearing or broadening the filters." : undefined} />
    : <>{children}</>;
}

export function CopyId({ value, label = "ID" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="font-mono text-xs text-muted underline decoration-dotted underline-offset-4 hover:text-foreground"
      title={value}
      aria-label={`Copy ${label}`}
      onClick={async (event) => {
        event.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : truncateId(value)}
    </button>
  );
}

export function Modal({ open, title, description, confirmLabel, destructive, pending, onClose, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled])") ?? []);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, pending, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description" className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
        <p id="modal-description" className="mt-2 text-sm text-muted">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} className={buttonClass} disabled={pending} onClick={onClose}>Cancel</button>
          <button className={`${buttonClass} ${destructive ? "border-danger bg-danger/15 text-danger" : "border-accent bg-accent text-accent-foreground"}`} disabled={pending} onClick={onConfirm}>
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InlineNotice({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "danger" | "info" }) {
  const toneClass = tone === "danger" ? "border-danger/40 text-danger" : tone === "success" ? "border-success/40 text-success" : "border-accent/40 text-foreground";
  return <div role="status" className={`rounded-md border bg-surface px-3 py-2 text-sm ${toneClass}`}>{children}</div>;
}
