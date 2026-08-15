"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import type { DiagramRegistry } from "../core/registry";
import type { DiagramElement } from "../core/types";
import type { DiagramElementPatch } from "../core/state";
import { DiagramIcon } from "./DiagramIcon";

interface Props {
  elements: readonly DiagramElement[];
  selectedElementIds: readonly string[];
  registry: DiagramRegistry;
  onSelect: (elementId: string, additive: boolean) => void;
  onPatch: (elementId: string, patch: DiagramElementPatch) => void;
  onSetOrder: (idsBottomToTop: readonly string[]) => void;
}

function elementName(element: DiagramElement, registry: DiagramRegistry): string {
  if (element.kind === "shape") return element.label || registry.getShape(element.shapeDefinitionId)?.label || "Shape";
  if (element.kind === "connector") return element.labels[0]?.text || "Connector";
  if (element.kind === "text") return element.text || "Text";
  if (element.kind === "image") return element.label || element.asset.name || "Image";
  if (element.kind === "frame") return element.label || "Frame";
  return element.label || "Group";
}

function iconName(element: DiagramElement, registry: DiagramRegistry): string {
  if (element.kind === "shape") return registry.getShape(element.shapeDefinitionId)?.icon ?? "shapes";
  if (element.kind === "connector") return "workflow";
  if (element.kind === "text") return "type";
  if (element.kind === "image") return "image";
  if (element.kind === "frame") return "frame";
  return "group";
}

export function DiagramLayersPanel({ elements, selectedElementIds, registry, onSelect, onPatch, onSetOrder }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState("");
  const [draggedId, setDraggedId] = useState<string>();
  const selected = useMemo(() => new Set(selectedElementIds), [selectedElementIds]);
  const byId = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
  const ordered = useMemo(() => [...elements].sort((left, right) => right.layer - left.layer), [elements]);
  const roots = ordered.filter((element) => !element.parentGroupId);

  const commitName = (element: DiagramElement) => {
    const value = draft.trim();
    if (value) onPatch(element.id, element.kind === "text" ? { text: value } : { label: value });
    setEditingId(undefined);
  };

  const row = (element: DiagramElement, nested = false) => {
    const children = element.kind === "group" ? element.childElementIds.map((id) => byId.get(id)).filter((item): item is DiagramElement => Boolean(item)) : [];
    const isCollapsed = collapsed.has(element.id);
    return <div key={element.id}>
      <div
        draggable={!nested}
        onDragStart={() => setDraggedId(element.id)}
        onDragOver={(event) => { if (!nested) event.preventDefault(); }}
        onDrop={() => {
          if (!draggedId || draggedId === element.id || nested) return;
          const topToBottom = ordered.map((item) => item.id);
          const from = topToBottom.indexOf(draggedId);
          const to = topToBottom.indexOf(element.id);
          if (from < 0 || to < 0) return;
          const [moved] = topToBottom.splice(from, 1);
          topToBottom.splice(to, 0, moved);
          onSetOrder([...topToBottom].reverse());
          setDraggedId(undefined);
        }}
        className={`group flex h-8 items-center gap-1 border-l-2 px-1.5 text-[10px] transition ${nested ? "ml-4" : ""} ${selected.has(element.id) ? "border-accent bg-accent/10 text-foreground" : "border-transparent text-muted hover:bg-surface-elevated hover:text-foreground"}`}
      >
        {children.length ? <button type="button" aria-label={isCollapsed ? "Expand group" : "Collapse group"} className="rounded p-0.5 hover:bg-background" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(element.id)) next.delete(element.id); else next.add(element.id); return next; })}>{isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button> : <span className="w-4" />}
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={(event) => onSelect(element.id, event.shiftKey || event.ctrlKey || event.metaKey)} onDoubleClick={() => { setEditingId(element.id); setDraft(elementName(element, registry)); }}>
          <DiagramIcon name={iconName(element, registry)} className="h-3.5 w-3.5 shrink-0" />
          {editingId === element.id ? <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => commitName(element)} onKeyDown={(event) => { if (event.key === "Enter") commitName(element); if (event.key === "Escape") setEditingId(undefined); }} onClick={(event) => event.stopPropagation()} className="h-6 min-w-0 flex-1 rounded border border-accent bg-background px-1 outline-none" /> : <span className="truncate">{elementName(element, registry)}</span>}
        </button>
        <button type="button" aria-label={element.visible ? "Hide element" : "Show element"} title={element.visible ? "Hide" : "Show"} className="rounded p-1 opacity-60 hover:bg-background group-hover:opacity-100" onClick={() => onPatch(element.id, { visible: !element.visible })}>{element.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button>
        <button type="button" aria-label={element.locked ? "Unlock element" : "Lock element"} title={element.locked ? "Unlock" : "Lock"} className="rounded p-1 opacity-60 hover:bg-background group-hover:opacity-100" onClick={() => onPatch(element.id, { locked: !element.locked })}>{element.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}</button>
      </div>
      {children.length && !isCollapsed ? children.map((child) => row(child, true)) : null}
    </div>;
  };

  return <div className="h-full overflow-y-auto bg-surface/80" aria-label="Layers panel">
    <div className="border-b border-border px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">Current page</p><p className="mt-0.5 text-xs font-semibold">{elements.length} layers</p></div>
    {roots.length ? <div className="py-1">{roots.map((element) => row(element))}</div> : <div className="px-4 py-16 text-center text-[10px] leading-relaxed text-muted">Add elements to see and organize their layer order.</div>}
    <p className="border-t border-border px-3 py-2 text-[9px] leading-relaxed text-zinc-500">Top rows render above lower rows. Drag a row to reorder.</p>
  </div>;
}
