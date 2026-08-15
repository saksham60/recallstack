"use client";

import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import type { DiagramDocument } from "../core/types";

interface Props {
  document: DiagramDocument;
  activePageId: string;
  onActivate: (pageId: string) => void;
  onAdd: () => void;
  onRename: (pageId: string, name: string) => void;
  onDuplicate: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  onReorder: (pageId: string, toIndex: number) => void;
}

export function DiagramPageBar({ document, activePageId, onActivate, onAdd, onRename, onDuplicate, onDelete, onReorder }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  return <nav aria-label="Diagram pages" className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-surface px-2">
    {document.pageOrder.map((pageId, index) => {
      const page = document.pages[pageId];
      if (!page) return null;
      const active = pageId === activePageId;
      return <div key={pageId} draggable={pageId !== document.rootPageId && editingId !== pageId} onDragStart={() => setDraggingId(pageId)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingId) onReorder(draggingId, index); setDraggingId(null); }} className={`group flex h-7 shrink-0 items-center rounded border transition ${active ? "border-accent/60 bg-accent/12 text-foreground" : "border-transparent text-muted hover:bg-surface-elevated hover:text-foreground"}`}>
        {editingId === pageId ? <input autoFocus aria-label={`Rename page ${page.name}`} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => setEditingId(null)} onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); if (event.key === "Enter" && value.trim()) { onRename(pageId, value); setEditingId(null); } }} className="h-6 w-28 rounded border border-accent bg-background px-1.5 text-[11px] outline-none" /> : <button type="button" onClick={() => onActivate(pageId)} onDoubleClick={() => { setEditingId(pageId); setValue(page.name); }} className="h-7 max-w-36 truncate px-2 text-[11px] font-medium" aria-current={active ? "page" : undefined}>{page.name}</button>}
        {active && editingId !== pageId ? <span className="mr-0.5 hidden items-center group-hover:flex"><button type="button" aria-label={`Duplicate page ${page.name}`} title="Duplicate page" onClick={() => onDuplicate(pageId)} className="flex h-5 w-5 items-center justify-center rounded hover:bg-surface-elevated"><Copy className="h-3 w-3" /></button>{pageId !== document.rootPageId ? <button type="button" aria-label={`Delete page ${page.name}`} title="Delete page" onClick={() => onDelete(pageId)} className="flex h-5 w-5 items-center justify-center rounded hover:bg-danger/10 hover:text-danger"><Trash2 className="h-3 w-3" /></button> : null}</span> : null}
      </div>;
    })}
    <button type="button" aria-label="Add page" title="Add page" onClick={onAdd} className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent text-muted hover:border-border hover:bg-surface-elevated hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
  </nav>;
}
