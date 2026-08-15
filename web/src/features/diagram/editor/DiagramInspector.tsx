"use client";

import { createElement } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Eye,
  Lock,
  MousePointer2,
} from "lucide-react";
import type { DiagramRegistry } from "../core/registry";
import {
  COMMON_DIAGRAM_INSPECTOR_FIELDS,
  GENERIC_CONNECTOR_INSPECTOR_FIELDS,
  TEXT_DIAGRAM_INSPECTOR_FIELDS,
} from "../core/registry";
import type {
  DiagramElement,
  DiagramInspectorFieldDefinition,
  DiagramJsonValue,
} from "../core/types";
import type { DiagramElementPatch } from "../core/state";
import type { DiagramArrangeCommand } from "../core/geometry";
import { DiagramIcon } from "./DiagramIcon";

interface Props {
  elements: readonly DiagramElement[];
  registry: DiagramRegistry;
  onPatch: (elementId: string, patch: DiagramElementPatch) => void;
  onPatchMany: (patches: Readonly<Record<string, DiagramElementPatch>>) => void;
  onArrange: (command: DiagramArrangeCommand) => void;
  onCreateChildPage?: () => void;
  onOpenChildPage?: (pageId: string) => void;
}

const MIXED = Symbol("mixed");
type InspectorValue = unknown | typeof MIXED;

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

