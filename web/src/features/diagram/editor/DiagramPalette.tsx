"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { DiagramRegistry } from "../core/registry";
import type { DiagramShapeDefinition } from "../core/types";
import { DIAGRAM_SHAPE_MIME } from "../canvas";
import { DiagramShapePreview } from "./DiagramShapePreview";

interface Props {
  registry: DiagramRegistry;
  enabledPackIds: readonly string[];
  recentShapeIds: readonly string[];
  onAdd: (shapeDefinitionId: string) => void;
}

export function DiagramPalette({ registry, enabledPackIds, recentShapeIds, onAdd }: Props) {
  const packs = registry.listPacks(enabledPackIds);
  const [activePackId, setActivePackId] = useState(packs[0]?.id ?? "generic");
  const [query, setQuery] = useState("");
  const activePack = registry.getPack(activePackId) ?? packs[0];
  const normalized = query.trim().toLowerCase();
  const shapes = useMemo(() => registry.listShapes(enabledPackIds).filter((shape) => !normalized || `${shape.label} ${shape.keywords.join(" ")}`.toLowerCase().includes(normalized)), [enabledPackIds, normalized, registry]);
  const displayed = normalized ? shapes : shapes.filter((shape) => shape.packId === activePack?.id);
  const recent = recentShapeIds.map((id) => registry.getShape(id)).filter((shape): shape is DiagramShapeDefinition => Boolean(shape));
  const categories = activePack ? [...activePack.categories].sort((a, b) => a.order - b.order) : [];
  const item = (shape: DiagramShapeDefinition) => <button key={shape.id} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData(DIAGRAM_SHAPE_MIME, shape.id); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => onAdd(shape.id)} title={`${shape.label} — ${shape.keywords.join(", ")}`} className="group flex min-h-12 items-center gap-2 rounded-md border border-transparent bg-surface-elevated/45 px-2 py-1.5 text-left text-[10px] leading-tight text-muted transition hover:border-accent/70 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><DiagramShapePreview shape={shape} /><span className="min-w-0 break-normal">{shape.label}</span></button>;

  return <aside className="flex h-full min-h-0 w-[244px] shrink-0 flex-col border-r border-border bg-surface/80" aria-label="Diagram palette">
    <div className="border-b border-border p-2.5">
      <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs transition focus-within:border-accent"><Search className="h-3.5 w-3.5 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Search shapes" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-600" aria-label="Search shapes" />{query ? <button type="button" onClick={() => setQuery("")} className="rounded p-0.5 text-muted hover:bg-surface-elevated hover:text-foreground" aria-label="Clear shape search"><X className="h-3.5 w-3.5" /></button> : null}</label>
      <div className="mt-2 grid grid-cols-3 gap-1" role="tablist" aria-label="Shape packs">{packs.map((pack) => <button key={pack.id} type="button" role="tab" title={pack.label} aria-label={pack.label} aria-selected={activePack?.id === pack.id} onClick={() => { setActivePackId(pack.id); setQuery(""); }} className={`truncate rounded px-1.5 py-1.5 text-[10px] font-medium transition ${activePack?.id === pack.id ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}>{pack.id === "system-design" ? "System" : pack.label}</button>)}</div>
      {activePack ? <p className="mt-2 line-clamp-2 text-[9px] leading-relaxed text-muted">{activePack.description}</p> : null}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
      {!normalized && recent.length ? <section className="mb-3"><h3 className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400"><span>Recent</span><span className="h-px flex-1 bg-border/70" /></h3><div className="grid grid-cols-2 gap-1.5">{recent.slice(0, 4).map(item)}</div></section> : null}
      {normalized && !displayed.length ? <div className="px-3 py-12 text-center"><Search className="mx-auto h-5 w-5 text-zinc-600" /><p className="mt-2 text-xs font-medium text-zinc-300">No matching shapes</p><p className="mt-1 text-[10px] leading-relaxed text-muted">Try a component, technology, or category name.</p></div> : null}
      {normalized ? displayed.length ? <section><h3 className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400"><span>Results</span><span className="rounded bg-surface-elevated px-1.5 py-0.5 tabular-nums">{displayed.length}</span><span className="h-px flex-1 bg-border/70" /></h3><div className="grid grid-cols-2 gap-1.5">{displayed.map(item)}</div></section> : null : categories.map((category) => { const categoryShapes = displayed.filter((shape) => shape.category === category.id); return categoryShapes.length ? <section key={category.id} className="mb-3"><h3 className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400"><span>{category.label}</span><span className="ml-auto tabular-nums text-zinc-600">{categoryShapes.length}</span></h3><div className="grid grid-cols-2 gap-1.5">{categoryShapes.map(item)}</div></section> : null; })}
    </div>
  </aside>;
}
