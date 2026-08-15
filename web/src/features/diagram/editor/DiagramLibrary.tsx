"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FilePenLine, Plus, Search, Trash2 } from "lucide-react";
import type { DiagramDocumentSummary } from "../core/types";
import { systemDesignDiagramMigration } from "../packs";
import { createBrowserDiagramRepository } from "../persistence/BrowserDiagramRepository";

function updatedLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function DiagramLibrary() {
  const repository = useMemo(() => createBrowserDiagramRepository([systemDesignDiagramMigration]), []);
  const [documents, setDocuments] = useState<DiagramDocumentSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repository) return;
    try {
      setDocuments(await repository.list());
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load diagrams.");
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const filtered = documents.filter((document) => document.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section className="mx-auto min-h-[calc(100vh-57px)] max-w-6xl px-5 py-6" data-testid="diagram-library">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Diagram Studio</p><h1 className="mt-1 text-2xl font-semibold">Diagram library</h1><p className="mt-1 text-sm text-muted">Architecture, flows, data models, and cloud diagrams.</p></div>
        <Link href="/admin/diagrams/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110"><Plus className="h-4 w-4" />New diagram</Link>
      </header>
      <div className="mt-5 flex items-center justify-between gap-3">
        <label className="relative block w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input aria-label="Search diagrams" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search diagrams…" className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none transition focus:border-accent" /></label>
        <span className="text-xs text-muted">{filtered.length} diagram{filtered.length === 1 ? "" : "s"}</span>
      </div>
      {status ? <p role="status" className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{status}</p> : null}
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[minmax(220px,1.6fr)_120px_100px_minmax(160px,1fr)_120px] gap-3 border-b border-border bg-surface-elevated/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted"><span>Name</span><span>Pages</span><span>Objects</span><span>Updated</span><span className="text-right">Actions</span></div>
        {loading ? <div className="px-4 py-10 text-center text-sm text-muted">Loading diagrams…</div> : null}
        {!loading && !filtered.length ? <div className="px-4 py-12 text-center"><FilePenLine className="mx-auto h-7 w-7 text-muted" /><p className="mt-3 text-sm font-medium">{query ? "No diagrams match your search" : "No diagrams yet"}</p><p className="mt-1 text-xs text-muted">Create a blank diagram or start from a focused template.</p></div> : null}
        {filtered.map((document) => <div key={document.id} className="grid min-h-14 grid-cols-[minmax(220px,1.6fr)_120px_100px_minmax(160px,1fr)_120px] items-center gap-3 border-b border-border/70 px-4 py-2 last:border-0 hover:bg-surface-elevated/35">
          <div className="min-w-0">{renamingId === document.id ? <input autoFocus aria-label={`Rename ${document.title}`} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => { setRenamingId(null); }} onKeyDown={(event) => { if (event.key === "Escape") setRenamingId(null); if (event.key === "Enter" && renameValue.trim()) { void repository?.rename(document.id, renameValue).then(() => { setRenamingId(null); void refresh(); }); } }} className="h-8 w-full rounded border border-accent bg-background px-2 text-sm outline-none" /> : <Link href={`/admin/diagrams/${document.id}`} className="block truncate text-sm font-medium hover:text-accent">{document.title}</Link>}<p className="mt-0.5 truncate text-[10px] text-muted">{document.enabledPackIds.join(" · ") || "General"}</p></div>
          <span className="text-xs text-muted">{document.pageCount}</span><span className="text-xs text-muted">{document.elementCount}</span><span className="text-xs text-muted">{updatedLabel(document.updatedAt)}</span>
          <div className="flex justify-end gap-1">{deletingId === document.id ? <><button type="button" onClick={() => setDeletingId(null)} className="h-7 rounded px-2 text-[10px] text-muted hover:bg-surface-elevated">Cancel</button><button type="button" onClick={() => { void repository?.remove(document.id).then(() => { setDeletingId(null); void refresh(); }); }} className="h-7 rounded bg-danger px-2 text-[10px] font-semibold text-white">Delete</button></> : <><button type="button" aria-label={`Rename ${document.title}`} title="Rename" onClick={() => { setRenamingId(document.id); setRenameValue(document.title); }} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-elevated hover:text-foreground"><FilePenLine className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Duplicate ${document.title}`} title="Duplicate" onClick={() => { void repository?.duplicate(document.id).then(() => refresh()); }} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-elevated hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Delete ${document.title}`} title="Delete" onClick={() => setDeletingId(document.id)} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></>}</div>
        </div>)}
      </div>
    </section>
  );
}
