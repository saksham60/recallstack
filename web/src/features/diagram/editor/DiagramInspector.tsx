"use client";

import { MousePointer2 } from "lucide-react";
import { SystemDesignTechnologyIcon } from "@/features/system-design/components/SystemDesignTechnologyIcon";
import type { DiagramRegistry } from "../core/registry";
import { COMMON_DIAGRAM_INSPECTOR_FIELDS, GENERIC_CONNECTOR_INSPECTOR_FIELDS } from "../core/registry";
import type { DiagramElement, DiagramInspectorFieldDefinition, DiagramJsonValue } from "../core/types";
import type { DiagramElementPatch } from "../core/state";

interface Props { element?: DiagramElement; registry: DiagramRegistry; onPatch: (patch: DiagramElementPatch) => void; onCreateChildPage?: () => void; onOpenChildPage?: (pageId: string) => void }

function valueAt(element: DiagramElement, path: string): unknown {
  if (path === "connectorLabel" && element.kind === "connector") return element.labels[0]?.text ?? "";
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, element);
}

function patchAt(element: DiagramElement, path: string, value: unknown): DiagramElementPatch {
  if (path === "connectorLabel" && element.kind === "connector") {
    return { labels: value ? [{ ...(element.labels[0] ?? { id: `${element.id}_label`, position: 0.5 }), text: String(value) }] : [] };
  }
  const [root, child] = path.split(".");
  if (!child) return { [root]: value } as DiagramElementPatch;
  if (root === "style" && element.kind !== "connector") return { style: { ...element.style, [child]: value } };
  if (root === "style" && element.kind === "connector") return { connectorStyle: { ...element.style, [child]: value } };
  if (root === "textStyle" && element.kind !== "connector" && "textStyle" in element) return { textStyle: { ...element.textStyle, [child]: value } };
  if (root === "data") return { data: { ...element.data, ...(child === "technologyId" ? { technology: null } : {}), [child]: value as DiagramJsonValue } };
  return {};
}

function Field({ field, element, onPatch }: { field: DiagramInspectorFieldDefinition; element: DiagramElement; onPatch: (patch: DiagramElementPatch) => void }) {
  const value = valueAt(element, field.path);
  const inputClass = "h-7 w-full rounded border border-border bg-background px-2 text-[11px] text-foreground outline-none transition hover:border-zinc-500 focus:border-accent";
  if (field.control === "toggle") return <label className="flex min-h-7 items-center justify-between gap-3 text-[11px] text-muted"><span>{field.label}</span><input className="h-3.5 w-3.5 accent-[var(--accent)]" type="checkbox" checked={Boolean(value)} onChange={(event) => onPatch(patchAt(element, field.path, event.target.checked))} /></label>;
  if (field.control === "select" || field.control === "font-weight" || field.control === "alignment" || field.control === "stroke-style") return <label className="grid gap-1 text-[10px] text-muted"><span>{field.label}</span>{field.id === "technology" && value ? <SystemDesignTechnologyIcon technology={value} showName className="mb-0.5 rounded border border-border bg-background px-1.5 py-1 text-foreground" /> : null}<select className={inputClass} value={String(value ?? "")} onChange={(event) => onPatch(patchAt(element, field.path, event.target.value))}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (field.control === "color") return <label className="grid gap-1 text-[10px] text-muted"><span>{field.label}</span><span className="flex gap-1.5"><input type="color" value={typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#a78bfa"} onChange={(event) => onPatch(patchAt(element, field.path, event.target.value))} className="h-7 w-8 rounded border border-border bg-background p-0.5" /><input className={inputClass} value={String(value ?? "")} onChange={(event) => onPatch(patchAt(element, field.path, event.target.value))} /></span></label>;
  const numeric = ["number", "slider", "stroke-width", "font-size", "opacity"].includes(field.control);
  return <label className="grid gap-1 text-[10px] text-muted"><span>{field.label}</span><input className={inputClass} type={numeric ? "number" : "text"} min={field.min} max={field.max} step={field.step} value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={(event) => onPatch(patchAt(element, field.path, numeric ? Number(event.target.value) : event.target.value))} /></label>;
}

export function DiagramInspector({ element, registry, onPatch, onCreateChildPage, onOpenChildPage }: Props) {
  if (!element) return <aside className="w-[264px] shrink-0 border-l border-border bg-surface/80 p-4 text-xs text-muted"><h2 className="text-sm font-semibold text-foreground">Properties</h2><div className="mt-14 text-center"><MousePointer2 className="mx-auto h-6 w-6 text-zinc-600" /><p className="mt-3 text-[11px] font-medium text-zinc-300">Nothing selected</p><p className="mt-1.5 text-[10px] leading-relaxed text-muted">Click an element, or drag on empty canvas for a multi-selection.</p></div><div className="mt-8 rounded-md border border-border/70 bg-background/60 p-2.5 text-[10px] leading-relaxed"><p><kbd className="text-zinc-300">Shift</kbd> + click to add</p><p className="mt-1"><kbd className="text-zinc-300">Ctrl/Cmd G</kbd> to group</p><p className="mt-1"><kbd className="text-zinc-300">Delete</kbd> to remove</p></div></aside>;
  const definition = element.kind === "shape" ? registry.getShape(element.shapeDefinitionId) : undefined;
  const fields = definition?.inspector ?? (element.kind === "connector" ? GENERIC_CONNECTOR_INSPECTOR_FIELDS : element.kind === "image" ? COMMON_DIAGRAM_INSPECTOR_FIELDS.filter((field) => !["label", "fontSize", "fontWeight", "align", "textColor"].includes(field.id)) : COMMON_DIAGRAM_INSPECTOR_FIELDS);
  const sections = [...new Set(fields.map((field) => field.section))];
  return <aside className="h-full w-[264px] shrink-0 overflow-y-auto border-l border-border bg-surface/80" aria-label="Properties inspector">
    <div className="sticky top-0 z-10 border-b border-border bg-surface/95 p-3 backdrop-blur"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">{definition?.packId ?? element.kind}</p><h2 className="mt-0.5 text-sm font-semibold">{definition?.label ?? element.kind}</h2><p className="mt-0.5 truncate font-mono text-[9px] text-zinc-500">{element.id}</p></div>
    <div className="space-y-4 p-3">{sections.map((section) => <section key={section}><h3 className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400"><span>{section}</span><span className="h-px flex-1 bg-border/70" /></h3><div className={section === "geometry" ? "grid grid-cols-2 gap-2" : "space-y-2.5"}>{fields.filter((field) => field.section === section).filter((field) => field.id !== "rotation" || definition?.rotatable !== false).map((field) => <Field key={field.id} field={field} element={element} onPatch={onPatch} />)}</div></section>)}
      {element.kind === "shape" || element.kind === "frame" ? <section><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Nested diagram</h3>{element.childPageId ? <button type="button" onClick={() => onOpenChildPage?.(element.childPageId!)} className="w-full rounded border border-accent px-3 py-2 text-xs text-accent hover:bg-accent/10">Open child page</button> : <button type="button" onClick={onCreateChildPage} className="w-full rounded border border-border px-3 py-2 text-xs hover:border-accent">Create child page</button>}</section> : null}
    </div>
  </aside>;
}