function valuesEqual(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

function commonValue(elements: readonly DiagramElement[], path: string): InspectorValue {
  const first = valueAt(elements[0], path);
  return elements.every((element) => valuesEqual(first, valueAt(element, path))) ? first : MIXED;
}

const inputClass = "h-7 w-full rounded border border-border bg-background px-2 text-[11px] text-foreground outline-none transition hover:border-zinc-500 focus:border-accent focus-visible:ring-1 focus-visible:ring-accent";
const buttonClass = "h-7 rounded border border-border bg-background px-2 text-[10px] text-muted transition hover:border-zinc-500 hover:text-foreground data-[active=true]:border-accent data-[active=true]:bg-accent/10 data-[active=true]:text-accent";

function BuiltInField({ field, value, onChange }: { field: DiagramInspectorFieldDefinition; value: InspectorValue; onChange: (value: unknown) => void }) {
  const mixed = value === MIXED;
  const display = mixed ? "" : value;
  const label = <span className="text-[10px] text-muted">{field.label}</span>;

  if (field.control === "toggle") {
    return (
      <label className="flex min-h-7 items-center justify-between gap-3 text-[11px] text-muted">
        <span>{field.label}</span>
        <input
          className="h-3.5 w-3.5 accent-[var(--accent)]"
          type="checkbox"
          checked={!mixed && Boolean(value)}
          aria-checked={mixed ? "mixed" : Boolean(value)}
          ref={(input) => { if (input) input.indeterminate = mixed; }}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  if (field.control === "textarea") {
    return <label className="grid gap-1">{label}<textarea rows={3} className="min-h-16 w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-[11px] leading-relaxed text-foreground outline-none hover:border-zinc-500 focus:border-accent" placeholder={mixed ? "Mixed" : field.placeholder} value={String(display ?? "")} onChange={(event) => onChange(event.target.value)} /></label>;
  }

  if (field.control === "slider" || field.control === "opacity") {
    const fallback = field.control === "opacity" ? 1 : field.min ?? 0;
    const number = typeof display === "number" ? display : fallback;
    return <label className="grid gap-1">{label}<span className="flex items-center gap-2"><input aria-label={field.label} className="h-1.5 min-w-0 flex-1 accent-[var(--accent)]" type="range" min={field.min} max={field.max} step={field.step} value={number} onChange={(event) => onChange(Number(event.target.value))} /><input aria-label={`${field.label} value`} className="h-7 w-14 rounded border border-border bg-background px-1 text-right text-[10px] outline-none focus:border-accent" type="number" min={field.min} max={field.max} step={field.step} placeholder={mixed ? "Mixed" : undefined} value={mixed ? "" : number} onChange={(event) => onChange(Number(event.target.value))} /></span></label>;
  }

  if (field.control === "stroke-style") {
    return <div className="grid gap-1">{label}<div className="grid grid-cols-3 gap-1">{field.options?.map((option) => <button key={option.value} type="button" title={option.label} data-active={!mixed && display === option.value} className={buttonClass} onClick={() => onChange(option.value)}><span className={`mx-auto block w-7 border-t border-zinc-300 ${option.value === "dashed" ? "border-dashed" : option.value === "dotted" ? "border-dotted" : ""}`} /></button>)}</div></div>;
  }

  if (field.control === "alignment") {
    const icons = { left: AlignLeft, center: AlignCenter, right: AlignRight };
    return <div className="grid gap-1">{label}<div className="grid grid-cols-3 gap-1">{field.options?.map((option) => { const Icon = icons[option.value as keyof typeof icons] ?? AlignLeft; return <button key={option.value} type="button" aria-label={`${field.label}: ${option.label}`} data-active={!mixed && display === option.value} className={buttonClass} onClick={() => onChange(option.value)}><Icon className="mx-auto h-3.5 w-3.5" /></button>; })}</div></div>;
  }

  if (field.control === "font-weight") {
    return <div className="grid gap-1">{label}<div className="grid grid-cols-4 gap-1">{field.options?.map((option) => <button key={option.value} type="button" title={option.label} data-active={!mixed && display === option.value} className={`${buttonClass} px-1 font-${option.value}`} onClick={() => onChange(option.value)}>{option.label.slice(0, 1)}</button>)}</div></div>;
  }

  if (field.control === "icon") {
    return <div className="grid gap-1">{label}<div className="grid grid-cols-5 gap-1">{field.options?.map((option) => <button key={option.value} type="button" title={option.label} aria-label={option.label} data-active={!mixed && display === option.value} className={`${buttonClass} px-0`} onClick={() => onChange(option.value)}><DiagramIcon name={option.value} className="mx-auto h-3.5 w-3.5" /></button>)}</div></div>;
  }

  if (field.control === "select") {
    return <label className="grid gap-1">{label}<select className={inputClass} value={mixed ? "__mixed__" : String(display ?? "")} onChange={(event) => onChange(event.target.value)}>{mixed ? <option value="__mixed__" disabled>Mixed</option> : null}{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }

  if (field.control === "color") {
    const color = typeof display === "string" && /^#[0-9a-f]{6}$/i.test(display) ? display : "#a78bfa";
    return <label className="grid gap-1">{label}<span className="flex gap-1.5"><input aria-label={`${field.label} picker`} type="color" value={color} onChange={(event) => onChange(event.target.value)} className="h-7 w-8 rounded border border-border bg-background p-0.5" /><input className={inputClass} placeholder={mixed ? "Mixed" : undefined} value={String(display ?? "")} onChange={(event) => onChange(event.target.value)} /></span></label>;
  }

  const numeric = ["number", "stroke-width", "font-size"].includes(field.control);
  return <label className="grid gap-1">{label}<input className={inputClass} type={numeric ? "number" : "text"} min={field.min} max={field.max} step={field.step} placeholder={mixed ? "Mixed" : field.placeholder} value={typeof display === "number" || typeof display === "string" ? display : ""} onChange={(event) => onChange(numeric ? Number(event.target.value) : event.target.value)} /></label>;
}

function Field({ field, element, registry, value, onChange }: { field: DiagramInspectorFieldDefinition; element: DiagramElement; registry: DiagramRegistry; value: InspectorValue; onChange: (value: unknown) => void }) {
  const CustomControl = registry.getInspectorControl(field.control);
  if (CustomControl) return createElement(CustomControl, { field, element, value: value === MIXED ? undefined : value, onChange });
  if (field.control.includes(".")) return <p className="rounded border border-red-900/60 bg-red-950/40 p-2 text-[10px] text-red-300">Missing control: {field.control}</p>;
  return <BuiltInField field={field} value={value} onChange={onChange} />;
}

function fieldsFor(element: DiagramElement, registry: DiagramRegistry): readonly DiagramInspectorFieldDefinition[] {
  if (element.kind === "shape") return registry.getShape(element.shapeDefinitionId)?.inspector ?? COMMON_DIAGRAM_INSPECTOR_FIELDS;
  if (element.kind === "connector") return GENERIC_CONNECTOR_INSPECTOR_FIELDS;
  if (element.kind === "text") return TEXT_DIAGRAM_INSPECTOR_FIELDS;
  if (element.kind === "image") return COMMON_DIAGRAM_INSPECTOR_FIELDS.filter((field) => !["label", "fontSize", "fontWeight", "align", "textColor"].includes(field.id));
  return COMMON_DIAGRAM_INSPECTOR_FIELDS;
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400"><span>{children}</span><span className="h-px flex-1 bg-border/70" /></h3>;
}

export function DiagramInspector({ elements, registry, onPatch, onPatchMany, onArrange, onCreateChildPage, onOpenChildPage }: Props) {
  if (!elements.length) return <aside className="w-[248px] shrink-0 border-l border-border bg-surface/80 p-3 text-xs text-muted" aria-label="Properties inspector"><h2 className="text-sm font-semibold text-foreground">Properties</h2><div className="mt-14 text-center"><MousePointer2 className="mx-auto h-6 w-6 text-zinc-600" /><p className="mt-3 text-[11px] font-medium text-zinc-300">Nothing selected</p><p className="mt-1.5 text-[10px] leading-relaxed text-muted">Click an element, or drag on empty canvas for a multi-selection.</p></div><div className="mt-8 rounded-md border border-border/70 bg-background/60 p-2.5 text-[10px] leading-relaxed"><p><kbd className="text-zinc-300">Shift</kbd> + click to add</p><p className="mt-1"><kbd className="text-zinc-300">Ctrl/Cmd G</kbd> to group</p><p className="mt-1"><kbd className="text-zinc-300">Delete</kbd> to remove</p></div></aside>;

  const element = elements[0];
  const definition = element.kind === "shape" ? registry.getShape(element.shapeDefinitionId) : undefined;

  if (elements.length > 1) {
    const styleFields = COMMON_DIAGRAM_INSPECTOR_FIELDS.filter((field) => ["fill", "stroke", "strokeWidth", "opacity", "width", "height", "locked", "visible"].includes(field.id));
    const fields = styleFields.filter((field) => elements.every((item) => field.path in item || field.path.startsWith("style.") || (["width", "height"].includes(field.path) && item.kind !== "connector")));
    return <aside className="h-full w-[248px] shrink-0 overflow-y-auto border-l border-border bg-surface/80" aria-label="Multi-selection properties">
      <div className="sticky top-0 z-10 border-b border-border bg-surface/95 p-3 backdrop-blur"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">Selection</p><h2 className="mt-0.5 text-sm font-semibold">{elements.length} elements</h2></div>
      <div className="space-y-4 p-3"><section><SectionTitle>Arrange</SectionTitle><div className="grid grid-cols-3 gap-1">{(["align-left", "align-center", "align-right", "align-top", "align-middle", "align-bottom"] as const).map((command) => <button key={command} type="button" className={buttonClass} onClick={() => onArrange(command)}>{command.replace("align-", "")}</button>)}</div><div className="mt-1 grid grid-cols-2 gap-1"><button type="button" className={buttonClass} onClick={() => onArrange("distribute-horizontal")}>Distribute H</button><button type="button" className={buttonClass} onClick={() => onArrange("distribute-vertical")}>Distribute V</button></div></section>
        <section><SectionTitle>Common</SectionTitle><div className="space-y-2.5">{fields.map((field) => <Field key={field.id} field={field} element={element} registry={registry} value={commonValue(elements, field.path)} onChange={(value) => onPatchMany(Object.fromEntries(elements.map((item) => [item.id, patchAt(item, field.path, value)])))} />)}</div></section>
        <section><SectionTitle>State</SectionTitle><div className="grid grid-cols-2 gap-1"><button type="button" className={buttonClass} onClick={() => onPatchMany(Object.fromEntries(elements.map((item) => [item.id, { locked: !item.locked }]))) }><Lock className="mr-1 inline h-3 w-3" />Lock</button><button type="button" className={buttonClass} onClick={() => onPatchMany(Object.fromEntries(elements.map((item) => [item.id, { visible: !item.visible }]))) }><Eye className="mr-1 inline h-3 w-3" />Visible</button></div></section>
      </div>
    </aside>;
  }

  const fields = fieldsFor(element, registry);
  const sections = [...new Set(fields.map((field) => field.section))];
  return <aside className="h-full w-[248px] shrink-0 overflow-y-auto border-l border-border bg-surface/80" aria-label="Properties inspector">
    <div className="sticky top-0 z-10 border-b border-border bg-surface/95 p-3 backdrop-blur"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">{definition?.packId ?? element.kind}</p><h2 className="mt-0.5 text-sm font-semibold">{definition?.label ?? element.kind}</h2><p className="mt-0.5 truncate font-mono text-[9px] text-zinc-500">{element.id}</p></div>
    <div className="space-y-4 p-3">{sections.map((section) => <section key={section}><SectionTitle>{section}</SectionTitle><div className={section === "geometry" ? "grid grid-cols-2 gap-2" : "space-y-2.5"}>{fields.filter((field) => field.section === section).filter((field) => field.id !== "rotation" || definition?.rotatable !== false).map((field) => <Field key={field.id} field={field} element={element} registry={registry} value={valueAt(element, field.path)} onChange={(value) => onPatch(element.id, patchAt(element, field.path, value))} />)}</div></section>)}
      {element.kind === "shape" || element.kind === "frame" ? <section><SectionTitle>Nested diagram</SectionTitle>{element.childPageId ? <button type="button" onClick={() => onOpenChildPage?.(element.childPageId!)} className="w-full rounded border border-accent px-3 py-2 text-xs text-accent hover:bg-accent/10">Open child page</button> : <button type="button" onClick={onCreateChildPage} className="w-full rounded border border-border px-3 py-2 text-xs hover:border-accent">Create child page</button>}</section> : null}
    </div>
  </aside>;
}
