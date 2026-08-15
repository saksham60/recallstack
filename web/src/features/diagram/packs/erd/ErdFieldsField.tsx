"use client";

import { Plus, Trash2 } from "lucide-react";
import type { DiagramInspectorControlRendererProps, DiagramJsonValue } from "../../core/types";

export type ErdKeyKind = "" | "PK" | "FK";
export interface ErdField { key: ErdKeyKind; name: string; dataType: string }

export function parseErdFields(value: unknown): ErdField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || Array.isArray(item) || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.dataType !== "string") return [];
    return [{ key: row.key === "PK" || row.key === "FK" ? row.key : "", name: row.name, dataType: row.dataType }];
  });
}

export function ErdFieldsField({ value, onChange }: DiagramInspectorControlRendererProps) {
  const fields = parseErdFields(value);
  const update = (next: ErdField[]) => onChange(next as unknown as DiagramJsonValue);
  return <div className="grid gap-1.5 text-[10px] text-muted">
    <div className="flex items-center justify-between"><span>Fields</span><button type="button" aria-label="Add entity field" onClick={() => update([...fields, { key: "", name: "field", dataType: "TEXT" }])} className="flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[9px] hover:border-accent hover:text-foreground"><Plus className="h-3 w-3" />Add</button></div>
    <div className="space-y-1">{fields.map((field, index) => <div key={`${field.name}-${index}`} className="grid grid-cols-[38px_minmax(0,1fr)_64px_24px] gap-1">
      <select aria-label={`Key type for ${field.name}`} value={field.key} onChange={(event) => update(fields.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value as ErdKeyKind } : item))} className="h-7 rounded border border-border bg-background px-0.5 text-[9px]"><option value="">—</option><option value="PK">PK</option><option value="FK">FK</option></select>
      <input aria-label={`Field ${index + 1} name`} value={field.name} onChange={(event) => update(fields.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="h-7 min-w-0 rounded border border-border bg-background px-1.5 outline-none focus:border-accent" />
      <input aria-label={`Field ${index + 1} type`} value={field.dataType} onChange={(event) => update(fields.map((item, itemIndex) => itemIndex === index ? { ...item, dataType: event.target.value } : item))} className="h-7 min-w-0 rounded border border-border bg-background px-1.5 font-mono text-[9px] outline-none focus:border-accent" />
      <button type="button" aria-label={`Remove field ${field.name}`} onClick={() => update(fields.filter((_, itemIndex) => itemIndex !== index))} className="flex h-7 items-center justify-center rounded text-muted hover:bg-red-950/40 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
    </div>)}</div>
    {!fields.length ? <p className="rounded border border-dashed border-border p-2 text-center text-zinc-500">No fields yet</p> : null}
  </div>;
}
