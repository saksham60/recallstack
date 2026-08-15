"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Cloud, Database, File, Network, Workflow } from "lucide-react";
import { createDefaultDiagramRegistry, systemDesignDiagramMigration } from "../packs";
import { createBrowserDiagramRepository } from "../persistence/BrowserDiagramRepository";
import { DIAGRAM_TEMPLATES, type DiagramTemplate, type DiagramTemplateCategory } from "../templates";

const CATEGORY_ICONS = { General: File, "System Design": Network, Flowchart: Workflow, ERD: Database, Cloud } satisfies Record<DiagramTemplateCategory, typeof File>;

export function NewDiagramScreen() {
  const router = useRouter();
  const repository = useMemo(() => createBrowserDiagramRepository([systemDesignDiagramMigration]), []);
  const registry = useMemo(() => createDefaultDiagramRegistry(), []);
  const [title, setTitle] = useState("Untitled Diagram");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const create = async (starter: DiagramTemplate) => {
    if (!repository || creating) return;
    setCreating(true);
    setError("");
    try {
      const document = starter.create(title.trim() || starter.label, registry);
      document.metadata = { templateId: starter.id };
      await repository.save(document);
      router.push(`/admin/diagrams/${document.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the diagram.");
      setCreating(false);
    }
  };

  return <section className="mx-auto min-h-[calc(100vh-57px)] max-w-5xl px-5 py-6" data-testid="new-diagram-screen">
    <Link href="/admin/diagrams" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Diagram library</Link>
    <div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Create</p><h1 className="mt-1 text-2xl font-semibold">New diagram</h1><p className="mt-1 text-sm text-muted">Choose a focused starting point. You can enable more packs later.</p></div>
    <label className="mt-6 block max-w-md text-xs font-medium text-muted">Diagram title<input aria-label="Diagram title" value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-accent" /></label>
    {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{DIAGRAM_TEMPLATES.map((starter) => { const Icon = CATEGORY_ICONS[starter.category]; return <button key={starter.id} type="button" disabled={creating} onClick={() => void create(starter)} className="group flex min-h-28 items-start gap-3 rounded-lg border border-border bg-surface p-4 text-left transition hover:border-accent hover:bg-surface-elevated disabled:opacity-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent group-hover:border-accent/50"><Icon className="h-4.5 w-4.5" /></span><span><span className="block text-[9px] font-semibold uppercase tracking-wider text-accent">{starter.category}</span><span className="mt-0.5 block text-sm font-semibold">{starter.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted">{starter.description}</span></span></button>; })}</div>
  </section>;
}
