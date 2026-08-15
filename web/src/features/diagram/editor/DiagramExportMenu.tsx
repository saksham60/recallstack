"use client";

import { useEffect, useRef, useState } from "react";
import { FileCode2, FileImage, FileText, Image as ImageIcon } from "lucide-react";

export type DiagramExportFormat = "png" | "svg" | "pdf" | "json" | "drawio";
export interface DiagramExportPreferences { transparent: boolean; scale: 1 | 2; selectionOnly: boolean }

interface Props {
  hasSelection: boolean;
  onExport: (format: DiagramExportFormat, preferences: DiagramExportPreferences) => void;
  onClose: () => void;
}

export function DiagramExportMenu({ hasSelection, onExport, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [transparent, setTransparent] = useState(false);
  const [scale, setScale] = useState<1 | 2>(2);
  const [selectionOnly, setSelectionOnly] = useState(false);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", outside); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [onClose]);
  const run = (format: DiagramExportFormat) => { onExport(format, { transparent, scale, selectionOnly }); onClose(); };
  return <div ref={ref} className="absolute right-0 top-9 z-40 w-56 rounded-lg border border-border bg-surface p-2 shadow-2xl" role="menu" aria-label="Export diagram">
    <p className="px-1 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Export current page</p>
    <div className="grid grid-cols-2 gap-1">
      <button type="button" role="menuitem" onClick={() => run("png")} className="flex h-8 items-center gap-1.5 rounded border border-border px-2 text-[10px] hover:border-accent hover:bg-accent/10"><ImageIcon className="h-3.5 w-3.5 text-accent" />PNG</button>
      <button type="button" role="menuitem" onClick={() => run("svg")} className="flex h-8 items-center gap-1.5 rounded border border-border px-2 text-[10px] hover:border-accent hover:bg-accent/10"><FileCode2 className="h-3.5 w-3.5 text-accent" />SVG</button>
      <button type="button" role="menuitem" onClick={() => run("pdf")} className="flex h-8 items-center gap-1.5 rounded border border-border px-2 text-[10px] hover:border-accent hover:bg-accent/10"><FileText className="h-3.5 w-3.5 text-accent" />PDF</button>
      <button type="button" role="menuitem" onClick={() => run("json")} className="flex h-8 items-center gap-1.5 rounded border border-border px-2 text-[10px] hover:border-accent hover:bg-accent/10"><FileImage className="h-3.5 w-3.5 text-accent" />JSON</button>
      <button type="button" role="menuitem" onClick={() => run("drawio")} className="col-span-2 flex h-8 items-center justify-center gap-1.5 rounded border border-border px-2 text-[10px] hover:border-accent hover:bg-accent/10"><FileCode2 className="h-3.5 w-3.5 text-accent" />diagrams.net subset</button>
    </div>
    <div className="mt-2 space-y-1.5 border-t border-border pt-2 text-[10px] text-muted">
      <label className="flex items-center justify-between gap-2"><span>Transparent background</span><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} className="accent-[var(--accent)]" /></label>
      <label className="flex items-center justify-between gap-2"><span>PNG quality</span><select value={scale} onChange={(event) => setScale(Number(event.target.value) as 1 | 2)} className="h-6 rounded border border-border bg-background px-1"><option value={1}>1×</option><option value={2}>2×</option></select></label>
      <label className={`flex items-center justify-between gap-2 ${hasSelection ? "" : "opacity-40"}`}><span>Selection only</span><input type="checkbox" disabled={!hasSelection} checked={selectionOnly && hasSelection} onChange={(event) => setSelectionOnly(event.target.checked)} className="accent-[var(--accent)]" /></label>
    </div>
  </div>;
}
